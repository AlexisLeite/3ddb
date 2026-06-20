import { ShapeUtils, Vector2, Vector3 } from "three";
import type { ServerConfig } from "../config/ServerConfig.js";
import type { LocalFrame } from "../domain/LocalFrame.js";
import type { Surface } from "../domain/Surface.js";
import { geodeticToEcef } from "./geodeticToEcef.js";
import type { Mesh } from "./types/Mesh.js";

function isValidPosition(position: number[]): boolean {
  return (
    Array.isArray(position) &&
    position.length >= 2 &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    Number.isFinite(position[2] ?? 0) &&
    Math.abs(position[0]) <= 180 &&
    Math.abs(position[1]) <= 90
  );
}

function positionsEqual(a: number[], b: number[]): boolean {
  return (
    Math.abs(a[0] - b[0]) < 0.000000001 &&
    Math.abs(a[1] - b[1]) < 0.000000001 &&
    Math.abs((a[2] ?? 0) - (b[2] ?? 0)) < 0.000001
  );
}

function normalizedRing(ring: number[][]): number[][] | null {
  if (!Array.isArray(ring)) return null;

  const positions = ring.filter(isValidPosition);
  if (positions.length < 4) return null;

  if (positionsEqual(positions[0], positions.at(-1) as number[])) {
    positions.pop();
  }

  const uniquePositions = new Set(
    positions.map(([lon, lat, z = 0]) => `${lon.toFixed(9)},${lat.toFixed(9)},${z.toFixed(4)}`),
  );

  return uniquePositions.size >= 3 ? positions : null;
}

function classifySurface(surface: Surface): string {
  const className = String(surface.className || "").toLowerCase();
  const objectId = String(surface.objectId || "").toLowerCase();
  const value = `${className} ${objectId}`;

  if (value.includes("roof")) return "roof";
  if (value.includes("wall")) return "wall";
  if (value.includes("floor") || value.includes("ceiling") || value.includes("ground")) {
    return "floor";
  }
  if (value.includes("window") || value.includes("door")) return "opening";
  if (value.includes("road") || value.includes("traffic") || value.includes("intersection")) {
    return "road";
  }

  return "other";
}

function enuPointFromPosition(
  position: number[],
  frame: LocalFrame,
  surfaceOffsetMeters = 0,
): Vector3 {
  const height = (position[2] || 0) + frame.verticalOffsetMeters + surfaceOffsetMeters;
  const ecef = geodeticToEcef(position[0], position[1], height);
  const delta = ecef.sub(frame.origin);

  return new Vector3(delta.dot(frame.east), delta.dot(frame.north), delta.dot(frame.up));
}

function gltfPointFromEnu(point: Vector3): Vector3 {
  return new Vector3(point.x, point.z, -point.y);
}

function newellNormal(points: Vector3[]): Vector3 {
  const normal = new Vector3();
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }
  return normal.normalize();
}

function projectPolygon(points: Vector3[]): Vector2[] {
  const normal = newellNormal(points);
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);

  if (ax >= ay && ax >= az) return points.map((point) => new Vector2(point.y, point.z));
  if (ay >= ax && ay >= az) return points.map((point) => new Vector2(point.x, point.z));
  return points.map((point) => new Vector2(point.x, point.y));
}

function pushTriangle(
  mesh: Pick<Mesh, "vertices" | "normals" | "colors" | "batchIds">,
  batchId: number,
  color: number[],
  a: Vector3,
  b: Vector3,
  c: Vector3,
): void {
  const edgeA = new Vector3().subVectors(b, a);
  const edgeB = new Vector3().subVectors(c, a);
  const normal = new Vector3().crossVectors(edgeA, edgeB);
  if (normal.lengthSq() > 0) normal.normalize();
  else normal.set(0, 1, 0);

  for (const point of [a, b, c]) {
    mesh.vertices.push(point.x, point.y, point.z);
    mesh.normals.push(normal.x, normal.y, normal.z);
    mesh.colors.push(...color);
    mesh.batchIds.push(batchId);
  }
}

function pushLineSegment(
  vertices: number[],
  colors: number[],
  color: number[],
  a: Vector3,
  b: Vector3,
): void {
  for (const point of [a, b]) {
    vertices.push(point.x, point.y, point.z);
    colors.push(...color);
  }
}

/**
 * Converts loaded polygon surfaces into triangle and outline buffers with
 * batch metadata ready for b3dm serialization.
 */
export function meshFromSurfaces(surfaces: Surface[], frame: LocalFrame, config: ServerConfig): Mesh {
  const mesh: Mesh = {
    vertices: [],
    normals: [],
    colors: [],
    batchIds: [],
    lineVertices: [],
    lineColors: [],
    lineBatchIds: [],
    batches: [],
    skipped: 0,
    vertexCount: 0,
    lineVertexCount: 0,
  };

  for (const surface of surfaces) {
    const surfaceType = classifySurface(surface);
    const surfaceColor = config.tiles.vertexColors[surfaceType] || config.tiles.vertexColors.other;
    const surfaceOffsetMeters = surfaceType === "floor" ? config.tiles.groundSurfaceOffsetMeters : 0;
    const rings = (surface.rings || []).map(normalizedRing).filter((ring): ring is number[][] => Boolean(ring));
    if (rings.length === 0) {
      mesh.skipped += 1;
      continue;
    }

    const enuRings = rings
      .map((ring) => ring.map((position) => enuPointFromPosition(position, frame, surfaceOffsetMeters)))
      .filter((ring) => ring.length >= 3);
    if (enuRings.length === 0) {
      mesh.skipped += 1;
      continue;
    }

    const triangles = ShapeUtils.triangulateShape(
      projectPolygon(enuRings[0]),
      enuRings.slice(1).map(projectPolygon),
    );
    if (triangles.length === 0) {
      mesh.skipped += 1;
      continue;
    }

    const batchId = mesh.batches.length;
    const gltfRings = enuRings.map((ring) => ring.map(gltfPointFromEnu));
    const points = gltfRings.flat();
    mesh.batches.push({ ...surface, surfaceType });

    for (const triangle of triangles) {
      pushTriangle(
        mesh,
        batchId,
        surfaceColor,
        points[triangle[0]],
        points[triangle[1]],
        points[triangle[2]],
      );
    }

    if (config.tiles.renderEdges) {
      const gltfLineRings = enuRings.map((ring) =>
        ring.map((point) =>
          gltfPointFromEnu(new Vector3(point.x, point.y, point.z + config.tiles.edgeOffsetMeters)),
        ),
      );
      for (const ring of gltfLineRings) {
        for (let index = 0; index < ring.length; index += 1) {
          pushLineSegment(
            mesh.lineVertices,
            mesh.lineColors,
            config.tiles.vertexColors.edge,
            ring[index],
            ring[(index + 1) % ring.length],
          );
        }
      }
    }
  }

  if (mesh.vertices.length === 0) {
    throw new Error("The selected area returned no renderable polygon surfaces.");
  }

  if (mesh.lineVertices.length > 0) {
    const edgeBatchId = mesh.batches.length;
    mesh.batches.push({
      partId: "outline",
      geometryId: 0,
      featureId: 0,
      objectId: "outline",
      className: "Outline",
      lod: config.nyc.lod,
      property: "outline",
      surfaceType: "edge",
    });
    mesh.lineBatchIds = Array(mesh.lineVertices.length / 3).fill(edgeBatchId);
  }
  mesh.vertexCount = mesh.vertices.length / 3;
  mesh.lineVertexCount = mesh.lineVertices.length / 3;
  return mesh;
}
