import { Vector3 } from "three";

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/**
 * Converts longitude, latitude and height into Earth-centered Earth-fixed
 * coordinates for local frame construction and mesh vertex placement.
 */
export function geodeticToEcef(lon: number, lat: number, height = 0): Vector3 {
  const longitude = degreesToRadians(lon);
  const latitude = degreesToRadians(lat);
  const semiMajorAxis = 6378137.0;
  const flattening = 1 / 298.257223563;
  const eccentricitySquared = flattening * (2 - flattening);
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinLon = Math.sin(longitude);
  const cosLon = Math.cos(longitude);
  const normal = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * sinLat * sinLat);

  return new Vector3(
    (normal + height) * cosLat * cosLon,
    (normal + height) * cosLat * sinLon,
    (normal * (1 - eccentricitySquared) + height) * sinLat,
  );
}
