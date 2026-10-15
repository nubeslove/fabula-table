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
  width,
}: {
  clocks: Clock[];
  placement: "upper" | "lower";
  gm: boolean;
  width: number;
  open: (id?: string, placement?: "upper" | "lower") => void;
  act: (c: Command) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false),
    [page, setPage] = useState(0);
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
  const size = width >= 1000 ? 2 : 1,
    pages = Math.max(1, Math.ceil(entries.length / size));
  const current = Math.min(page, pages - 1);
  if (!entries.length && !gm) return null;
  return (
    <>
      <button
        className={`battle-clock-arrow ${placement}`}
        aria-label={label}
        title={`${expanded ? "收起" : "展开"}${label}（${entries.length}）`}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{
            transform: `rotate(${(placement === "upper") !== expanded ? 0 : 180}deg)`,
          }}
        >
          <path d="m8 4 8 8-8 8" />
        </svg>
      </button>
      <section
        className={`battle-clock-flyout ${placement} ${expanded ? "is-open" : ""}`}
        aria-label={label + "内容"}
        aria-hidden={!expanded}
        {...(!expanded ? { inert: "" } : {})}
      >
        <div className="battle-clock-faces">
          {entries.slice(current * size, (current + 1) * size).map((c) => (
            <article className="battle-clock-face" key={c.id}>
              <ClockDial clock={c} />
              <button
                className="clock-name"
                onClick={() => open(c.id)}
                title={c.description}
              >
                {c.name}
              </button>
              {c.description && <p title={c.description}>{c.description}</p>}
              {gm && <ClockQuickControls clock={c} act={act} />}
            </article>
          ))}
          {!entries.length && gm && (
            <button
              className="battle-clock-empty"
              onClick={() => open("new", placement)}
            >
              ＋ 创建{label}
            </button>
          )}
        </div>
        {pages > 1 && (
          <nav className="battle-clock-pages" aria-label={label + "翻页"}>
            <button
              aria-label={label + "上一组"}
              disabled={!current}
              onClick={() => setPage(current - 1)}
            >
              ‹
            </button>
            <span>
              {current + 1} / {pages}
            </span>
            <button
              aria-label={label + "下一组"}
              disabled={current + 1 === pages}
              onClick={() => setPage(current + 1)}
            >
              ›
            </button>
          </nav>
        )}
      </section>
    </>
  );
}
