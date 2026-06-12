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

function emptyGlb(): Buffer {
  const json = {
    asset: {
      version: "2.0",
      generator: "citygml-lod3-viewer empty 3D Tiles cell",
    },
    scene: 0,
    scenes: [{ nodes: [] }],
  };
  const jsonChunk = padBuffer(Buffer.from(JSON.stringify(json), "utf8"), 4, 0x20);
  const byteLength = 12 + 8 + jsonChunk.length;
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(byteLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  return Buffer.concat([header, jsonHeader, jsonChunk]);
}

/**
 * Builds an empty b3dm payload for valid tile cells that contain no renderable
 * surfaces, allowing Cesium traversal to continue without errors.
 */
export function emptyB3dm(): Buffer {
  const featureTableJson = Buffer.from(JSON.stringify({ BATCH_LENGTH: 0 }), "utf8");
  const batchTableJson = Buffer.from("{}", "utf8");
  const headerLength = 28;
  const paddedFeatureTableJson = padBufferForOffset(featureTableJson, headerLength, 8, 0x20);
  const paddedBatchTableJson = padBufferForOffset(
    batchTableJson,
    headerLength + paddedFeatureTableJson.length,
    8,
    0x20,
  );
  const glb = emptyGlb();
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
