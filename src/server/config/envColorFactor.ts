function hexColorToRgb(color: string): [number, number, number] | null {
  const normalized = color.trim().replace(/^#/, "");
  if (!/^[\da-f]{6}$/i.test(normalized)) return null;
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  ];
}

/**
 * Reads a hex color and alpha pair from environment variables and returns the
 * normalized RGBA factor expected by glTF material and vertex color settings.
 */
export function envColorFactor(
  colorName: string,
  colorFallback: string,
  alphaName: string,
  alphaFallback: number,
): number[] {
  const color = process.env[colorName] || colorFallback;
  const rgb = hexColorToRgb(color) || hexColorToRgb(colorFallback) || [1, 1, 1];
  const alpha = Number(process.env[alphaName]);
  return [...rgb, Number.isFinite(alpha) ? alpha : alphaFallback];
}
