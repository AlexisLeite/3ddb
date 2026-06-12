import type { PointOfInterest } from "../gallery/PointOfInterest.js";

/**
 * Builds a deterministic walking-order approximation for gallery points using
 * nearest-neighbor initialization and a small 2-opt pass to remove crossings.
 */
export class RoutePlanner {
  /**
   * Returns points ordered as a coherent route without mutating source data,
   * keeping the gallery JSON format separate from route presentation concerns.
   */
  plan(points: PointOfInterest[]): PointOfInterest[] {
    if (points.length <= 2) return [...points];

    return this.improveWithTwoOpt(this.nearestNeighbor(points));
  }

  private nearestNeighbor(points: PointOfInterest[]): PointOfInterest[] {
    const remaining = [...points];
    const route = [remaining.splice(this.startIndex(remaining), 1)[0]];

    while (remaining.length > 0) {
      const current = route.at(-1) as PointOfInterest;
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      for (let index = 0; index < remaining.length; index += 1) {
        const distance = this.distanceMeters(current, remaining[index]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }
      route.push(remaining.splice(nearestIndex, 1)[0]);
    }

    return route;
  }

  private startIndex(points: PointOfInterest[]): number {
    return points.reduce((bestIndex, point, index) => {
      const bestPoint = points[bestIndex];
      const pointScore = point.longitude * 100 + point.latitude;
      const bestScore = bestPoint.longitude * 100 + bestPoint.latitude;
      return pointScore < bestScore ? index : bestIndex;
    }, 0);
  }

  private improveWithTwoOpt(points: PointOfInterest[]): PointOfInterest[] {
    let route = [...points];
    let improved = true;

    while (improved) {
      improved = false;
      for (let left = 1; left < route.length - 2; left += 1) {
        for (let right = left + 1; right < route.length - 1; right += 1) {
          const currentDistance =
            this.distanceMeters(route[left - 1], route[left]) +
            this.distanceMeters(route[right], route[right + 1]);
          const swappedDistance =
            this.distanceMeters(route[left - 1], route[right]) +
            this.distanceMeters(route[left], route[right + 1]);

          if (swappedDistance < currentDistance) {
            route = [
              ...route.slice(0, left),
              ...route.slice(left, right + 1).reverse(),
              ...route.slice(right + 1),
            ];
            improved = true;
          }
        }
      }
    }

    return route;
  }

  private distanceMeters(left: PointOfInterest, right: PointOfInterest): number {
    const latitude = ((left.latitude + right.latitude) / 2) * (Math.PI / 180);
    const lonMeters = (right.longitude - left.longitude) * 111320 * Math.cos(latitude);
    const latMeters = (right.latitude - left.latitude) * 111320;
    return Math.hypot(lonMeters, latMeters);
  }
}
