/**
 * Pure Sudoku helpers. Everything here works on the backend's wire format directly: an 81-char
 * row-major string (index = row * 9 + col) where '0' is an empty cell.
 *
 * Because the backend hands the client the solution, validation and hints are local and instant.
 */

export const SIZE = 9;
export const CELLS = 81;

export const rowOf = (i: number): number => Math.floor(i / SIZE);
export const colOf = (i: number): number => i % SIZE;
export const boxOf = (i: number): number =>
  Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** Parses an 81-char board string into digits, with 0 for empty. */
export function parseGrid(board: string): number[] {
  if (board.length !== CELLS) {
    throw new Error(`Expected ${CELLS} characters, got ${board.length}`);
  }
  return Array.from(board, (ch) => ch.charCodeAt(0) - 48);
}

export function serializeGrid(grid: readonly number[]): string {
  return grid.join("");
}

/** Cell i is a given — a clue the player may not change — iff it was filled in the deal. */
export function isGiven(puzzle: string, i: number): boolean {
  return puzzle[i] !== "0";
}

/** The 20 cells sharing a row, column, or box with i. Precomputed once; peers never change. */
const PEERS: readonly (readonly number[])[] = Array.from({ length: CELLS }, (_, i) => {
  const peers: number[] = [];
  for (let j = 0; j < CELLS; j++) {
    if (j === i) continue;
    if (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i)) {
      peers.push(j);
    }
  }
  return peers;
});

export const peersOf = (i: number): readonly number[] => PEERS[i] ?? [];

/**
 * Cells holding a digit that repeats among their peers. This is *rule* validation — a cell can be
 * conflict-free and still wrong. Use `isSolved` for correctness.
 */
export function conflicts(grid: readonly number[]): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < CELLS; i++) {
    const digit = grid[i];
    if (!digit) continue;
    for (const j of peersOf(i)) {
      if (grid[j] === digit) {
        bad.add(i);
        bad.add(j);
      }
    }
  }
  return bad;
}

/** Cells whose digit disagrees with the solution. The strict check, only for an explicit "check". */
export function mistakes(grid: readonly number[], solution: string): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < CELLS; i++) {
    const digit = grid[i];
    if (digit && String(digit) !== solution[i]) bad.add(i);
  }
  return bad;
}

/**
 * Whether the grid matches the solution. The client can predict completion this way, but the
 * server's response to the save is what actually completes the board.
 */
export function isSolved(grid: readonly number[], solution: string): boolean {
  return serializeGrid(grid) === solution;
}

/** How many of each digit are placed — used to grey out a digit on the pad once all 9 are down. */
export function digitCounts(grid: readonly number[]): number[] {
  const counts = new Array<number>(10).fill(0);
  for (const digit of grid) counts[digit] = (counts[digit] ?? 0) + 1;
  return counts;
}

/** Formats elapsed seconds as m:ss, or h:mm:ss once it runs long. */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours ? String(minutes).padStart(2, "0") : String(minutes);
  return hours
    ? `${hours}:${mm}:${String(seconds).padStart(2, "0")}`
    : `${mm}:${String(seconds).padStart(2, "0")}`;
}
