import { useEffect, useState } from "react";
import type { Command, Scene, Session, Token } from "../shared/types";
import {
  cellAt,
  cellCenter,
  explorationActors,
  explorationTurn,
  moveCost,
  remainingMoves,
  sceneGrid,
} from "../shared/exploration";
import type { Cell } from "../shared/exploration";
import { ExplorationBoard } from "./ExplorationBoard";
import { Modal } from "./Common";
import "../styles/exploration.css";

export function ExplorationMap({
  session: { world, me },
  scene,
  urls,
  act,
  prepare,
  error,
}: {
  session: Session;
  scene: Scene;
  urls: Record<string, string>;
  act: (command: Command) => Promise<boolean>;
  prepare: () => void;
  error: string;
}) {
  const gm = me.role === "gm",
    turn = explorationTurn(scene),
    grid = sceneGrid(scene);
  const [selected, select] = useState(""),
    [adjust, setAdjust] = useState(false);
  const [manager, setManager] = useState(false),
    [pending, setPending] = useState(false),
    [hint, setHint] = useState("");
  const activeActor = world.characters.find((c) => c.id === turn.current);
  const chosen = scene.tokens.find((t) => t.id === selected);
  const chosenActor = world.characters.find((c) => c.id === chosen?.actor);
  const free = gm && (adjust || !turn.active);
  const canEnd = turn.active && (gm || activeActor?.owner === me.id);
  useEffect(() => {
    const next =
      scene.tokens.find((t) => t.actor === turn.current) ??
      scene.tokens.find(
        (t) =>
          gm ||
          world.characters.some((c) => c.id === t.actor && c.owner === me.id),
      );
    select(next?.id ?? "");
    setHint("");
    setAdjust(false);
  }, [scene.id, turn.current, turn.active]);
  const canMove = (t: Token) =>
    !pending &&
    (gm ||
      world.characters.some((c) => c.id === t.actor && c.owner === me.id)) &&
    (free || (turn.active && turn.current === t.actor && !t.hidden));
  async function run(command: Command) {
    if (pending) return false;
    setPending(true);
    setHint("");
    try {
      return await act(command);
    } finally {
      setPending(false);
    }
  }
  async function move(t: Token, cell: Cell) {
    const cost = moveCost(cellAt(t, grid), cell, grid.diagonal);
    if (!canMove(t) || !cost) return;
    if (!free && cost > remainingMoves(scene, t.actor)) {
      setHint(
        `本轮还可移动 ${remainingMoves(scene, t.actor)} 格，请选择范围内的格子。`,
      );
      return;
    }
    await run({
      type: "token.move",
      scene: scene.id,
      token: t.id,
      ...cellCenter(cell, grid),
      expected: scene.revision,
      adjust: free,
    });
  }
  return (
    <div className="exploration-map">
      <ExplorationBoard
        scene={scene}
        characters={world.characters}
        urls={urls}
        video={
          !!world.assets
            .find((a) => a.id === scene.background)
            ?.mime.startsWith("video/")
        }
        selected={selected}
        select={(id) => {
          select(id);
          setHint("");
        }}
        canMove={canMove}
        allowance={
          free ? 120 : chosen ? remainingMoves(scene, chosen.actor) : 0
        }
        onMove={(t, cell) => void move(t, cell)}
      />
      <div className="exploration-hud">
        <div className="exploration-turn-summary" aria-live="polite">
          <span className="exploration-round">
            {turn.active ? `第 ${turn.round} 轮` : "布置地图"}
          </span>
          <strong title={turn.active ? activeActor?.name : chosenActor?.name}>
            {turn.active
              ? activeActor?.name
              : chosenActor?.name || "尚未开始探索"}
          </strong>
          <small>
            {turn.active
              ? canEnd
                ? activeActor?.owner === me.id
                  ? "轮到你行动"
                  : "GM 可代行"
                : "等待对方行动"
              : `${grid.movePerRound} 格 / 人 / 轮`}
          </small>
        </div>
        <div className="exploration-move-summary" aria-live="polite">
          <strong>
            {free
              ? "自由调位"
              : turn.active
                ? `${remainingMoves(scene, turn.current)} / ${grid.movePerRound} 格`
                : "等待 GM"}
          </strong>
          <small>
            {hint ||
              (free
                ? "GM 摆放 · 不消耗额度"
                : chosen &&
                    chosen.actor === turn.current &&
                    (gm || chosenActor?.owner === me.id)
                  ? "点击、拖动或方向键移动"
                  : "等待当前角色完成行动")}
          </small>
        </div>
        <div className="exploration-actions">
          {gm && turn.active && (
            <button
              aria-pressed={adjust}
              title="免费调整 Token 位置，不改变本轮已用格数"
              disabled={pending}
              onClick={() => setAdjust(!adjust)}
            >
              调整位置
            </button>
          )}
          {!scene.tokens.length && gm ? (
            <button className="primary" onClick={prepare}>
              添加 Token
            </button>
          ) : (
            <button
              disabled={pending || (!gm && !turn.active)}
              onClick={() => setManager(true)}
            >
              {turn.active ? "回合顺序" : gm ? "开始探索" : "等待开始"}
            </button>
          )}
          {turn.active && (
            <button
              className="primary"
              disabled={!canEnd || pending}
              onClick={() =>
                void run({
                  type: "exploration.endTurn",
                  scene: scene.id,
                  expected: scene.revision,
                })
              }
            >
              结束回合
            </button>
          )}
        </div>
      </div>
      {manager && (
        <ExplorationOrder
          scene={scene}
          session={{ world, me }}
          pending={pending}
          error={error}
          close={() => setManager(false)}
          run={run}
        />
      )}
    </div>
  );
}

function ExplorationOrder({
  scene,
  session: { world, me },
  pending,
  error,
  close,
  run,
}: {
  scene: Scene;
  session: Session;
  pending: boolean;
  error: string;
  close: () => void;
  run: (c: Command) => Promise<boolean>;
}) {
  const turn = explorationTurn(scene),
    eligible = explorationActors(scene, world.characters),
    gm = me.role === "gm";
  const [order, setOrder] = useState(() =>
    turn.active
      ? turn.order
      : eligible.filter((c) => c.kind === "pc").map((c) => c.id),
  );
  const visibleOrder = turn.active
    ? turn.order
    : [
        ...order,
        ...eligible.filter((c) => !order.includes(c.id)).map((c) => c.id),
      ];
  function shift(id: string, delta: number) {
    const index = order.indexOf(id),
      next = [...order];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setOrder(next);
  }
  return (
    <Modal
      title={turn.active ? `探索 · 第 ${turn.round} 轮` : "安排探索顺序"}
      onClose={close}
      error={error}
    >
      <p className="muted">
        每人每轮 {sceneGrid(scene).movePerRound} 格 ·{" "}
        {sceneGrid(scene).diagonal ? "斜走也算 1 格" : "仅按横竖格数计数"}
        。地形通行由 GM 裁定。
      </p>
      {!turn.active && (
        <p>勾选参与者，用箭头调整先后。所有人结束回合后，进入下一轮。</p>
      )}
      {!eligible.length && (
        <p>先在“准备本幕”中添加公开角色的 Token，再开始探索。</p>
      )}
      <div className="exploration-order-list">
        {visibleOrder.map((id) => {
          const c = world.characters.find((c) => c.id === id);
          if (!c) return null;
          const index = order.indexOf(id);
          return (
            <div
              key={id}
              className={
                "exploration-order-row " +
                (turn.active && turn.current === id ? "current" : "")
              }
            >
              <span className="exploration-order-index">
                {index >= 0 ? String(index + 1).padStart(2, "0") : "—"}
              </span>
              {!turn.active ? (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={index >= 0}
                    onChange={(e) =>
                      setOrder(
                        e.target.checked
                          ? [...order, id]
                          : order.filter((x) => x !== id),
                      )
                    }
                  />
                  <span>{c.name}</span>
                </label>
              ) : (
                <strong>{c.name}</strong>
              )}
              {turn.active ? (
                <small>
                  {turn.current === id ? "行动中 · " : ""}剩余{" "}
                  {remainingMoves(scene, id)} 格
                </small>
              ) : (
                index >= 0 && (
                  <div className="row">
                    <button
                      aria-label={`上移 ${c.name}`}
                      disabled={index === 0}
                      onClick={() => shift(id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`下移 ${c.name}`}
                      disabled={index === order.length - 1}
                      onClick={() => shift(id, 1)}
                    >
                      ↓
                    </button>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
      <footer className="modal-footer">
        <button onClick={close}>返回地图</button>
        {gm &&
          (turn.active ? (
            <button
              disabled={pending}
              onClick={async () => {
                if (
                  await run({
                    type: "exploration.stop",
                    scene: scene.id,
                    expected: scene.revision,
                  })
                )
                  close();
              }}
            >
              结束探索
            </button>
          ) : (
            <button
              className="primary"
              disabled={pending || !order.length}
              onClick={async () => {
                if (
                  await run({
                    type: "exploration.start",
                    scene: scene.id,
                    order,
                    expected: scene.revision,
                  })
                )
                  close();
              }}
            >
              开始第 1 轮
            </button>
          ))}
      </footer>
    </Modal>
  );
}
