/**
 * Reads an integer environment variable and falls back when the configured
 * value is missing, fractional or otherwise not a valid integer.
 */
export function envInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? value : fallback;
}
