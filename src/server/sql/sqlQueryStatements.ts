/**
 * Groups the SQL fragments used by the query preview service so the service
 * class can stay focused on validation, execution and response shaping.
 */
export const sqlQueryStatements = {
  wherePreviewColumns: [
    "feature_id",
    "geometry_id",
    "objectid",
    "classname",
    "property_name",
    "lod",
    "height_m",
    "area_m2",
    "height_rank",
    "area_rank",
  ],

  selectPreviewSql(sql: string, limit: number): string {
    return `select * from (${sql}) as user_query limit ${limit}`;
  },

  selectCountSql(sql: string): string {
    return `select count(*) as total_row_count from (${sql}) as user_query`;
  },

  wherePreviewSql(whereSql: string): string {
    return `
      with building_metric_base as (
        select
          f.id as feature_id,
          greatest(
            0,
            (coalesce(ST_ZMax(Box3D(f.envelope)), 0) - coalesce(ST_ZMin(Box3D(f.envelope)), 0)) * $2
          )::float8 as height_m,
          (ST_Area(ST_Envelope(f.envelope)) * $2 * $2)::float8 as area_m2
        from citydb.feature f
        where f.envelope is not null
      ),
      bm as (
        select
          feature_id,
          height_m,
          area_m2,
          dense_rank() over (order by height_m desc nulls last)::int as height_rank,
          dense_rank() over (order by area_m2 desc nulls last)::int as area_rank
        from building_metric_base
      )
      select distinct on (f.id)
        f.id::text as feature_id,
        gd.id::text as geometry_id,
        f.objectid,
        oc.classname,
        p.name as property_name,
        p.val_lod as lod,
        round(bm.height_m::numeric, 2)::float8 as height_m,
        round(bm.area_m2::numeric, 2)::float8 as area_m2,
        bm.height_rank,
        bm.area_rank
      from citydb.property p
      join citydb.geometry_data gd on gd.id = p.val_geometry_id
      join citydb.feature f on f.id = p.feature_id
      join citydb.objectclass oc on oc.id = f.objectclass_id
      left join bm on bm.feature_id = f.id
      where p.val_lod = $1
        and gd.geometry is not null
        and (${whereSql})
      order by f.id, gd.id
      limit $3;
    `;
  },

  whereCountSql(whereSql: string): string {
    return `
      with building_metric_base as (
        select
          f.id as feature_id,
          greatest(
            0,
            (coalesce(ST_ZMax(Box3D(f.envelope)), 0) - coalesce(ST_ZMin(Box3D(f.envelope)), 0)) * $2
          )::float8 as height_m,
          (ST_Area(ST_Envelope(f.envelope)) * $2 * $2)::float8 as area_m2
        from citydb.feature f
        where f.envelope is not null
      ),
      bm as (
        select
          feature_id,
          height_m,
          area_m2,
          dense_rank() over (order by height_m desc nulls last)::int as height_rank,
          dense_rank() over (order by area_m2 desc nulls last)::int as area_rank
        from building_metric_base
      )
      select count(*) as total_row_count
      from (
        select distinct on (f.id)
          f.id as feature_id,
          gd.id as geometry_id
        from citydb.property p
        join citydb.geometry_data gd on gd.id = p.val_geometry_id
        join citydb.feature f on f.id = p.feature_id
        join citydb.objectclass oc on oc.id = f.objectclass_id
        left join bm on bm.feature_id = f.id
        where p.val_lod = $1
          and gd.geometry is not null
          and (${whereSql})
        order by f.id, gd.id
      ) as matching_rows;
    `;
  },
};
