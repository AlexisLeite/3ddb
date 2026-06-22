export const cityStatsQuery = `
  select
    coalesce(f.lineage, 'NYC_DA1') as id,
    count(*)::int as features
  from citydb.feature f
  where f.lineage like 'NYC_DA%' or f.lineage is null
  group by coalesce(f.lineage, 'NYC_DA1')
  order by coalesce(f.lineage, 'NYC_DA1');
`;

export const partBoundsQuery = `
  with transformed_bounds as (
    select
      coalesce(f.lineage, 'NYC_DA1') as id,
      ST_Transform(f.envelope, 4326) as envelope
    from citydb.feature f
    where (f.lineage like 'NYC_DA%' or f.lineage is null)
      and f.envelope is not null
  )
  select
    id,
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
    and ST_YMax(Box3D(envelope)) between -90 and 90
  group by id
  order by id;
`;

export const surfaceQuery = `
  with requested_parts as (
    select unnest($1::text[]) as lineage
  ),
  query_window as (
    select ST_Transform(ST_MakeEnvelope($4, $5, $6, $7, 4326), 2263) as geom
  ),
  limited_geoms as (
    select
      selected.lineage,
      selected.lod,
      selected.property_name,
      selected.geometry_id,
      selected.feature_id,
      selected.objectid,
      selected.classname,
      selected.geometry
    from requested_parts rp
    join lateral (
      select
        coalesce(f.lineage, 'NYC_DA1') as lineage,
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
      where coalesce(f.lineage, 'NYC_DA1') = rp.lineage
        and p.val_lod = $2
        and gd.geometry is not null
        and gd.geometry && (select geom from query_window)
        and ST_Intersects(gd.geometry, (select geom from query_window))
        and (
          $9::text = 'none'
          or ($9::text = 'featureIds' and f.id = any($10::bigint[]))
          or ($9::text = 'geometryIds' and gd.id = any($10::bigint[]))
        )
      order by f.id, gd.id
      limit $3
    ) selected on true
  ),
  polygon_geoms as (
    select
      limited_geoms.lineage,
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
    lineage,
    geometry_id,
    feature_id,
    objectid,
    classname,
    lod,
    property_name,
    ST_AsGeoJSON(ST_Scale(geom, 1, 1, $8), 7, 0)::json as geojson
  from polygon_geoms
  order by lineage, feature_id, geometry_id;
`;
