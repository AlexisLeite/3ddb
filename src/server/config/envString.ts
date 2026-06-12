/**
 * Reads a string environment variable and returns the fallback when the variable
 * is unset or resolves to an empty value.
 */
export function envString(name: string, fallback: string): string {
  return process.env[name] || fallback;
}
