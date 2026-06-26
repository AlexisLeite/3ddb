export const cityStatsQuery = `
  select count(*)::int as features
  from citydb.feature;
`;

export const datasetBoundsQuery = `
  with transformed_bounds as (
    select ST_Transform(f.envelope, 4326) as envelope
    from citydb.feature f
    where f.envelope is not null
  )
  select
    min(ST_XMin(Box3D(envelope)))::float8 as "minLon",
    min(ST_YMin(Box3D(envelope)))::float8 as "minLat",
    min(ST_ZMin(Box3D(envelope)))::float8 as "minZ",
    max(ST_XMax(Box3D(envelope)))::float8 as "maxLon",
    max(ST_YMax(Box3D(envelope)))::float8 as "maxLat",
    max(ST_ZMax(Box3D(envelope)))::float8 as "maxZ"
  from transformed_bounds
  where ST_XMin(Box3D(envelope)) between -180 and 180
    and ST_XMax(Box3D(envelope)) between -180 and 180
    and ST_YMin(Box3D(envelope)) between -90 and 90
    and ST_YMax(Box3D(envelope)) between -90 and 90;
`;

export const surfaceQuery = `
  with query_window as (
    select ST_Transform(ST_MakeEnvelope($3, $4, $5, $6, 4326), 2263) as geom
  ),
  limited_geoms as (
    select
      p.val_lod as lod,
      p.name as property_name,
      gd.id as geometry_id,
      f.id as feature_id,
      f.objectid,
      oc.classname,
      ST_Transform(gd.geometry, 4326) as geometry
    from citydb.property p
    join citydb.geometry_data gd on gd.id = p.val_geometry_id
    join citydb.feature f on f.id = p.feature_id
    join citydb.objectclass oc on oc.id = f.objectclass_id
    where p.val_lod = $1
      and gd.geometry is not null
      and gd.geometry && (select geom from query_window)
      and ST_Intersects(gd.geometry, (select geom from query_window))
      and (
        $8::text = 'none'
        or ($8::text = 'featureIds' and f.id = any($9::bigint[]))
        or ($8::text = 'geometryIds' and gd.id = any($9::bigint[]))
      )
    order by f.id, gd.id
    limit $2
  ),
  polygon_geoms as (
    select
      limited_geoms.geometry_id,
      limited_geoms.feature_id,
      limited_geoms.objectid,
      limited_geoms.classname,
      limited_geoms.lod,
      limited_geoms.property_name,
      dumped.geom
    from limited_geoms
    cross join lateral ST_Dump(limited_geoms.geometry) as dumped
    where ST_GeometryType(dumped.geom) = 'ST_Polygon'
  )
  select
    geometry_id,
    feature_id,
    objectid,
    classname,
    lod,
    property_name,
    ST_AsGeoJSON(ST_Scale(geom, 1, 1, $7), 7, 0)::json as geojson
  from polygon_geoms
  order by feature_id, geometry_id;
`;
