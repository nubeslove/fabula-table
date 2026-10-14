import { useEffect, useRef, useState } from "react";
import { sendsOnEnter } from "../lib/chat-input";
import type { ReactNode } from "react";
import { SceneMedia } from "./SceneMedia";
import { UiIcon } from "./TableChrome";
import { BattleStage } from "./BattleStage";
import { ExplorationMap } from "./ExplorationMap";
import type { Session, Command } from "../shared/types";
import { Portrait } from "./Common";
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
  openClock:(id?:string,placement?:"upper"|"lower")=>void;
};
export function Stage({
  session: { world: w, me },
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
  const s = w.scenes.find((s) => s.id === w.activeScene),
    gm = me.role === "gm",
    draftKey = "fu-drafts:" + w.id + ":" + me.id;
  const [speaker, setSpeaker] = useState(""),
    [speechOpen, setSpeechOpen] = useState(true),
    [battleDirector, setBattleDirector] = useState(false),
    [drafts, setDrafts] = useState<Record<string, string>>(() => {
      try {
        return JSON.parse(localStorage.getItem(draftKey) || "{}");
      } catch {
        return {};
      }
    }),
    [sound, setSound] = useState(false),
    audio = useRef<HTMLAudioElement>(null),
    [reduce, setReduce] = useState(
      () => localStorage.getItem("fu-reduce-motion") === "1",
    );
  const available = w.characters.filter((c) => gm || c.owner === me.id),
    selected = available.find((c) => c.id === speaker),
    cast = [...(s?.cast ?? [])].sort((a, b) => a.position - b.position);
  useEffect(() => {
    if (!gm && !available.some((c) => c.id === speaker))
      setSpeaker(available[0]?.id ?? "");
    if (gm && speaker && !cast.some((c) => c.actor === speaker)) setSpeaker("");
  }, [
    available.map((c) => c.id).join(","),
    cast.map((c) => c.actor).join(","),
    speaker,
    gm,
  ]);
  function select(id: string) {
    setSpeaker(id);
    if (gm) void act({ type: "stage.focus", actor: id });
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        !gm ||
        w.battle.active ||
        s?.mode === "battle" ||
        s?.mode === "map" ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) ||
        document.querySelector("dialog[open], .table-drawer")
      )
        return;
      const slot = cast[Number(e.key) - 1];
      if (slot) {
        e.preventDefault();
        select(slot.actor);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [cast.map((c) => c.actor).join(","), gm, w.battle.active, s?.mode]);
  useEffect(() => {
    if (sound && audio.current)
      void audio.current.play().catch(() => setSound(false));
  }, [s?.audio, sound, urls[s?.audio ?? ""]]);
  useEffect(() => setSpeechOpen(true), [w.speech?.id]);
  if (!s) return <div className="empty">等待 GM 打开场景。</div>;
  const battleView = w.battle.active || s.mode === "battle";
  const playView = battleView || s.mode === "map";
  const background = urls[s.background],
    backgroundAsset = w.assets.find((a) => a.id === s.background);
  async function say() {
    const text = drafts[speaker]?.trim();
    if (text && (await act({ type: "say", actor: speaker, text }))) {
      const next = { ...drafts, [speaker]: "" };
      setDrafts(next);
      localStorage.setItem(draftKey, JSON.stringify(next));
    }
  }
  async function playCue(index: number) {
    if (await act({ type: "cue", index }))
      setSpeaker(s?.cues[index]?.actor ?? "");
  }
  return (
    <section className={"stage-section " + (reduce ? "reduce-motion" : "")}>
      <div className="scene-caption">
        <div className="scene-title">
          <span className="scene-type">
            {battleView ? "冲突" : s.mode === "map" ? "探索" : "演出"}
          </span>
          <h2 title={s.name}>{s.name}</h2>
        </div>
        <div className="scene-hud">{hud}</div>
        {playView && (
          <button
            className="battle-narrate-toggle"
            onClick={() => setBattleDirector(!battleDirector)}
            aria-pressed={battleDirector}
            title="展开或收起演出台词"
          >
            台词
          </button>
        )}
        <div className="scene-shortcuts">
          <button onClick={record} aria-label="记录线索" title="记录线索">
            <UiIcon path="M5 3h13v18H5z M8 7h7 M8 11h7 M8 15h4" />
          </button>
          <button onClick={tools} aria-label="打开跑团工具" title="行动与冲突">
            <UiIcon path="M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10" />
          </button>
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
            session={{ world: w, me }}
            urls={urls}
            act={act}
            prepare={prepare}
            error={actionError}
          />
        ) : (
          <SceneMedia
            url={background}
            video={backgroundAsset?.mime.startsWith("video/")}
          />
        )}
        {!background && !playView && (
          <div className="stage-motif">
            <span>✦</span>
            <p>让故事，在此相遇</p>
          </div>
        )}
        {battleView && (
          <BattleStage
            openClock={openClock}
            session={{ world: w, me }}
            urls={urls}
            act={act}
            configure={configureBattle}
            error={actionError}
          />
        )}
        {!battleView && s.mode !== "map" && (
          <div className="cast-stage">
            {cast.map((slot, castIndex) => {
              const c = w.characters.find((c) => c.id === slot.actor);
              if (!c) return null;
              const src =
                  urls[
                    c.expressions.find((e) => e.id === slot.expression)
                      ?.asset || c.portrait
                  ],
                active = w.focus === c.id;
              return (
                <button
                  key={c.id}
                  className={
                    "cast-member " +
                    (active ? "speaking" : "listening") +
                    (!w.focus ? " no-focus" : "")
                  }
                  style={
                    {
                      left: `${((castIndex + 1) / (cast.length + 1)) * 100}%`,
                      width: `${Math.min(28, 100 / (cast.length + 1))}%`,
                      "--character-color": c.color,
                    } as React.CSSProperties
                  }
                  onClick={() => {
                    if (gm || c.owner === me.id) select(c.id);
                  }}
                  title={gm ? "切换到 " + c.name : c.name}
                >
                  <Portrait name={c.name} src={src} color={c.color} />
                  <span className="cast-name">{c.name}</span>
                </button>
              );
            })}
          </div>
        )}
        {w.speech && speechOpen && (!playView || battleDirector) && (
          <div
            className="dialogue"
            key={w.speech.id}
            tabIndex={0}
            aria-label="舞台台词"
          >
            <button
              className="dialogue-hide"
              aria-label="收起舞台台词"
              title="收起台词，查看完整场景"
              onClick={() => setSpeechOpen(false)}
            >
              −
            </button>
            <strong>{w.speech.name}</strong>
            <p>{w.speech.text}</p>
            <span className="dialogue-diamond">◆</span>
          </div>
        )}
        {w.speech && !speechOpen && (!playView || battleDirector) && (
          <button
            className="dialogue-reopen"
            onClick={() => setSpeechOpen(true)}
            title="展开最近的台词"
          >
            {w.speech.name} · 查看台词
          </button>
        )}
      </div>
      {s.audio && urls[s.audio] && (
        <audio ref={audio} src={urls[s.audio]} loop muted={!sound} />
      )}
      {(!playView || battleDirector) && (
        <div className="director">
          <div className="director-toolbar">
            <select
              className="speaker-select"
              aria-label="发言角色"
              value={speaker}
              onChange={(e) => select(e.target.value)}
            >
              {gm ? (
                <>
                  <option value="">旁白</option>
                  {cast.map((slot) => {
                    const c = w.characters.find((c) => c.id === slot.actor);
                    return (
                      c && (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      )
                    );
                  })}
                </>
              ) : (
                <>
                  {!available.length && <option value="">先创建角色</option>}
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </>
              )}
            </select>
            {gm && (
              <div className="director-cast" aria-label="快捷换角">
                {cast.map((slot, i) => {
                  const c = w.characters.find((c) => c.id === slot.actor);
                  return (
                    c && (
                      <button
                        key={c.id}
                        title={c.name}
                        className={speaker === c.id ? "selected" : ""}
                        onClick={() => select(c.id)}
                      >
                        <kbd>{i + 1}</kbd>
                        <span>{c.name}</span>
                      </button>
                    )
                  );
                })}
              </div>
            )}
            {gm && s.cues.length > 0 && (
              <button
                className="cue-next"
                title={s.cues[s.cueIndex + 1]?.text || "台词已结束"}
                disabled={s.cueIndex >= s.cues.length - 1}
                onClick={() => void playCue(s.cueIndex + 1)}
              >
                下一句
              </button>
            )}
            <details
              className="director-settings"
              onKeyDown={(e) => {
                if (e.key === "Escape") e.currentTarget.open = false;
              }}
            >
              <summary title="演出设置">
                <UiIcon path="M4 7h16 M7 4v6 M4 17h16 M16 14v6" />
                <span>演出设置</span>
              </summary>
              <div className="director-settings-popover">
                <strong>演出控制</strong>
                {gm && (
                  <label className="field">
                    <span>让角色登场</span>
                    <select
                      aria-label="让角色登场"
                      value=""
                      onChange={(e) =>
                        void act({
                          type: "stage.cast",
                          actor: e.target.value,
                          present: true,
                        })
                      }
                    >
                      <option value="">选择角色</option>
                      {w.characters
                        .filter(
                          (c) =>
                            c.public && !cast.some((x) => x.actor === c.id),
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {selected && gm && (
                  <div className="row">
                    <select
                      aria-label="角色表情"
                      value={
                        s.cast.find((x) => x.actor === speaker)?.expression ??
                        ""
                      }
                      onChange={(e) =>
                        void act({
                          type: "stage.expression",
                          actor: speaker,
                          expression: e.target.value,
                        })
                      }
                    >
                      <option value="">默认立绘</option>
                      {selected.expressions.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={async () => {
                        if (
                          await act({
                            type: "stage.cast",
                            actor: speaker,
                            present: false,
                          })
                        )
                          setSpeaker("");
                      }}
                    >
                      退场
                    </button>
                  </div>
                )}
                <div className="row wrap">
                  <button
                    onClick={() => {
                      setReduce(!reduce);
                      localStorage.setItem(
                        "fu-reduce-motion",
                        reduce ? "0" : "1",
                      );
                    }}
                  >
                    {reduce ? "动态：关" : "动态：开"}
                  </button>
                  {s.audio && (
                    <button onClick={() => setSound(!sound)}>
                      {sound ? "静音" : "开启声音"}
                    </button>
                  )}
                </div>
                {gm && s.cues.length > 0 && (
                  <div className="cue-controls">
                    <p>{s.cues[s.cueIndex + 1]?.text || "本幕台词已结束"}</p>
                    <div className="row">
                      <button
                        disabled={s.cueIndex <= 0}
                        onClick={() => void playCue(s.cueIndex - 1)}
                      >
                        上一句
                      </button>
                      <button
                        disabled={s.cueIndex < 0}
                        onClick={() => void playCue(s.cueIndex)}
                      >
                        重播本句
                      </button>
                    </div>
                  </div>
                )}
                <small>
                  {gm
                    ? "1–6 快速换角；每个角色保留独立草稿。"
                    : "台词同步到全团舞台；普通讨论使用聊天栏。"}
                </small>
              </div>
            </details>
          </div>
          <div className="compose">
            <textarea
              aria-label="台词"
              rows={2}
              placeholder={selected ? `${selected.name} 想说……` : "写下旁白……"}
              value={drafts[speaker] || ""}
              onChange={(e) => {
                const next = { ...drafts, [speaker]: e.target.value };
                setDrafts(next);
                localStorage.setItem(draftKey, JSON.stringify(next));
              }}
              onKeyDown={(e) => {
                if (sendsOnEnter(e)) {
                  e.preventDefault();
                  void say();
                }
              }}
              maxLength={4000}
            />
            <button
              className="primary"
              disabled={!drafts[speaker]?.trim() || (!gm && !selected)}
              onClick={() => void say()}
            >
              送上舞台<span>Enter · Shift 换行</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
