/**
 * Stores a Cesium camera pose in world coordinates so animations can blend
 * from the exact current view toward computed orbit destinations.
 */
export interface CameraView {
  destination: any;
  direction: any;
  up: any;
}
