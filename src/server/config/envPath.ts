import { isAbsolute, join } from "node:path";

/**
 * Reads a path environment variable and resolves relative values from the
 * repository root so runtime file locations are deterministic.
 */
export function envPath(rootDir: string, name: string, fallbackPath: string): string {
  const value = process.env[name] || fallbackPath;
  return isAbsolute(value) ? value : join(rootDir, value);
}
