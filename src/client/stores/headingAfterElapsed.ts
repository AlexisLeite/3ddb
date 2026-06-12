/**
 * Advances an orbital heading by elapsed time and wraps it to a full turn so
 * camera loops can run continuously without unbounded angle growth.
 */
export function headingAfterElapsed(
  heading: number,
  elapsedMs: number,
  radiansPerMs: number,
): number {
  return (heading + elapsedMs * radiansPerMs) % (Math.PI * 2);
}
