import { useState } from "react";
import type { Command, Scene, World } from "../shared/types";
import { Modal, Portrait } from "./Common";

export function TheatreSetup({
  scene,
  world,
  urls,
  act,
  close,
  error,
}: {
  scene: Scene;
  world: World;
  urls: Record<string, string>;
  act: (command: Command) => Promise<boolean>;
  close: () => void;
  error: string;
}) {
  const [order, setOrder] = useState(() =>
    [...scene.cast].sort((a, b) => a.position - b.position).map((c) => c.actor),
  );
  const [revision] = useState(scene.revision);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [busy, setBusy] = useState(false);
  const actors = world.characters.filter(
    (c) =>
      c.public &&
      (kind === "all" || c.kind === kind) &&
      c.name.includes(query.trim()),
  );
  function toggle(id: string) {
    setOrder(
      order.includes(id)
        ? order.filter((x) => x !== id)
        : order.length < 6
          ? [...order, id]
          : order,
    );
  }
  function shift(index: number, delta: number) {
    const next = [...order];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setOrder(next);
  }
  async function save() {
    setBusy(true);
    try {
      if (
        await act({
          type: "theatre.configure",
          scene: scene.id,
          expected: revision,
          active: true,
          actors: order,
        })
      )
        close();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={scene.theatre ? "小剧场 · 调整登场" : "小剧场 · 选角开演"}
      onClose={close}
      error={error}
      className="theatre-setup"
      wide
    >
      <p className="muted">
        在当前地图上演出。选择最多六位公开人物，按右侧顺序登场；也可以只用旁白。
      </p>
      <div className="theatre-picker-tools">
        <input
          aria-label="搜索登场人物"
          placeholder="搜索人物……"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="登场人物分类"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">全部人物</option>
          <option value="pc">玩家角色</option>
          <option value="npc">非玩家角色</option>
        </select>
      </div>
      <div className="theatre-picker-columns">
        <div className="theatre-picker-list">
          {actors.map((c) => (
            <button
              key={c.id}
              aria-pressed={order.includes(c.id)}
              disabled={!order.includes(c.id) && order.length >= 6}
              onClick={() => toggle(c.id)}
            >
              <Portrait name={c.name} src={urls[c.portrait]} color={c.color} />
              <span>
                <strong>{c.name}</strong>
                <small>{c.kind === "pc" ? "玩家角色" : "非玩家角色"}</small>
              </span>
              <b>{order.includes(c.id) ? "✓" : "＋"}</b>
            </button>
          ))}
          {!actors.length && (
            <p className="muted">
              没有符合条件的公开人物。请先在人物目录准备角色与立绘。
            </p>
          )}
        </div>
        <div className="theatre-order">
          <strong>
            登场顺序 <small>{order.length} / 6</small>
          </strong>
          {order.map((id, i) => {
            const c = world.characters.find((c) => c.id === id);
            return (
              <div key={id}>
                <span>
                  {i + 1}. {c?.name ?? "已删除人物"}
                </span>
                <button
                  aria-label={`前移 ${c?.name}`}
                  disabled={!i}
                  onClick={() => shift(i, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={`后移 ${c?.name}`}
                  disabled={i === order.length - 1}
                  onClick={() => shift(i, 1)}
                >
                  ↓
                </button>
                <button
                  aria-label={`取消登场 ${c?.name}`}
                  onClick={() => toggle(id)}
                >
                  ×
                </button>
              </div>
            );
          })}
          {!order.length && (
            <p className="muted">先从左侧选人，或直接以旁白开场。</p>
          )}
          <small>
            立绘与表情沿用角色卡。没有立绘时显示姓名标记；公开角色不会公开其 GM
            私密资料。
          </small>
        </div>
      </div>
      <footer className="theatre-picker-footer">
        <span>地图与回合保持原状</span>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? "正在同步……" : scene.theatre ? "应用登场名单" : "拉开帷幕"}
        </button>
      </footer>
    </Modal>
  );
}
