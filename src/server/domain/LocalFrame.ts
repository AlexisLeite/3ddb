import type { Vector3 } from "three";
import type { Bounds } from "./Bounds.js";

/**
 * Describes the local east-north-up coordinate frame used to place geographic
 * surface coordinates into a generated 3D Tiles payload.
 */
export interface LocalFrame {
  bounds: Bounds;
  lon: number;
  lat: number;
  origin: Vector3;
  east: Vector3;
  north: Vector3;
  up: Vector3;
  verticalOffsetMeters: number;
  transform: number[];
}
