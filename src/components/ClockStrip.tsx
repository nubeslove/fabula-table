import { useEffect, useRef, useState } from "react";
import { ClockQuickControls } from "./ClockQuickControls";
import type { Clock, Command } from "../shared/types";
import { CLOCK_KINDS, displayClocks } from "../shared/clocks";
import { ClockDial } from "./ClockDial";

export function ClockStrip({
  clocks,
  gm,
  act,
  open,
}: {
  clocks: Clock[];
  gm: boolean;
  act: (command: Command) => Promise<boolean>;
  open: (id?: string) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const entries = displayClocks(clocks.filter((c) => !c.scene));
  const order = entries.map((c) => c.id).join(",");
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setPage(0), [order]);

  // Reserve the management button, then paging controls only when needed.
  const available = Math.max(0, width - 36);
  const fullColumns = Math.max(1, Math.floor((available + 6) / 162));
  const columns =
    entries.length > fullColumns
      ? Math.max(1, Math.floor((available - 64 + 6) / 162))
      : fullColumns;
  const pages = Math.max(1, Math.ceil(entries.length / columns));
  const current = Math.min(page, pages - 1);
  const shown = entries.slice(current * columns, (current + 1) * columns);

  return (
    <div className="clock-strip" ref={strip} role="region" aria-label="命刻栏">
      {entries.length > 0 ? (
        <>
          <div
            className="clock-strip-items"
            style={{
              gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))`,
            }}
          >
            {shown.map((c) => (
              <article className="clock-strip-cell" key={c.id}>
                <button
                  className={`clock-strip-item ${c.primary ? "prioritized" : ""}`}
                  onClick={() => open(c.id)}
                  aria-label={`查看命刻：${c.name}，${c.value}/${c.segments} 格${c.primary ? "，优先显示" : ""}`}
                  title={`${c.name} · ${c.value}/${c.segments} 格${c.description ? ` · ${c.description}` : ""}`}
                >
                  <ClockDial clock={c} />
                  <span className="clock-strip-copy">
                    <strong>{c.name}</strong>
                    <small>
                      {c.primary && (
                        <span
                          className="clock-priority-mark"
                          aria-hidden="true"
                        >
                          ✦{" "}
                        </span>
                      )}
                      {CLOCK_KINDS[c.kind ?? "goal"].label} · {c.value}/
                      {c.segments}
                    </small>
                  </span>
                </button>
                {gm && <ClockQuickControls clock={c} act={act} />}
              </article>
            ))}
          </div>
          {pages > 1 && (
            <div
              className="clock-strip-paging"
              aria-label={`命刻第 ${current + 1} / ${pages} 页`}
            >
              <button
                disabled={current === 0}
                aria-label="上一组命刻"
                title={`上一组 · ${current + 1}/${pages}`}
                onClick={() => setPage(current - 1)}
              >
                ‹
              </button>
              <button
                disabled={current === pages - 1}
                aria-label="下一组命刻"
                title={`下一组 · ${current + 1}/${pages}`}
                onClick={() => setPage(current + 1)}
              >
                ›
              </button>
            </div>
          )}
          <button
            className="clock-strip-manage"
            aria-label={gm ? "管理全部命刻" : "查看全部命刻"}
            title={`${gm ? "管理" : "查看"}全部命刻 · ${entries.length} 个`}
            onClick={() => open()}
          >
            ⋯
          </button>
        </>
      ) : gm ? (
        <button className="clock-strip-create" onClick={() => open("new")}>
          ✧ 创建命刻
        </button>
      ) : null}
    </div>
  );
}
