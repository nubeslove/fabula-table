import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Command, Scene } from "../shared/types";
import {
  EMOTE_NAMES,
  THEATRE_EMOTES,
  THEATRE_ACTIONS,
  THEATRE_ACTION_IDS,
  theatreSide,
  type TheatreAction,
  type TheatreSide,
} from "../shared/theatre";
import { TheatreEmote } from "./TheatreEmote";

export function TheatrePerformanceTools({
  scene,
  slot,
  name,
  act,
}: {
  scene: Scene;
  slot: Scene["cast"][number];
  name: string;
  act: (c: Command) => Promise<boolean>;
}) {
  const [open, setOpen] = useState<"move" | "emote" | "action" | null>(null);
  const root = useRef<HTMLDivElement>(null),
    moving = useRef(false),
    held = useRef<ReturnType<typeof setInterval>>(),
    lastKey = useRef(0);
  const [busy, setBusy] = useState(false);
  async function dock(side: TheatreSide) {
    if (moving.current) return;
    moving.current = true;
    try {
      await act({
        type: "theatre.dock",
        scene: scene.id,
        actor: slot.actor,
        side,
      });
    } finally {
      moving.current = false;
    }
  }
  async function perform(action: TheatreAction | "") {
    if (busy) return;
    setBusy(true);
    try {
      await act({
        type: "theatre.action",
        scene: scene.id,
        actor: slot.actor,
        action,
      });
    } finally {
      setBusy(false);
    }
  }
  const move = async (dx: number, dy: number, reset = false) => {
    if (moving.current) return;
    moving.current = true;
    try {
      await act({
        type: "theatre.move",
        scene: scene.id,
        actor: slot.actor,
        dx,
        dy,
        reset,
      });
    } finally {
      moving.current = false;
    }
  };
  const stop = () => {
    clearInterval(held.current);
    held.current = undefined;
  };
  function hold(e: PointerEvent<HTMLButtonElement>, dx: number, dy: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    stop();
    void move(dx, dy);
    held.current = setInterval(() => void move(dx, dy), 150);
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(null);
        stop();
        return;
      }
      if (
        !e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) ||
        (e.target as HTMLElement).isContentEditable ||
        document.querySelector(
          "dialog[open],.table-drawer,.battle-workbench",
        ) ||
        !root.current?.getClientRects().length
      )
        return;
      const vectors: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const vector = vectors[e.key];
      if (!vector && e.key !== "Home") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.timeStamp - lastKey.current < 125 && e.repeat) return;
      lastKey.current = e.timeStamp;
      if (!e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        if (!e.repeat) void dock(e.key === "ArrowLeft" ? "left" : "right");
        return;
      }
      const step = e.shiftKey ? 1 : 3;
      void move(
        (vector?.[0] ?? 0) * step,
        (vector?.[1] ?? 0) * step,
        e.key === "Home",
      );
    }
    function outside(e: globalThis.PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    }
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", stop);
    window.addEventListener("pointerdown", outside);
    return () => {
      stop();
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", stop);
      window.removeEventListener("pointerdown", outside);
    };
  }, [scene.id, slot.actor]);
  async function emote(value: (typeof THEATRE_EMOTES)[number] | "") {
    if (busy) return;
    setBusy(true);
    try {
      await act({
        type: "theatre.emote",
        scene: scene.id,
        actor: slot.actor,
        emote: value,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="theatre-performance-tools" ref={root}>
      <button
        aria-expanded={open === "move"}
        onClick={() => setOpen(open === "move" ? null : "move")}
        title="Alt+左右键快速换边；Shift+Alt+方向键细调；Alt+Home 贴齐台词框"
      >
        走位
      </button>
      <button
        aria-expanded={open === "action"}
        onClick={() => setOpen(open === "action" ? null : "action")}
      >
        动作
      </button>
      <button
        aria-expanded={open === "emote"}
        onClick={() => setOpen(open === "emote" ? null : "emote")}
      >
        通用表情
      </button>
      {open && (
        <section
          className="theatre-tool-popover"
          aria-label={
            open === "move"
              ? "立绘走位"
              : open === "action"
                ? "预制动作选择"
                : "通用表情选择"
          }
        >
          <header>
            <strong>
              {name} ·{" "}
              {open === "move" ? "走位" : open === "action" ? "动作" : "表情"}
            </strong>
            <button
              aria-label="收起演出工具"
              onClick={() => {
                setOpen(null);
                stop();
              }}
            >
              ×
            </button>
          </header>
          {open === "move" ? (
            <>
              <div className="theatre-dock-buttons">
                <button
                  aria-pressed={theatreSide(slot) === "left"}
                  onClick={() => void dock("left")}
                >
                  ⇤ 到最左边
                </button>
                <button
                  aria-pressed={theatreSide(slot) === "right"}
                  onClick={() => void dock("right")}
                >
                  到最右边 ⇥
                </button>
              </div>
              <small className="theatre-offset">站位细调</small>
              <div className="theatre-direction-pad">
                {(
                  [
                    { label: "上移立绘", text: "↑", dx: 0, dy: -1, key: "up" },
                    {
                      label: "左移立绘",
                      text: "←",
                      dx: -1,
                      dy: 0,
                      key: "left",
                    },
                    {
                      label: "右移立绘",
                      text: "→",
                      dx: 1,
                      dy: 0,
                      key: "right",
                    },
                    { label: "下移立绘", text: "↓", dx: 0, dy: 1, key: "down" },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.key}
                    className={d.key}
                    aria-label={d.label}
                    onPointerDown={(e) => hold(e, d.dx, d.dy)}
                    onPointerUp={stop}
                    onPointerCancel={stop}
                    onLostPointerCapture={stop}
                    onClick={(e) => {
                      if (e.detail === 0) void move(d.dx, d.dy);
                    }}
                  >
                    {d.text}
                  </button>
                ))}
                <button
                  className="reset"
                  onClick={() => void move(0, 0, true)}
                  title="Alt+Home"
                >
                  归位
                </button>
              </div>
              <small className="theatre-offset">
                水平 {slot.offset?.x ?? 0} · 垂直 {slot.offset?.y ?? 0}
              </small>
              <p>
                Alt + 左右键，快速滑到台词框两端。
                <br />
                Shift + Alt + 方向键细调；归位贴齐下缘。
                <br />
                只移动演出立绘，不消耗地图移动格数。
              </p>
            </>
          ) : open === "action" ? (
            <>
              <div className="theatre-action-picker">
                {THEATRE_ACTION_IDS.map((id) => {
                  const action = THEATRE_ACTIONS[id];
                  return (
                    <button
                      key={id}
                      disabled={busy}
                      aria-label={`演出动作：${action.name}`}
                      title={action.hint}
                      onClick={() => void perform(id)}
                    >
                      {action.emote ? (
                        <TheatreEmote emote={action.emote} />
                      ) : (
                        <span className="theatre-bow-icon" aria-hidden="true">
                          ↘
                        </span>
                      )}
                      <strong>{action.name}</strong>
                      <small>{action.hint}</small>
                    </button>
                  );
                })}
              </div>
              <footer>
                <small>动作与表情一起播放 · 点击重播</small>
                <button disabled={busy} onClick={() => void perform("")}>
                  停稳
                </button>
              </footer>
            </>
          ) : (
            <>
              <div className="theatre-emote-picker">
                {THEATRE_EMOTES.map((e) => (
                  <button
                    key={e}
                    aria-label={`通用表情：${EMOTE_NAMES[e]}`}
                    aria-pressed={slot.emote === e}
                    disabled={busy}
                    onClick={() => void emote(e)}
                  >
                    <TheatreEmote emote={e} />
                    <span>{EMOTE_NAMES[e]}</span>
                  </button>
                ))}
              </div>
              <footer>
                <small>再次点选可重播 · 全团可见</small>
                <button
                  disabled={busy || !slot.emote}
                  onClick={() => void emote("")}
                >
                  清除表情
                </button>
              </footer>
            </>
          )}
        </section>
      )}
    </div>
  );
}
