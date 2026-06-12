/**
 * Reads a comma-separated numeric environment variable and returns the fallback
 * list if any entry cannot be parsed as a finite number.
 */
export function envNumberList(name: string, fallback: number[]): number[] {
  const value = process.env[name];
  if (!value) return fallback;
  const numbers = value.split(",").map((part) => Number(part.trim()));
  return numbers.every(Number.isFinite) ? numbers : fallback;
}
