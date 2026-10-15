import { useEffect, useRef, useState, type ReactNode } from "react";
import { SceneMedia } from "./SceneMedia";
import { UiIcon } from "./TableChrome";
import { BattleStage } from "./BattleStage";
import { ExplorationMap } from "./ExplorationMap";
import { Theatre } from "./Theatre";
import { TheatreSetup } from "./TheatreSetup";
import type { Session, Command } from "../shared/types";
type Props = {
  session: Session;
  urls: Record<string, string>;
  act: (c: Command) => Promise<boolean>;
  hud: ReactNode;
  record: () => void;
  tools: () => void;
  prepare: () => void;
  configureBattle: () => void;
  actionError: string;
  openClock: (id?: string, placement?: "upper" | "lower") => void;
};
export function Stage({
  session,
  urls,
  act,
  hud,
  record,
  tools,
  prepare,
  configureBattle,
  actionError,
  openClock,
}: Props) {
  const { world: w, me } = session,
    s = w.scenes.find((s) => s.id === w.activeScene),
    gm = me.role === "gm";
  const [setup, setSetup] = useState(false),
    [sound, setSound] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const [reduce, setReduce] = useState(
    () =>
      localStorage.getItem("fu-reduce-motion") === "1" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (sound && audio.current)
      void audio.current.play().catch(() => setSound(false));
  }, [s?.audio, sound, urls[s?.audio ?? ""]]);
  useEffect(() => setSetup(false), [s?.id]);
  if (!s) return <div className="empty">等待 GM 打开场景。</div>;
  const battleView = w.battle.active || s.mode === "battle",
    background = urls[s.background];
  return (
    <section className={"stage-section " + (reduce ? "reduce-motion" : "")}>
      <div className="scene-caption">
        <div className="scene-title">
          <span className="scene-type">
            {battleView ? "冲突" : s.mode === "map" ? "探索" : "贴图"}
          </span>
          <h2 title={s.name}>{s.name}</h2>
        </div>
        <div className="scene-hud">{hud}</div>
        {gm ? (
          <button
            className={`theatre-launch ${s.theatre ? "selected" : ""}`}
            aria-pressed={!!s.theatre}
            onClick={() => setSetup(true)}
          >
            <UiIcon path="M3 4h18v14H3z M3 7c4 6 6 0 6-3 M21 7c-4 6-6 0-6-3 M9 21h6" />
            {s.theatre ? "演出中" : "小剧场"}
          </button>
        ) : (
          s.theatre && <small className="theatre-live">小剧场 · 演出中</small>
        )}
        <div className="scene-shortcuts">
          <button onClick={record} aria-label="记录线索" title="记录线索">
            <UiIcon path="M5 3h13v18H5z M8 7h7 M8 11h7 M8 15h4" />
          </button>
          <button onClick={tools} aria-label="打开跑团工具" title="行动与冲突">
            <UiIcon path="M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10" />
          </button>
          {s.audio && (
            <button
              onClick={() => setSound(!sound)}
              title={sound ? "关闭背景音乐" : "播放背景音乐"}
              aria-label={sound ? "关闭背景音乐" : "播放背景音乐"}
            >
              <UiIcon path="M9 18V5l11-2v13 M9 8l11-2 M5 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M16 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />
            </button>
          )}
          {gm && (
            <button onClick={prepare} aria-label="准备本幕" title="准备本幕">
              <UiIcon path="M4 4h16v16H4z M4 16l5-5 4 4 3-3 4 4 M15 7h.01" />
            </button>
          )}
        </div>
      </div>
      <div
        className={
          "stage " +
          (battleView ? "jrpg-stage" : s.mode === "map" ? "map-stage" : "")
        }
      >
        {!battleView && s.mode === "map" ? (
          <ExplorationMap
            key={s.id}
            scene={s}
            session={session}
            urls={urls}
            act={act}
            prepare={prepare}
            error={actionError}
          />
        ) : (
          <SceneMedia
            url={background}
            video={w.assets
              .find((a) => a.id === s.background)
              ?.mime.startsWith("video/")}
          />
        )}
        {!background && !battleView && s.mode !== "map" && (
          <div className="stage-motif">
            <span>✦</span>
            <p>让故事，在此相遇</p>
          </div>
        )}
        {battleView && (
          <BattleStage
            openClock={openClock}
            session={session}
            urls={urls}
            act={act}
            configure={configureBattle}
            error={actionError}
          />
        )}
        <Theatre
          key={s.id}
          scene={s}
          session={session}
          urls={urls}
          act={act}
          configure={() => setSetup(true)}
          reduced={reduce}
          setReduced={(value) => {
            setReduce(value);
            localStorage.setItem("fu-reduce-motion", value ? "1" : "0");
          }}
          battle={battleView}
        />
      </div>
      {s.audio && urls[s.audio] && (
        <audio ref={audio} src={urls[s.audio]} loop muted={!sound} />
      )}
      {setup && gm && (
        <TheatreSetup
          key={s.id}
          scene={s}
          world={w}
          urls={urls}
          act={act}
          close={() => setSetup(false)}
          error={actionError}
        />
      )}
    </section>
  );
}
