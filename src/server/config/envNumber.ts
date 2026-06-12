/**
 * Reads a numeric environment variable and returns the fallback whenever the
 * configured value cannot be parsed as a finite number.
 */
export function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}
