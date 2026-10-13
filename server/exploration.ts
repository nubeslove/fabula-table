import type { Identity, Scene, World } from "../src/shared/types";
import {
  cellAt,
  cellCenter,
  explorationActors,
  explorationTurn,
  moveCost,
  nextExplorationTurn,
  remainingMoves,
  sceneGrid,
} from "../src/shared/exploration";
import * as v from "./validation";

function version(s: Scene, expected: unknown) {
  v.insist(
    s.revision === expected,
    "地图或回合已更新，请按当前状态重试。",
    409,
  );
}
function playable(w: World, s: Scene) {
  v.insist(s.mode === "map", "请先打开探索地图");
  v.insist(w.activeScene === s.id && s.public, "场景未开放", 403);
  v.insist(!w.battle.active, "请先结束冲突，再继续探索");
}
export function updateExploration(
  w: World,
  me: Identity,
  a: Record<string, unknown>,
  type: string,
) {
  const s = w.scenes.find((s) => s.id === v.id(a.scene));
  v.insist(s, "场景不存在");
  playable(w, s);
  version(s, a.expected);
  const turn = explorationTurn(s);
  if (type === "exploration.start") {
    v.insist(me.role === "gm", "此操作由 GM 执行", 403);
    v.insist(!turn.active, "探索已开始");
    const order = v.unique(v.list(a.order, v.id, 100));
    const eligible = new Set(
      explorationActors(s, w.characters).map((c) => c.id),
    );
    v.insist(
      order.length && order.every((id) => eligible.has(id)),
      "请选择已放置公开 Token 的角色",
    );
    s.exploration = {
      active: true,
      round: 1,
      order,
      current: order[0],
      spent: {},
    };
  } else if (type === "exploration.stop") {
    v.insist(me.role === "gm", "此操作由 GM 执行", 403);
    s.exploration = { ...turn, active: false };
  } else {
    v.insist(turn.active, "探索尚未开始");
    const c = w.characters.find((c) => c.id === turn.current);
    v.insist(
      me.role === "gm" || c?.owner === me.id,
      "只能结束自己的探索回合",
      403,
    );
    s.exploration = nextExplorationTurn(turn);
  }
  s.revision++;
}

/** Called only after the ordinary Token ownership/visibility checks. */
export function moveOnGrid(
  w: World,
  me: Identity,
  s: Scene,
  token: Scene["tokens"][number],
  a: Record<string, unknown>,
) {
  playable(w, s);
  version(s, a.expected);
  const grid = sceneGrid(s),
    turn = explorationTurn(s);
  const to = cellAt({ x: v.num(a.x, 0, 100), y: v.num(a.y, 0, 100) }, grid);
  const from = cellAt(token, grid),
    cost = moveCost(from, to, grid.diagonal);
  const adjust = a.adjust === undefined ? false : v.bool(a.adjust);
  v.insist(!adjust || me.role === "gm", "只有 GM 可以调整位置", 403);
  if (!(me.role === "gm" && (adjust || !turn.active))) {
    v.insist(turn.active, "等待 GM 开始探索");
    v.insist(turn.current === token.actor, "还没有轮到这个角色行动", 403);
    v.insist(!token.hidden, "Token 未开放", 403);
    v.insist(cost <= remainingMoves(s, token.actor), "本轮剩余移动格数不足");
    s.exploration = {
      ...turn,
      spent: {
        ...turn.spent,
        [token.actor]: (turn.spent[token.actor] ?? 0) + cost,
      },
    };
  }
  Object.assign(token, cellCenter(to, grid));
}

export function preserveExploration(old: Scene | undefined, next: Scene) {
  const active = old?.exploration?.active;
  if (old && active) {
    const tokenStructure = (s: Scene) =>
      s.tokens.map((t) => [t.id, t.actor, t.hidden]);
    v.insist(
      old.mode === next.mode &&
        JSON.stringify(sceneGrid(old)) === JSON.stringify(sceneGrid(next)) &&
        JSON.stringify(tokenStructure(old)) ===
          JSON.stringify(tokenStructure(next)),
      "请先结束此场景的探索，再修改网格、移动规则或 Token 名单",
    );
  }
  // Runtime state is never supplied by the scene editor, including on creation.
  next.exploration = old?.exploration
    ? structuredClone(old.exploration)
    : undefined;
  if (next.mode === "map") {
    const grid = sceneGrid(next);
    next.tokens = next.tokens.map((t) => ({
      ...t,
      ...cellCenter(cellAt(t, grid), grid),
    }));
  }
}

export function requireExplorationFinished(w: World, actor: string) {
  v.insist(
    !w.scenes.some(
      (s) => s.exploration?.active && s.exploration.order.includes(actor),
    ),
    "请先结束该角色参与的探索",
    409,
  );
}
