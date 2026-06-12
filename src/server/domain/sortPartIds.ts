/**
 * Sorts NYC delivery area ids by their numeric suffix so API requests and
 * tileset generation remain deterministic across callers.
 */
export function sortPartIds(ids: string[]): string[] {
  return [...ids].sort((left, right) => {
    const leftNumber = Number(left.replace("NYC_DA", ""));
    const rightNumber = Number(right.replace("NYC_DA", ""));
    return leftNumber - rightNumber;
  });
}
