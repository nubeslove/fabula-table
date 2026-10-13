import { useState } from "react";
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
  perPage,
}: {
  perPage: number;
  clocks: Clock[];
  placement: "upper" | "lower";
  gm: boolean;
  open: (id?: string, placement?: "upper" | "lower") => void;
  act: (c: Command) => Promise<boolean>;
}) {
  const [page, setPage] = useState(0),
    entries = displayClocks(clocks).filter(
      (c) => (c.placement ?? "upper") === placement,
    ),
    pages = Math.ceil(entries.length / perPage),
    current = Math.min(page, Math.max(0, pages - 1));
  return (
    <section
      className={`battle-clocks ${placement}`}
      aria-label={placement === "upper" ? "上半场命刻" : "下半场命刻"}
    >
      <header>
        <span>冲突命刻</span>
        {pages > 1 && (
          <>
            <button
              aria-label={`${placement === "upper" ? "上半场" : "下半场"}上一组命刻`}
              disabled={!current}
              onClick={() => setPage(current - 1)}
            >
              ‹
            </button>
            <small>
              {current + 1}/{pages}
            </small>
            <button
              aria-label={`${placement === "upper" ? "上半场" : "下半场"}下一组命刻`}
              disabled={current + 1 >= pages}
              onClick={() => setPage(current + 1)}
            >
              ›
            </button>
          </>
        )}
        {gm && (
          <button title="创建冲突命刻" onClick={() => open("new", placement)}>
            ＋
          </button>
        )}
      </header>
      <div className="battle-clocks-row">
        {entries
          .slice(current * perPage, current * perPage + perPage)
          .map((c) => (
            <article className="battle-clock" key={c.id}>
              <button
                className="battle-clock-open"
                title={c.description}
                onClick={() => open(c.id)}
              >
                <ClockDial clock={c} />
                <strong>{c.name}</strong>
                <small>
                  {c.value}/{c.segments}
                </small>
              </button>
              {gm && <ClockQuickControls clock={c} act={act} />}
            </article>
          ))}
      </div>
    </section>
  );
}
