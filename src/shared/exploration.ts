import type {
  Character,
  ExplorationGrid,
  ExplorationTurn,
  Scene,
} from "./types";

export const DEFAULT_GRID: Readonly<ExplorationGrid> = {
  columns: 24,
  rows: 14,
  movePerRound: 6,
  diagonal: true,
};
export type Cell = { column: number; row: number };
export const sceneGrid = (s: Scene): ExplorationGrid =>
  s.grid ?? { ...DEFAULT_GRID };
export const idleExploration = (): ExplorationTurn => ({
  active: false,
  round: 1,
  order: [],
  current: "",
  spent: {},
});
export const explorationTurn = (s: Scene) => s.exploration ?? idleExploration();

export function cellAt(
  point: { x: number; y: number },
  grid: ExplorationGrid,
): Cell {
  return {
    column: Math.max(
      0,
      Math.min(grid.columns - 1, Math.floor((point.x * grid.columns) / 100)),
    ),
    row: Math.max(
      0,
      Math.min(grid.rows - 1, Math.floor((point.y * grid.rows) / 100)),
    ),
  };
}
export const cellCenter = (cell: Cell, grid: ExplorationGrid) => ({
  x: ((cell.column + 0.5) * 100) / grid.columns,
  y: ((cell.row + 0.5) * 100) / grid.rows,
});
export function moveCost(from: Cell, to: Cell, diagonal: boolean) {
  const dx = Math.abs(to.column - from.column),
    dy = Math.abs(to.row - from.row);
  return diagonal ? Math.max(dx, dy) : dx + dy;
}
/** A predictable preview only: terrain and passage remain GM decisions. */
export function cellPath(from: Cell, to: Cell, diagonal: boolean): Cell[] {
  const path = [{ ...from }];
  let { column, row } = from;
  while (column !== to.column || row !== to.row) {
    const dx = Math.sign(to.column - column),
      dy = Math.sign(to.row - row);
    column += dx;
    if (diagonal || !dx) row += dy;
    path.push({ column, row });
  }
  return path;
}
export function explorationActors(scene: Scene, characters: Character[]) {
  const ids = new Set(
    scene.tokens.filter((t) => !t.hidden).map((t) => t.actor),
  );
  return characters.filter((c) => c.public && ids.has(c.id));
}
export const remainingMoves = (s: Scene, actor: string) =>
  Math.max(
    0,
    sceneGrid(s).movePerRound - (explorationTurn(s).spent[actor] ?? 0),
  );

export function nextExplorationTurn(turn: ExplorationTurn): ExplorationTurn {
  const index = turn.order.indexOf(turn.current) + 1;
  const nextRound = index >= turn.order.length;
  return {
    ...turn,
    round: turn.round + (nextRound ? 1 : 0),
    current: turn.order[nextRound ? 0 : index],
    spent: nextRound ? {} : { ...turn.spent },
  };
}
