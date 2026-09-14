import { BLOCKS, type BlockId } from "./blocks";
import { isWithinWorldBounds, type SavedWorld } from "./world";

export const MAX_SAVE_BYTES = 8 * 1024 * 1024;

/** Accept the original unversioned format; reject incompatible/corrupt saves. */
export function decodeSave(raw: string, seed: string): SavedWorld {
  if (raw.length > MAX_SAVE_BYTES) throw new Error("Save too large");
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid save");
  const value = data as Record<string, unknown>;
  if (value.seed !== seed || !Array.isArray(value.edits) ||
      value.edits.length > 65025 ||
      (value.version !== undefined && value.version !== 1)) throw new Error("Invalid save");
  const edits = new Map<string, BlockId | null>();
  for (const entry of value.edits) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") {
      throw new Error("Invalid edit");
    }
    const [key, block] = entry;
    const coords = key.split(",").map(Number);
    if (coords.length !== 3 ||
        !isWithinWorldBounds(coords[0], coords[1], coords[2]) ||
        coords.join(",") !== key ||
        (block !== null && (typeof block !== "string" ||
          !Object.prototype.hasOwnProperty.call(BLOCKS, block)))) throw new Error("Invalid edit");
    if (coords[1] !== 0) edits.set(key, block as BlockId | null);
  }
  return {
    seed,
    edits: [...edits],
    time: typeof value.time === "number" && Number.isFinite(value.time)
      ? ((value.time % 1) + 1) % 1 : 0.32,
    elapsed: typeof value.elapsed === "number" && Number.isFinite(value.elapsed)
      ? Math.max(0, Math.min(value.elapsed, Number.MAX_SAFE_INTEGER)) : 0,
    player: value.player && typeof value.player === "object" && !Array.isArray(value.player)
      ? value.player as SavedWorld["player"] : undefined,
  };
}
