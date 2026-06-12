import type { ServerConfig } from "../../config/ServerConfig.js";
import type { Mesh } from "../types/Mesh.js";
import type { MeshBatch } from "../types/MeshBatch.js";

function vectorBounds(values: number[], itemSize: number): { min: number[]; max: number[] } {
  const min = Array.from({ length: itemSize }, () => Infinity);
  const max = Array.from({ length: itemSize }, () => -Infinity);

  for (let index = 0; index < values.length; index += itemSize) {
    for (let axis = 0; axis < itemSize; axis += 1) {
      const value = values[index + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }

  return { min, max };
}

function floatBuffer(values: number[]): Buffer {
  const array = new Float32Array(values);
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

function padBuffer(buffer: Buffer, alignment: number, padByte: number): Buffer {
  const padding = (alignment - (buffer.length % alignment)) % alignment;
  return padding === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(padding, padByte)]);
}

function padBufferForOffset(
  buffer: Buffer,
  offset: number,
  alignment: number,
  padByte: number,
): Buffer {
  const padding = (alignment - ((offset + buffer.length) % alignment)) % alignment;
  return padding === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(padding, padByte)]);
}

function glbFromMesh(mesh: Mesh, config: ServerConfig): Buffer {
  const positionBuffer = floatBuffer(mesh.vertices);
  const normalBuffer = floatBuffer(mesh.normals);
  const colorBuffer = floatBuffer(mesh.colors);
  const batchIdBuffer = floatBuffer(mesh.batchIds);
  const linePositionBuffer = floatBuffer(mesh.lineVertices);
  const lineColorBuffer = floatBuffer(mesh.lineColors);
  const lineBatchIdBuffer = floatBuffer(mesh.lineBatchIds);
  const normalOffset = positionBuffer.length;
  const colorOffset = normalOffset + normalBuffer.length;
  const batchIdOffset = colorOffset + colorBuffer.length;
  const linePositionOffset = batchIdOffset + batchIdBuffer.length;
  const lineColorOffset = linePositionOffset + linePositionBuffer.length;
  const lineBatchIdOffset = lineColorOffset + lineColorBuffer.length;
  const binaryBuffer = Buffer.concat([
    positionBuffer,
    normalBuffer,
    colorBuffer,
    batchIdBuffer,
    linePositionBuffer,
    lineColorBuffer,
    lineBatchIdBuffer,
  ]);
  const positionBounds = vectorBounds(mesh.vertices, 3);
  const linePositionBounds = vectorBounds(mesh.lineVertices, 3);

  const json = {
    asset: {
      version: "2.0",
      generator: "citygml-lod3-viewer dynamic 3D Tiles",
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
              COLOR_0: 2,
              _BATCHID: 3,
            },
            material: 0,
            mode: 4,
          },
          {
            attributes: {
              POSITION: 4,
              COLOR_0: 5,
              _BATCHID: 6,
            },
            material: 1,
            mode: 1,
          },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: config.tiles.baseColorFactor,
          metallicFactor: 0,
          roughnessFactor: 0.85,
        },
        doubleSided: true,
      },
      {
        pbrMetallicRoughness: {
          baseColorFactor: config.tiles.vertexColors.edge,
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        emissiveFactor: config.tiles.vertexColors.edge.slice(0, 3),
      },
    ],
    buffers: [{ byteLength: binaryBuffer.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: normalOffset, byteLength: normalBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: colorOffset, byteLength: colorBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: batchIdOffset, byteLength: batchIdBuffer.length, target: 34962 },
      {
        buffer: 0,
        byteOffset: linePositionOffset,
        byteLength: linePositionBuffer.length,
        target: 34962,
      },
      { buffer: 0, byteOffset: lineColorOffset, byteLength: lineColorBuffer.length, target: 34962 },
      {
        buffer: 0,
        byteOffset: lineBatchIdOffset,
        byteLength: lineBatchIdBuffer.length,
        target: 34962,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: mesh.vertexCount,
        type: "VEC3",
        min: positionBounds.min,
        max: positionBounds.max,
      },
      { bufferView: 1, byteOffset: 0, componentType: 5126, count: mesh.vertexCount, type: "VEC3" },
      { bufferView: 2, byteOffset: 0, componentType: 5126, count: mesh.vertexCount, type: "VEC4" },
      { bufferView: 3, byteOffset: 0, componentType: 5126, count: mesh.vertexCount, type: "SCALAR" },
      {
        bufferView: 4,
        byteOffset: 0,
        componentType: 5126,
        count: mesh.lineVertexCount,
        type: "VEC3",
        min: linePositionBounds.min,
        max: linePositionBounds.max,
      },
      {
        bufferView: 5,
        byteOffset: 0,
        componentType: 5126,
        count: mesh.lineVertexCount,
        type: "VEC4",
      },
      {
        bufferView: 6,
        byteOffset: 0,
        componentType: 5126,
        count: mesh.lineVertexCount,
        type: "SCALAR",
      },
    ],
  };

  const jsonChunk = padBuffer(Buffer.from(JSON.stringify(json), "utf8"), 4, 0x20);
  const binChunk = padBuffer(binaryBuffer, 4, 0x00);
  const byteLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(byteLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

function batchTableFromMesh(mesh: Mesh): Record<string, unknown[]> {
  const keys: (keyof MeshBatch)[] = [
    "partId",
    "geometryId",
    "featureId",
    "objectId",
    "className",
    "lod",
    "property",
    "surfaceType",
  ];
  return Object.fromEntries(
    keys.map((key) => [key, mesh.batches.map((batch) => batch[key])]),
  );
}

/**
 * Serializes a generated mesh and batch table into a b3dm payload compatible
 * with Cesium 3D Tiles dynamic content loading.
 */
export function b3dmFromMesh(mesh: Mesh, config: ServerConfig): Buffer {
  const featureTableJson = Buffer.from(JSON.stringify({ BATCH_LENGTH: mesh.batches.length }), "utf8");
  const batchTableJson = Buffer.from(JSON.stringify(batchTableFromMesh(mesh)), "utf8");
  const headerLength = 28;
  const paddedFeatureTableJson = padBufferForOffset(featureTableJson, headerLength, 8, 0x20);
  const paddedBatchTableJson = padBufferForOffset(
    batchTableJson,
    headerLength + paddedFeatureTableJson.length,
    8,
    0x20,
  );
  const glb = glbFromMesh(mesh, config);
  const byteLength =
    headerLength + paddedFeatureTableJson.length + paddedBatchTableJson.length + glb.length;
  const header = Buffer.alloc(headerLength);
  header.write("b3dm", 0);
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(byteLength, 8);
  header.writeUInt32LE(paddedFeatureTableJson.length, 12);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(paddedBatchTableJson.length, 20);
  header.writeUInt32LE(0, 24);

  return Buffer.concat([header, paddedFeatureTableJson, paddedBatchTableJson, glb]);
}
