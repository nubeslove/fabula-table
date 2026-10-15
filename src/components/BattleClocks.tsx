import { useEffect, useState } from "react";
import type { Clock, Command } from "../shared/types";
import { displayClocks } from "../shared/clocks";
import { ClockDial } from "./ClockDial";
import { ClockQuickControls } from "./ClockQuickControls";
export function BattleClocks({
  clocks,
  placement,
  gm,
  open,
  act,
  collapsed,
}: {
  collapsed: boolean;
  clocks: Clock[];
  placement: "upper" | "lower";
  gm: boolean;
  open: (id?: string, placement?: "upper" | "lower") => void;
  act: (c: Command) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const entries = displayClocks(clocks).filter(
    (c) => (c.placement ?? "upper") === placement,
  );
  const label = placement === "upper" ? "上半场命刻" : "下半场命刻";
  if (!entries.length && !gm) return null;
  const tucked = collapsed || entries.length > 1;
  return (
    <>
      <button
        className={`scene-clock-tab ${placement}`}
        aria-label={label}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        ✧ {label} {entries.length} {expanded ? "收起" : "展开"}
      </button>
      {(!tucked || expanded) && (
        <section
          className={`scene-clocks ${placement} ${expanded ? "opened" : "floating"}`}
          aria-label={label + "内容"}
        >
          <header>
            <strong>{label}</strong>
            {gm && (
              <button onClick={() => open("new", placement)}>＋ 创建</button>
            )}
            {expanded && (
              <button
                aria-label={"收起" + label}
                onClick={() => setExpanded(false)}
              >
                ×
              </button>
            )}
          </header>
          <div className="scene-clock-list">
            {entries.map((c) => (
              <article className="ornate-clock" key={c.id}>
                <ClockDial clock={c} />
                <div>
                  <button className="clock-title" onClick={() => open(c.id)}>
                    {c.name}
                  </button>
                  <p>{c.description}</p>
                  <b>
                    {c.value} / {c.segments} 格
                  </b>
                  {gm && <ClockQuickControls clock={c} act={act} />}
                </div>
              </article>
            ))}
            {!entries.length && (
              <p className="muted">在这里记录本场冲突的目标或危险。</p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
