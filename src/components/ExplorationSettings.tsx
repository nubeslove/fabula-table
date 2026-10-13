import type { Scene, World } from "../shared/types";
import { cellCenter, sceneGrid } from "../shared/exploration";
import { uid } from "../lib/api";
import { Field } from "./Common";

export function ExplorationSettings({
  scene,
  world,
  change,
}: {
  scene: Scene;
  world: World;
  change: (scene: Scene) => void;
}) {
  const grid = sceneGrid(scene),
    locked = !!scene.exploration?.active;
  return (
    <section className="exploration-settings">
      <h3>方格地图</h3>
      <p className="muted">
        只按格数移动，不换算距离。背景完整铺在棋盘内；调整行列数可匹配地图比例。
      </p>
      {locked && (
        <p className="muted">
          探索正在进行。先在地图上结束探索，才能修改网格或 Token 名单。
        </p>
      )}
      <div className="form-grid">
        <Field label="地图列数">
          <input
            type="number"
            min={4}
            max={60}
            value={grid.columns}
            disabled={locked}
            onChange={(e) =>
              change({
                ...scene,
                grid: { ...grid, columns: Number(e.target.value) },
              })
            }
          />
        </Field>
        <Field label="地图行数">
          <input
            type="number"
            min={4}
            max={60}
            value={grid.rows}
            disabled={locked}
            onChange={(e) =>
              change({
                ...scene,
                grid: { ...grid, rows: Number(e.target.value) },
              })
            }
          />
        </Field>
        <Field label="每人每轮移动格数">
          <input
            type="number"
            min={1}
            max={60}
            value={grid.movePerRound}
            disabled={locked}
            onChange={(e) =>
              change({
                ...scene,
                grid: { ...grid, movePerRound: Number(e.target.value) },
              })
            }
          />
        </Field>
        <Field label="移动方式">
          <select
            value={grid.diagonal ? "diagonal" : "straight"}
            disabled={locked}
            onChange={(e) =>
              change({
                ...scene,
                grid: { ...grid, diagonal: e.target.value === "diagonal" },
              })
            }
          >
            <option value="diagonal">横、竖、斜走 · 每格消耗 1</option>
            <option value="straight">仅横竖行走 · 每格消耗 1</option>
          </select>
        </Field>
      </div>
      <h3>
        地图 Token <small>· {scene.tokens.length} 个</small>
      </h3>
      <div className="exploration-token-list">
        {scene.tokens.map((token, index) => (
          <div className="exploration-token-row" key={token.id}>
            <strong
              title={world.characters.find((c) => c.id === token.actor)?.name}
            >
              {world.characters.find((c) => c.id === token.actor)?.name}
            </strong>
            <label className="check">
              <input
                type="checkbox"
                checked={token.hidden}
                disabled={locked}
                onChange={(e) =>
                  change({
                    ...scene,
                    tokens: scene.tokens.map((t, i) =>
                      i === index ? { ...t, hidden: e.target.checked } : t,
                    ),
                  })
                }
              />
              隐藏
            </label>
            <button
              disabled={locked}
              onClick={() =>
                change({
                  ...scene,
                  tokens: scene.tokens.filter((t) => t.id !== token.id),
                })
              }
            >
              移除
            </button>
          </div>
        ))}
      </div>
      <select
        value=""
        aria-label="添加地图 Token"
        disabled={locked || scene.tokens.length >= 100}
        onChange={(e) => {
          if (!e.target.value) return;
          const column =
            1 + (scene.tokens.length % Math.max(1, grid.columns - 2));
          const row = Math.min(
            grid.rows - 1,
            1 + Math.floor(scene.tokens.length / Math.max(1, grid.columns - 2)),
          );
          change({
            ...scene,
            tokens: [
              ...scene.tokens,
              {
                id: uid(),
                actor: e.target.value,
                ...cellCenter({ column, row }, grid),
                hidden: false,
              },
            ],
          });
        }}
      >
        <option value="">＋ 添加角色 Token</option>
        {world.characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.kind === "pc" ? "玩家" : "NPC"} · {c.name}
            {c.public ? "" : "（私密）"}
          </option>
        ))}
      </select>
      <p className="muted">
        保存并打开后，GM
        可在地图上拖动摆位。开始探索时选择参与角色和顺序；同一角色的多个 Token
        共用移动额度。
      </p>
    </section>
  );
}
