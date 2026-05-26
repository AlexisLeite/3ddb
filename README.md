# New York City 3D Viewer

This workspace uses the running `3dcitydb` Docker database as the source for
the web viewer.

## Imported Dataset

- Dataset: New York City delivery areas
- Format: CityGML 2.0
- LoD: 2
- Source files: `data/nycity/DA_WISE_GMLs/DA*_3D_Buildings_Merged.gml`
- Imported into: PostgreSQL container `3dcitydb`
- Database: `citydb`
- Schema: `citydb`
- Port from host: `localhost:5434`

Each delivery area is imported as its own lineage:

```text
NYC_DA1
NYC_DA2
...
NYC_DA20
```

The source coordinates are EPSG:2263. After import, the geometries and feature
envelopes are transformed to EPSG:4326 to match the database SRID. Heights are
kept from the source data and converted from feet to meters in the viewer.

## Verify Import

```powershell
docker exec 3dcitydb psql -U citydb -d citydb -c "select lineage, count(*) from citydb.feature where lineage like 'NYC_DA%' group by lineage order by lineage;"
```

## Agregar datos a 3DCityDB

Usa siempre las herramientas oficiales de 3DCityDB para poblar la base. No
insertes filas manualmente en `citydb.feature`, `citydb.property` o
`citydb.geometry_data`: el esquema esta normalizado y el importador se encarga
de crear features, propiedades, geometrias, relaciones, extents e indices de
forma consistente.

Este proyecto usa 3DCityDB v5. La herramienta oficial para importar/exportar es
`citydb-tool`. La forma mas simple en este workspace es ejecutarla como
contenedor Docker y conectarla al contenedor `3dcitydb` ya levantado.

Referencias oficiales:

- `citydb-tool`: https://docs.3dcitydb.org/1.1/citydb-tool/
- Importar CityGML: https://docs.3dcitydb.org/1.1/citydb-tool/import-citygml/
- Usar `citydb-tool` con Docker: https://docs.3dcitydb.org/1.1/citydb-tool/docker/

### 1. Verificar la herramienta oficial

```powershell
docker run --rm --network container:3dcitydb 3dcitydb/citydb-tool:1.3.1 --version
```

Para ver las opciones oficiales del importador CityGML:

```powershell
docker run --rm --network container:3dcitydb 3dcitydb/citydb-tool:1.3.1 import citygml --help
```

### 2. Preparar el archivo de entrada

Coloca el dataset en `data/imports`. El comando `import citygml` acepta archivos
CityGML `.gml`/`.xml`, archivos comprimidos `.gz`/`.gzip` y `.zip`. Para
CityJSON, usa el subcomando `import cityjson`.

Revisa el CRS del archivo antes de importarlo. Este visor consulta geometria con
ventanas EPSG:4326 (`lon/lat`), por lo que los datos deben quedar en EPSG:4326
para aparecer correctamente sobre el mapa. `citydb-tool` importa las coordenadas
que recibe; si el dataset esta en otro CRS, reproyectalo antes de importarlo o
adapta el visor/base para ese CRS.

Ejemplo:

```text
data/imports/my-layer.gml
```

### 3. Importar CityGML

El `lineage` identifica el conjunto importado y luego se usa para filtrarlo en
consultas. Para que esta app lo pueda listar sin tocar codigo, usa un lineage
del patron `NYC_DA*` y aumenta `NYC_PART_COUNT` en `.env` si corresponde. Por
ejemplo, para agregar una nueva parte `NYC_DA21`, define `NYC_PART_COUNT=21` y
usa `--lineage NYC_DA21`.

```powershell
docker run --rm -it `
  --network container:3dcitydb `
  -v "${PWD}\data\imports:/data" `
  3dcitydb/citydb-tool:1.3.1 import citygml `
  -H localhost `
  -P 5432 `
  -d citydb `
  -S citydb `
  -u citydb `
  -p changeMe `
  --lineage NYC_DA21 `
  --import-mode skip `
  --compute-extent `
  --index-mode drop_create `
  -- `
  /data/my-layer.gml
```

Notas:

- `--network container:3dcitydb` hace que `citydb-tool` vea la base en
  `localhost:5432`, dentro del mismo namespace de red del contenedor
  `3dcitydb`.
- `-S citydb` apunta al schema usado por esta app.
- `--lineage` es obligatorio para operar por capas en este visor.
- `--import-mode skip` evita duplicar features si vuelves a importar el mismo
  archivo.
- `--compute-extent` recalcula envelopes; este visor depende de esos bounds
  para listar, encuadrar y consultar partes.
- `--index-mode drop_create` puede acelerar cargas grandes porque recrea indices
  al final.
- El separador `--` evita que la ruta del archivo sea interpretada como valor de
  otra opcion.

### 4. Importar CityJSON

Si el dataset esta en CityJSON, cambia solo el subcomando:

```powershell
docker run --rm -it `
  --network container:3dcitydb `
  -v "${PWD}\data\imports:/data" `
  3dcitydb/citydb-tool:1.3.1 import cityjson `
  -H localhost `
  -P 5432 `
  -d citydb `
  -S citydb `
  -u citydb `
  -p changeMe `
  --lineage NYC_DA21 `
  --import-mode skip `
  --compute-extent `
  --index-mode drop_create `
  -- `
  /data/my-layer.city.json
```

### 5. Verificar la importacion

```powershell
docker exec 3dcitydb psql -U citydb -d citydb -c "select f.lineage, oc.classname, count(*) from citydb.feature f join citydb.objectclass oc on oc.id = f.objectclass_id where f.lineage = 'NYC_DA21' group by f.lineage, oc.classname order by count(*) desc;"
```

Tambien conviene verificar que haya geometrias LoD renderizables:

```powershell
docker exec 3dcitydb psql -U citydb -d citydb -c "select f.lineage, p.val_lod, count(*) from citydb.property p join citydb.feature f on f.id = p.feature_id where f.lineage = 'NYC_DA21' and p.val_geometry_id is not null group by f.lineage, p.val_lod order by f.lineage, p.val_lod;"
```

### 6. Hacer que aparezca en el visor

Despues de importar, reinicia el servidor Vite para que `.env` se vuelva a leer:

```powershell
npm run dev
```

Si usaste `NYC_DA21`, asegúrate de que `.env` tenga:

```env
NYC_PART_COUNT=21
```

Si quieres usar nombres de capas que no sigan el patron `NYC_DA*`, hay que
generalizar la configuracion del visor y la normalizacion de partes en
`vite.config.js`. La base puede contener esos datos, pero el panel actual solo
lista las partes configuradas.

## Web Viewer

```powershell
npm install
npm run dev
```

Configuration lives in `.env`. Server/API variables use plain names such as
`CITYDB_HOST`, `MAX_SURFACES_PER_RESPONSE`, and `CITYDB_HEIGHT_MODE`. Browser
variables use the `VITE_` prefix, for example `VITE_TILE_COLOR_ROOF`,
`VITE_TILE_ALPHA_ROOF`, and `VITE_SATELLITE_IMAGERY_URL`. Use `.env.example` as
the template for a fresh environment.

The Vite dev server exposes:

- `/api/citydb/cities`: lists the NYC delivery areas and import stats.
- `/api/citydb/surfaces?parts=NYC_DA1,NYC_DA2`: returns renderable LoD2 polygon
  surfaces for the selected parts.
- `/api/citydb/3dtiles/tileset.json?parts=NYC_DA4`: returns a dynamic 3D Tiles
  tileset backed by the 3DCityDB database.
- `/api/citydb/3dtiles/tile.b3dm?parts=NYC_DA4`: returns the batched 3D model
  tile generated from the selected 3DCityDB surfaces.

The 3DCityDB Web Map panel includes an editable `SQL WHERE` field. The condition
is applied only to the active selected parts and supports these query aliases:
`f` for `citydb.feature`, `p` for `citydb.property`, `gd` for
`citydb.geometry_data`, `oc` for `citydb.objectclass`, and `bm` for calculated
building metrics.

Example:

```sql
oc.classname = 'RoofSurface'
```

## Consultas de interes

Estas consultas son condiciones para pegar en el campo `SQL WHERE` del cliente.
No hace falta escribir `WHERE` ni cerrar con `;`. La seleccion activa de partes
siempre se aplica antes del filtro, asi que las condiciones solo refinan la capa
cargada. Estas condiciones devuelven edificios completos, no caras sueltas. La
altura esta expresada en metros. El area usa el area horizontal de la envolvente
del edificio. Si hay varias partes seleccionadas, los `top 100` se calculan por
parte.

1. Altura menor a 30 m:
   ```sql
   bm.height_m < 30
   ```

2. Altura mayor o igual a 30 m:
   ```sql
   bm.height_m >= 30
   ```

3. Area mayor a 1000 m2:
   ```sql
   bm.area_m2 > 1000
   ```

4. Top 100 mas altos:
   ```sql
   bm.height_rank <= 100
   ```

5. Top 100 de mayor area:
   ```sql
   bm.area_rank <= 100
   ```

The browser client renders the selected NYC parts with Three.js. The inspector
uses one checkbox per delivery area, so multiple parts can be loaded together.
The response is capped per request to keep the browser interactive.

The 3DCityDB Web Map view streams the same database content as 3D Tiles. The
database remains the source of truth, so query endpoints can be added later
against PostgreSQL/PostGIS without replacing the storage model.
