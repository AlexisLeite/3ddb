import type { PointOfInterest } from "../gallery/PointOfInterest.js";

/**
 * Builds the synthetic point used as the center target for presentation orbit
 * before the guided tour focuses on a concrete point of interest.
 */
export function presentationCenter(longitude: number, latitude: number): PointOfInterest {
  return {
    id: "presentation-center",
    name: "Presentation center",
    imageUrl: "",
    imageUrls: [],
    latitude,
    longitude,
    address: "",
    summary: "",
  };
}
