import { useEffect, useState, useRef } from "react";
import type { CSSProperties } from "react";
import type { Character, Command, Session } from "../shared/types";
import { BattleClocks } from "./BattleClocks";
import { derived } from "../shared/rules";
import { BattleAction, type BattleActionKind } from "./BattleAction";

export function BattleStage({
  session: { world: w, me },
  urls,
  act,
  configure,
  openClock,
  error,
}: {
  session: Session;
  urls: Record<string, string>;
  act: (c: Command) => Promise<boolean>;
  configure: () => void;
  openClock: (id?: string, placement?: "upper" | "lower") => void;
  error: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  const b = w.battle,
    gm = me.role === "gm";
  const scene = w.scenes.find((s) => s.id === w.activeScene);
  const onScene = new Set([
    ...(scene?.cast.map((s) => s.actor) ?? []),
    ...(scene?.tokens.filter((t) => !t.hidden).map((t) => t.actor) ?? []),
  ]);
  const roster = w.characters.filter(
    (c) =>
      c.public &&
      (b.active
        ? b.roster.includes(c.id)
        : c.kind === "pc" || onScene.has(c.id)),
  );
  const [selectedId, select] = useState(b.current),
    [action, setAction] = useState<BattleActionKind | null>(null),
    [busy, setBusy] = useState(false);
  const selected =
    roster.find((c) => c.id === selectedId) ??
    roster.find((c) => c.owner === me.id) ??
    roster[0];
  useEffect(() => {
    if (b.current) select(b.current);
  }, [b.current]);
  const canAct = selected && (gm || selected.owner === me.id);
  async function run(command: Command) {
    setBusy(true);
    try {
      return await act(command);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div ref={frame} className="battle-scene" aria-label="二维冲突场景">
      <div className="battle-atmosphere" aria-hidden="true" />
      <div className="battle-round">
        <span>CONFLICT</span>
        <strong>{b.active ? `第 ${b.round} 轮` : "冲突准备"}</strong>
        <small>
          {b.active
            ? `${b.side === "heroes" ? "我方" : "对方"}行动${b.current ? "中" : " · 等待 GM 选人"}`
            : "选择参战人物后开始"}
        </small>
      </div>
      <BattleTeam
        perPage={width < 650 ? 2 : 4}
        side="foes"
        members={roster.filter((c) => c.side === "foes")}
        urls={urls}
        selected={selected?.id}
        select={select}
        current={b.current}
        acted={b.acted}
        gm={gm}
      />
      <div className="battle-crossline" aria-hidden="true">
        <span>✦</span>
      </div>
      <BattleTeam
        perPage={width < 650 ? 2 : 4}
        side="heroes"
        members={roster.filter((c) => c.side === "heroes")}
        urls={urls}
        selected={selected?.id}
        select={select}
        current={b.current}
        acted={b.acted}
        gm={gm}
      />
      {(["upper", "lower"] as const).map((placement) => (
        <BattleClocks
          perPage={width < 480 ? 1 : width < 650 ? 2 : 3}
          key={placement}
          clocks={w.clocks.filter((c) => c.scene === scene?.id)}
          placement={placement}
          gm={gm}
          act={act}
          open={openClock}
        />
      ))}
      <div className="battle-command-bar">
        <div className="battle-selected">
          <small>
            {selected
              ? selected.side === "heroes"
                ? "我方"
                : "对方"
              : "尚未参战"}
            {selected?.id === b.current ? " · 行动中" : ""}
          </small>
          <strong title={selected?.name}>
            {selected?.name || "准备迎接冲突"}
          </strong>
        </div>
        <div className="battle-actions">
          <button disabled={!canAct} onClick={() => setAction("abilities")}>
            能力
          </button>
          <button disabled={!canAct} onClick={() => setAction("roll")}>
            掷骰
          </button>
          <button disabled={!canAct} onClick={() => setAction("resources")}>
            {gm ? "调整数值" : "资源"}
          </button>
        </div>
        {gm && (
          <div className="battle-turn-actions">
            {!b.active ? (
              <button className="primary" onClick={configure}>
                配置冲突
              </button>
            ) : (
              <>
                {b.current ? (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void run({ type: "battle.endTurn" })}
                  >
                    结束当前回合
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !selected ||
                      selected.side !== b.side ||
                      b.acted.includes(selected.id)
                    }
                    onClick={() =>
                      selected &&
                      void run({ type: "battle.select", actor: selected.id })
                    }
                  >
                    让此角色行动
                  </button>
                )}
                <button
                  className="battle-settings"
                  aria-label="冲突设置"
                  title="参战与结束冲突"
                  onClick={configure}
                >
                  ⋯
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {selected && action && canAct && (
        <BattleAction
          key={`${selected.id}:${action}`}
          character={selected}
          kind={action}
          gm={gm}
          act={act}
          error={error}
          close={() => setAction(null)}
        />
      )}
    </div>
  );
}

function BattleTeam({
  side,
  perPage,
  members,
  urls,
  selected,
  select,
  current,
  acted,
  gm,
}: {
  side: "heroes" | "foes";
  perPage: number;
  members: Character[];
  urls: Record<string, string>;
  selected?: string;
  select: (id: string) => void;
  current: string;
  acted: string[];
  gm: boolean;
}) {
  const [page, setPage] = useState(0),
    pages = Math.ceil(members.length / perPage),
    shownPage = Math.min(page, Math.max(0, pages - 1));
  useEffect(() => {
    const i = members.findIndex((c) => c.id === current);
    if (i >= 0) setPage(Math.floor(i / perPage));
  }, [current, perPage]);
  const shown = members.slice(
    shownPage * perPage,
    shownPage * perPage + perPage,
  );
  return (
    <section
      className={`battle-team ${side}`}
      aria-label={side === "heroes" ? "我方阵容" : "对方阵容"}
    >
      <header>
        <b>{side === "heroes" ? "我方" : "对方"}</b>
        <small>{members.length} 人</small>
        {pages > 1 && (
          <div className="battle-team-pages">
            <button
              disabled={!shownPage}
              aria-label={`${side === "heroes" ? "我方" : "对方"}上一组`}
              onClick={() => setPage(shownPage - 1)}
            >
              ‹
            </button>
            <span>
              {shownPage + 1}/{pages}
            </span>
            <button
              disabled={shownPage + 1 >= pages}
              aria-label={`${side === "heroes" ? "我方" : "对方"}下一组`}
              onClick={() => setPage(shownPage + 1)}
            >
              ›
            </button>
          </div>
        )}
      </header>
      <div className="battle-formation">
        {shown.map((c, i) => (
          <button
            key={c.id}
            className={`battle-unit ${current === c.id ? "acting" : ""} ${selected === c.id ? "inspected" : ""} ${acted.includes(c.id) ? "acted" : ""}`}
            aria-label={`查看战斗角色 ${c.name}`}
            aria-pressed={selected === c.id}
            onClick={() => select(c.id)}
            style={
              { "--unit-color": c.color, "--unit-index": i } as CSSProperties
            }
          >
            <span className="battle-unit-state">
              {current === c.id
                ? "◆ 行动中"
                : acted.includes(c.id)
                  ? "✓ 已行动"
                  : "待行动"}
            </span>
            <span className="battle-figure">
              {urls[c.portrait] ? (
                <img src={urls[c.portrait]} alt="" draggable={false} />
              ) : (
                <span className="battle-token-fallback">
                  {c.name.slice(0, 1)}
                </span>
              )}
            </span>
            <strong title={c.name}>{c.name}</strong>
            {(gm || c.kind === "pc") && (
              <span className="battle-vitals">
                <span className="battle-hp-track">
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(100, (c.hp / Math.max(1, derived(c).hp)) * 100))}%`,
                    }}
                  />
                </span>
                <small>
                  HP {c.hp} <span>MP {c.mp}</span>
                </small>
              </span>
            )}
            {!!c.statuses.length && (
              <span className="battle-statuses" title={c.statuses.join(" · ")}>
                {c.statuses.join(" · ")}
              </span>
            )}
          </button>
        ))}
        {!members.length && (
          <p className="battle-no-members">尚未选择参战人物</p>
        )}
      </div>
    </section>
  );
}
