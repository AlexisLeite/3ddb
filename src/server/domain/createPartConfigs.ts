import type { CityPart } from "./CityPart.js";

/**
 * Creates the configured list of NYC delivery area descriptors before database
 * import metadata is merged into the static part definitions.
 */
export function createPartConfigs(partCount: number, lod: string, verticalScale: number): CityPart[] {
  return Array.from({ length: partCount }, (_, index) => {
    const number = index + 1;
    return {
      id: `NYC_DA${number}`,
      label: `DA${number}`,
      detail: `New York City delivery area ${number}`,
      version: "CityGML 2.0",
      lod,
      verticalScale,
      imported: false,
      bounds: null,
      stats: {
        features: 0,
        buildings: 0,
        lods: [],
      },
    };
  });
}
