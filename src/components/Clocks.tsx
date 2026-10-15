import { useState } from "react";
import type { Clock, Command, Session } from "../shared/types";
import { CLOCK_KINDS, displayClocks, newClock } from "../shared/clocks";
import { uid } from "../lib/api";
import { Empty, Field, Modal } from "./Common";
import { ClockDial } from "./ClockDial";

type Act = (command: Command) => Promise<boolean>;

function ClockControls({ clock, act }: { clock: Clock; act: Act }) {
  const [busy, setBusy] = useState(false);
  async function send(command: Command) {
    setBusy(true);
    try {
      await act(command);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="clock-controls" aria-label={`${clock.name}的手动控制`}>
      <button
        disabled={busy || !clock.value}
        aria-label={`${clock.name}减少一格`}
        onClick={() =>
          void send({ type: "clock.tick", id: clock.id, delta: -1 })
        }
      >
        −
      </button>
      <select
        disabled={busy}
        aria-label={`${clock.name}的刻度`}
        value={clock.value}
        onChange={(e) =>
          void send({ type: "clock.set", id: clock.id, value: +e.target.value })
        }
      >
        {Array.from({ length: clock.segments + 1 }, (_, i) => (
          <option key={i} value={i}>
            {i} / {clock.segments} 格
          </option>
        ))}
      </select>
      <button
        disabled={busy || clock.value === clock.segments}
        aria-label={`${clock.name}增加一格`}
        onClick={() =>
          void send({ type: "clock.tick", id: clock.id, delta: 1 })
        }
      >
        ＋
      </button>
      <span>GM 手动</span>
    </div>
  );
}

export function ClockManager({
  session,
  act,
  error,
  initialId,
  initialScene,
  initialPlacement,
  close,
}: {
  session: Session;
  act: Act;
  error: string;
  initialId?: string;
  initialScene?: string;
  initialPlacement?: "upper" | "lower";
  close: () => void;
}) {
  const { world, me } = session,
    gm = me.role === "gm";
  const [selected, setSelected] = useState(
    initialId && initialId !== "new"
      ? initialId
      : (displayClocks(world.clocks)[0]?.id ?? world.clocks[0]?.id ?? ""),
  );
  const [draft, setDraft] = useState<Clock | null>(
    initialId === "new"
      ? { ...newClock(uid()), scene: initialScene, placement: initialPlacement }
      : null,
  );
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all");
  const chosen = draft ?? world.clocks.find((c) => c.id === selected);
  const list = world.clocks.filter(
    (c) =>
      (archived || !c.archived) &&
      (category === "all" || (category === "battle" ? !!c.scene : !c.scene)) &&
      [c.name, c.description].join().includes(query),
  );
  return (
    <Modal title="命刻 · 故事的进展" onClose={close} error={error} wide>
      <div className="clock-manager">
        <div className="clock-directory">
          <input
            type="search"
            aria-label="搜索命刻"
            placeholder="搜索命刻名称、含义…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="命刻分类"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">全部命刻</option>
            <option value="world">世界命刻</option>
            <option value="battle">冲突命刻</option>
          </select>
          {gm && (
            <button
              className="primary"
              onClick={() =>
                setDraft({
                  ...newClock(uid()),
                  scene: initialScene,
                  placement: initialPlacement,
                })
              }
            >
              ＋ 创建命刻
            </button>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            显示已归档
          </label>
          <div className="clock-directory-list">
            {list.map((c) => (
              <button
                key={c.id}
                className={!draft && selected === c.id ? "selected" : ""}
                onClick={() => {
                  setSelected(c.id);
                  setDraft(null);
                }}
              >
                <ClockDial clock={c} />
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {!c.public ? "私密 · " : ""}
                    {c.archived
                      ? "已归档"
                      : c.primary
                        ? "优先显示"
                        : CLOCK_KINDS[c.kind ?? "goal"].label}{" "}
                    · {c.value}/{c.segments}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>
        {chosen ? (
          <ClockDetails
            key={chosen.id}
            initial={chosen}
            live={world.clocks.find((c) => c.id === chosen.id)}
            scenes={world.scenes.filter(
              (s) =>
                s.mode === "battle" ||
                (s.id === world.activeScene && world.battle.active),
            )}
            gm={gm}
            act={act}
            saved={(id) => {
              setSelected(id);
              setDraft(null);
            }}
          />
        ) : (
          <Empty>
            命刻记录目标、危机和旅途。
            {gm ? "创建一个命刻，写下它对应的事件。" : "等待 GM 公布新的命刻。"}
          </Empty>
        )}
      </div>
    </Modal>
  );
}

function ClockDetails({
  initial,
  live,
  gm,
  act,
  saved,
  scenes,
}: {
  scenes: Session["world"]["scenes"];
  initial: Clock;
  live?: Clock;
  gm: boolean;
  act: Act;
  saved: (id: string) => void;
}) {
  const [draft, setDraft] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const update = (patch: Partial<Clock>) => {
    setDraft((old) => ({ ...old, ...patch }));
    setMessage("");
  };
  const preview = {
    ...(gm ? draft : (live ?? draft)),
    value: Math.min(live?.value ?? draft.value, draft.segments),
  };
  async function save() {
    setBusy(true);
    try {
      if (await act({ type: "clock.save", value: preview })) {
        saved(draft.id);
        setMessage("命刻已保存");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="clock-details">
      <div className="clock-detail-preview">
        <ClockDial clock={preview} />
        <div>
          <span className={`clock-kind clock-${preview.kind ?? "goal"}`}>
            {CLOCK_KINDS[preview.kind ?? "goal"].label}
          </span>
          <h3>{preview.name || "尚未命名的命刻"}</h3>
          <p>{preview.description || "写清它在记录什么，大家就能一眼读懂。"}</p>
          {preview.value === preview.segments && (
            <strong>已填满 · 后续由 GM 决定</strong>
          )}
        </div>
      </div>
      {live && gm && !live.archived && <ClockControls clock={live} act={act} />}
      {gm ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="命刻名称">
            <input
              maxLength={100}
              required
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="雾港警戒 · 守卫正在逼近"
            />
          </Field>
          <Field label="这在记录什么？">
            <textarea
              maxLength={2000}
              rows={3}
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="例如：搜查队逐渐接近藏身处；刻满时他们将找到我们。"
            />
          </Field>
          <div className="form-grid">
            <Field label="显示位置">
              <select
                value={draft.scene ?? ""}
                onChange={(e) => update({ scene: e.target.value || undefined })}
              >
                <option value="">全局命刻栏</option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · 冲突命刻
                  </option>
                ))}
              </select>
            </Field>
            {draft.scene && (
              <Field label="战场半区">
                <select
                  value={draft.placement ?? "upper"}
                  onChange={(e) =>
                    update({ placement: e.target.value as "upper" | "lower" })
                  }
                >
                  <option value="upper">上半场 · 左侧</option>
                  <option value="lower">下半场 · 右侧</option>
                </select>
              </Field>
            )}
          </div>
          <div className="form-grid">
            <Field label="命刻类别">
              <select
                value={draft.kind ?? "goal"}
                onChange={(e) =>
                  update({ kind: e.target.value as Clock["kind"] })
                }
              >
                {Object.entries(CLOCK_KINDS).map(([key, k]) => (
                  <option key={key} value={key}>
                    {k.glyph} {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="刻度格数">
              <select
                value={draft.segments}
                onChange={(e) =>
                  update({
                    segments: +e.target.value,
                    value: Math.min(draft.value, +e.target.value),
                  })
                }
              >
                {Array.from({ length: 9 }, (_, i) => (
                  <option key={i + 4} value={i + 4}>
                    {i + 4} 格
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="row wrap">
            <label className="check">
              <input
                type="checkbox"
                checked={draft.public}
                onChange={(e) =>
                  update({
                    public: e.target.checked,
                    primary: e.target.checked && draft.primary,
                  })
                }
              />
              全团可见
            </label>
            <label className="check">
              <input
                type="checkbox"
                disabled={!draft.public || draft.archived}
                checked={!!draft.primary && draft.public && !draft.archived}
                onChange={(e) => update({ primary: e.target.checked })}
              />
              优先显示
            </label>
          </div>
          <p className="clock-priority-hint">
            可选择多个；优先显示的排在前面，其余按原顺序排列。
          </p>
          <div className="row wrap clock-save-row">
            <button className="primary" disabled={busy || !draft.name.trim()}>
              {busy ? "保存中…" : "保存命刻"}
            </button>
            {message && <span role="status">{message}</span>}
            {live && (
              <button
                type="button"
                onClick={async () => {
                  if (
                    await act({
                      type: "clock.save",
                      value: {
                        ...live,
                        archived: !live.archived,
                        primary: false,
                      },
                    })
                  )
                    update({ archived: !live.archived, primary: false });
                }}
              >
                {live.archived ? "恢复命刻" : "归档命刻"}
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="muted">由 GM 手动调整进度。</p>
      )}
    </div>
  );
}
