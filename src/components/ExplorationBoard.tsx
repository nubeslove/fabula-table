import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import type { Character, Scene, Token } from "../shared/types";
import {
  cellAt,
  cellCenter,
  cellPath,
  moveCost,
  sceneGrid,
} from "../shared/exploration";
import type { Cell } from "../shared/exploration";
import { Portrait } from "./Common";

type View = { zoom: number; x: number; y: number };
export function ExplorationBoard({
  scene,
  characters,
  urls,
  video,
  selected,
  select,
  canMove,
  allowance,
  onMove,
}: {
  scene: Scene;
  characters: Character[];
  urls: Record<string, string>;
  video: boolean;
  selected: string;
  select: (id: string) => void;
  canMove: (token: Token) => boolean;
  allowance: number;
  onMove: (token: Token, cell: Cell) => void;
}) {
  const frame = useRef<HTMLDivElement>(null),
    plane = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [target, setTarget] = useState<Cell | null>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    origin: View;
    token?: Token;
    moved: boolean;
  } | null>(null);
  const gridId = "explore-grid-" + useId().replaceAll(":", "");
  const grid = sceneGrid(scene),
    ratio = grid.columns / grid.rows;
  const width = Math.min(box.width, box.height * ratio),
    height = width / ratio;
  const chosen = scene.tokens.find((t) => t.id === selected);
  const from = chosen ? cellAt(chosen, grid) : null;
  const cost = from && target ? moveCost(from, target, grid.diagonal) : 0;
  const allowed = !!chosen && canMove(chosen);
  const bg = urls[scene.background];
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setBox({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  function bounded(v: View): View {
    const x = Math.max(0, (width * v.zoom - box.width) / 2);
    const y = Math.max(0, (height * v.zoom - box.height) / 2);
    return {
      ...v,
      x: Math.max(-x, Math.min(x, v.x)),
      y: Math.max(-y, Math.min(y, v.y)),
    };
  }
  function zoom(delta: number) {
    setView((v) =>
      bounded({ ...v, zoom: Math.max(1, Math.min(4, v.zoom + delta)) }),
    );
  }
  useEffect(
    () => setView((v) => bounded(v)),
    [width, height, box.width, box.height],
  );
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 0.25 : -0.25);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [width, height, box.width, box.height]);
  useEffect(() => {
    setTarget(null);
    gesture.current = null;
  }, [scene.revision]);
  useEffect(() => setTarget(null), [selected]);
  function point(e: { clientX: number; clientY: number }): Cell | null {
    const rect = plane.current?.getBoundingClientRect();
    if (
      !rect ||
      !rect.width ||
      e.clientX < rect.left ||
      e.clientX >= rect.right ||
      e.clientY < rect.top ||
      e.clientY >= rect.bottom
    )
      return null;
    return cellAt(
      {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      },
      grid,
    );
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-token]")
      ?.dataset.token;
    const token = scene.tokens.find((t) => t.id === id);
    if (token) select(token.id);
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      origin: view,
      token,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    e.preventDefault();
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const drag = gesture.current;
    if (!drag) {
      setTarget(point(e));
      return;
    }
    if (drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (drag.token) {
      if (canMove(drag.token)) setTarget(point(e));
    } else if (drag.moved && view.zoom > 1) {
      setView(
        bounded({
          ...drag.origin,
          x: drag.origin.x + dx,
          y: drag.origin.y + dy,
        }),
      );
      setTarget(null);
    }
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    const drag = gesture.current;
    if (!drag || drag.id !== e.pointerId) return;
    const to = point(e);
    if (drag.token && drag.moved && to && canMove(drag.token))
      onMove(drag.token, to);
    else if (!drag.token && !drag.moved && chosen && to && allowed)
      onMove(chosen, to);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    gesture.current = null;
    setTarget(null);
  }
  const reachable: Cell[] = [];
  if (from && allowed && allowance < 120) {
    for (
      let row = Math.max(0, from.row - allowance);
      row <= Math.min(grid.rows - 1, from.row + allowance);
      row++
    )
      for (
        let column = Math.max(0, from.column - allowance);
        column <= Math.min(grid.columns - 1, from.column + allowance);
        column++
      )
        if (moveCost(from, { row, column }, grid.diagonal) <= allowance)
          reachable.push({ column, row });
  }
  return (
    <div className="exploration-viewport" ref={frame}>
      <div
        className="exploration-board"
        ref={plane}
        role="group"
        aria-label="探索棋盘"
        tabIndex={0}
        style={
          {
            width,
            height,
            transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            "--cell-size": `${width / grid.columns}px`,
          } as CSSProperties
        }
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          gesture.current = null;
          setTarget(null);
        }}
        onPointerLeave={() => {
          if (!gesture.current) setTarget(null);
        }}
        onDragStart={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          };
          if (
            !directions[e.key] ||
            !chosen ||
            !from ||
            !allowed ||
            e.ctrlKey ||
            e.metaKey ||
            e.altKey ||
            e.repeat
          )
            return;
          e.preventDefault();
          const [x, y] = directions[e.key],
            to = { column: from.column + x, row: from.row + y };
          if (
            to.column >= 0 &&
            to.column < grid.columns &&
            to.row >= 0 &&
            to.row < grid.rows
          )
            onMove(chosen, to);
        }}
      >
        {bg &&
          (video ? (
            <video
              className="exploration-background"
              src={bg}
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <img
              className="exploration-background"
              src={bg}
              alt="探索地图背景"
              draggable={false}
            />
          ))}
        <svg
          className="exploration-grid"
          viewBox={`0 0 ${grid.columns} ${grid.rows}`}
          aria-hidden="true"
        >
          <defs>
            <pattern
              id={gridId}
              width="1"
              height="1"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 1 0 L 0 0 0 1"
                fill="none"
                stroke="#051614"
                strokeOpacity=".75"
                strokeWidth=".065"
              />
              <path
                d="M 1 0 L 0 0 0 1"
                fill="none"
                stroke="#d5e6c8"
                strokeOpacity=".44"
                strokeWidth=".025"
              />
            </pattern>
          </defs>
          {reachable.map((cell) => (
            <rect
              key={`${cell.column}:${cell.row}`}
              x={cell.column}
              y={cell.row}
              width="1"
              height="1"
              fill="#b9d780"
              opacity=".17"
            />
          ))}
          <rect
            width={grid.columns}
            height={grid.rows}
            fill={`url(#${gridId})`}
          />
          {from && target && allowed && (
            <g
              className={
                cost <= allowance
                  ? "exploration-route"
                  : "exploration-route over-budget"
              }
            >
              <polyline
                points={cellPath(from, target, grid.diagonal)
                  .map((p) => `${p.column + 0.5},${p.row + 0.5}`)
                  .join(" ")}
              />
              <rect
                x={target.column + 0.06}
                y={target.row + 0.06}
                width=".88"
                height=".88"
                rx=".12"
              />
            </g>
          )}
        </svg>
        {scene.tokens.map((t) => {
          const c = characters.find((c) => c.id === t.actor);
          if (!c) return null;
          const position = cellCenter(cellAt(t, grid), grid);
          const active =
            t.actor === scene.exploration?.current && scene.exploration.active;
          return (
            <button
              key={t.id}
              data-token={t.id}
              className={`exploration-token${selected === t.id ? " selected" : ""}${active ? " current" : ""}${t.hidden ? " concealed" : ""}`}
              aria-label={`${c.name}，${cellAt(t, grid).column + 1} 列 ${cellAt(t, grid).row + 1} 行${t.hidden ? "，隐藏" : ""}`}
              aria-pressed={selected === t.id}
              style={
                {
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  "--token-color": c.color,
                } as CSSProperties
              }
              title={`${c.name}${t.hidden ? " · 向玩家隐藏" : ""}`}
              onClick={(e) => {
                if (e.detail === 0) select(t.id);
              }}
            >
              <Portrait name={c.name} color={c.color} src={urls[c.portrait]} />
              <span className="exploration-token-name">
                {c.name}
                {t.hidden ? " · 隐藏" : ""}
              </span>
            </button>
          );
        })}
      </div>
      <div className="exploration-view-tools" aria-label="地图视野">
        <button
          aria-label="缩小地图"
          disabled={view.zoom <= 1}
          onClick={() => zoom(-0.25)}
        >
          −
        </button>
        <button
          aria-label="查看全图"
          title="恢复全图"
          onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <button
          aria-label="放大地图"
          disabled={view.zoom >= 4}
          onClick={() => zoom(0.25)}
        >
          ＋
        </button>
      </div>
      <div className="exploration-map-hint" aria-live="polite">
        {from && target && allowed && cost > 0
          ? `${cost > allowance ? "超出额度 · " : ""}移动 ${cost} 格${allowance < 120 ? ` · 剩余 ${Math.max(0, allowance - cost)} 格` : ""}`
          : `${grid.columns} × ${grid.rows} 格 · ${view.zoom > 1 ? "拖动空白处移动视野" : "选择 Token 后点击格子移动"}`}
      </div>
    </div>
  );
}
