import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Command, Scene, Session } from "../shared/types";
import { Portrait } from "./Common";
import { TheatrePortrait } from "./TheatrePortrait";
import { TheatrePerformanceTools } from "./TheatrePerformanceTools";
import { theatreLayout } from "../shared/theatre";
import { useTheatreSpeaker } from "./TheatreContext";
import "../styles/theatre.css";
import "../styles/theatre-actions.css";

export function Theatre({
  scene,
  session: { world, me, serverTime },
  urls,
  act,
  configure,
  reduced,
  setReduced,
  battle,
}: {
  scene: Scene;
  session: Session;
  urls: Record<string, string>;
  act: (c: Command) => Promise<boolean>;
  configure: () => void;
  reduced: boolean;
  setReduced: (value: boolean) => void;
  battle: boolean;
}) {
  const { speaker, chooseSpeaker } = useTheatreSpeaker();
  const [hidden, setHidden] = useState(false),
    [busy, setBusy] = useState(false);
  const gm = me.role === "gm";
  const frame = useRef<HTMLElement>(null);
  const portraits = useRef<HTMLDivElement>(null);
  const [toolsHost, setToolsHost] = useState<HTMLDivElement | null>(null);
  const [area, setArea] = useState({ width: 1000, height: 250 });
  const [capacity, setCapacity] = useState(6),
    [page, setPage] = useState(0);
  const [clearance, setClearance] = useState(64);
  const cast = [...scene.cast]
    .sort((a, b) => a.position - b.position)
    .flatMap((slot) => {
      const c = world.characters.find((c) => c.id === slot.actor && c.public);
      return c ? [{ slot, c }] : [];
    });
  const mine = cast.filter(({ c }) => gm || c.owner === me.id);
  const selected = mine.find(({ c }) => c.id === speaker);
  const pages = Math.max(1, Math.ceil(cast.length / capacity));
  const visibleCast = cast.slice(
    Math.min(page, pages - 1) * capacity,
    (Math.min(page, pages - 1) + 1) * capacity,
  );
  const placements = theatreLayout(
    visibleCast.map((x) => x.slot),
    area.width,
    Math.max(0, area.height - 24),
  );
  useEffect(() => {
    if (!frame.current) return;
    const hud = frame.current.parentElement?.querySelector(
      ".battle-command-bar, .exploration-hud",
    );
    const observer = new ResizeObserver(() => {
      const width = frame.current?.clientWidth ?? 1000;
      setCapacity(width < 450 ? 2 : width < 700 ? 3 : 6);
      if (portraits.current)
        setArea({
          width: portraits.current.clientWidth,
          height: portraits.current.clientHeight,
        });
      setClearance(hud ? Math.ceil(hud.getBoundingClientRect().height) : 0);
    });
    observer.observe(frame.current);
    if (portraits.current) observer.observe(portraits.current);
    if (hud) observer.observe(hud);
    return () => observer.disconnect();
  }, [scene.theatre, hidden, battle, scene.mode]);
  useEffect(() => {
    const index = cast.findIndex(({ c }) => c.id === world.focus);
    if (index >= 0) setPage(Math.floor(index / capacity));
  }, [world.focus, capacity]);
  useEffect(() => setHidden(false), [scene.id, scene.theatre]);
  async function run(c: Command) {
    if (busy) return;
    setBusy(true);
    try {
      await act(c);
    } finally {
      setBusy(false);
    }
  }
  function select(id: string) {
    chooseSpeaker(id);
    if (gm) void run({ type: "stage.focus", actor: id });
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !scene.theatre ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) ||
        document.querySelector("dialog[open],.table-drawer")
      )
        return;
      const item = mine[Number(e.key) - 1];
      if (item) {
        e.preventDefault();
        select(item.c.id);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [scene.theatre, mine.map((x) => x.c.id).join(","), busy]);
  if (!scene.theatre) return null;
  return (
    <>
      <button
        className="theatre-peek"
        onClick={() => setHidden(!hidden)}
        aria-pressed={!hidden}
        title="只影响自己的画面，不会结束全团演出"
      >
        {hidden ? "展开小剧场" : "暂收立绘"} <span>{hidden ? "⌃" : "⌄"}</span>
      </button>
      {!hidden && (
        <section
          ref={frame}
          style={
            {
              bottom: battle || scene.mode === "map" ? clearance : 0,
              "--theatre-clearance": `${battle || scene.mode === "map" ? clearance : 0}px`,
            } as CSSProperties
          }
          className={`theatre-overlay ${battle || scene.mode === "map" ? "over-play" : ""} ${reduced ? "still" : ""}`}
          aria-label="小剧场演出"
        >
          <div ref={portraits} className="theatre-portraits">
            {visibleCast.map(({ slot, c }) => {
              return (
                <TheatrePortrait
                  key={c.id}
                  slot={slot}
                  character={c}
                  urls={urls}
                  active={world.focus === c.id}
                  listening={!!world.focus}
                  owned={gm || c.owner === me.id}
                  busy={busy}
                  select={() => select(c.id)}
                  stageWidth={area.width}
                  areaHeight={area.height}
                  serverTime={serverTime}
                  {...placements[c.id]}
                />
              );
            })}
          </div>
          <div className="theatre-dialogue-shell">
            {world.speech ? (
              <TheatreLine
                key={world.speech.id}
                speech={world.speech}
                reduced={reduced}
              />
            ) : (
              <div className="theatre-line theatre-await">
                <span className="theatre-speaker">
                  {world.characters.find((c) => c.id === world.focus)?.name ||
                    "幕间"}
                </span>
                <p>{world.focus ? "正在倾听……" : "故事在此刻继续。"}</p>
                <small>场内发言会显示在这里</small>
              </div>
            )}
            <div className="theatre-controls">
              <div className="theatre-identities" aria-label="演出换角">
                {gm && (
                  <button
                    className={speaker === "" ? "selected" : ""}
                    onClick={() => select("")}
                    disabled={busy}
                  >
                    旁白
                  </button>
                )}
                {mine.map(({ c }, i) => (
                  <button
                    key={c.id}
                    className={speaker === c.id ? "selected" : ""}
                    title={`${i + 1} · ${c.name}`}
                    onClick={() => select(c.id)}
                    disabled={busy}
                  >
                    <Portrait
                      name={c.name}
                      src={urls[c.portrait]}
                      color={c.color}
                    />
                    <span>{c.name}</span>
                  </button>
                ))}
                {!mine.length && !gm && (
                  <small>观看演出 · 等待自己的角色登场</small>
                )}
              </div>
              <div className="theatre-control-actions">
                {pages > 1 && (
                  <div className="theatre-pages">
                    <button
                      aria-label="上一组立绘"
                      disabled={page <= 0}
                      onClick={() => setPage(page - 1)}
                    >
                      ‹
                    </button>
                    <small>
                      立绘 {Math.min(page + 1, pages)}/{pages}
                    </small>
                    <button
                      aria-label="下一组立绘"
                      disabled={page >= pages - 1}
                      onClick={() => setPage(page + 1)}
                    >
                      ›
                    </button>
                  </div>
                )}
                {selected && (
                  <>
                    <TheatrePerformanceTools
                      key={scene.id + selected.c.id}
                      scene={scene}
                      slot={selected.slot}
                      name={selected.c.name}
                      act={act}
                      host={toolsHost}
                      reduced={reduced}
                      enableMotion={() => setReduced(false)}
                    />
                    <select
                      aria-label="演出表情"
                      disabled={busy}
                      value={selected.slot.expression}
                      onChange={(e) =>
                        void run({
                          type: "stage.expression",
                          actor: selected.c.id,
                          expression: e.target.value,
                        })
                      }
                    >
                      <option value="">默认表情</option>
                      {selected.c.expressions.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                    <button
                      title="左右翻转当前立绘"
                      disabled={busy}
                      onClick={() =>
                        void run({
                          type: "theatre.mirror",
                          actor: selected.c.id,
                          mirrored: !selected.slot.mirrored,
                        })
                      }
                    >
                      镜像
                    </button>
                  </>
                )}
                <button
                  aria-pressed={!reduced}
                  onClick={() => setReduced(!reduced)}
                  title="本机的立绘过渡和逐字显示"
                >
                  {reduced ? "动态关" : "动态开"}
                </button>
                {gm && (
                  <>
                    {scene.cues.length > 0 && (
                      <button
                        disabled={
                          busy || scene.cueIndex >= scene.cues.length - 1
                        }
                        title={
                          scene.cues[scene.cueIndex + 1]?.text ||
                          "预制台词已结束"
                        }
                        onClick={() =>
                          void run({ type: "cue", index: scene.cueIndex + 1 })
                        }
                      >
                        下一句
                      </button>
                    )}
                    <button onClick={configure}>选角</button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run({
                          type: "theatre.configure",
                          scene: scene.id,
                          expected: scene.revision,
                          active: false,
                          actors: cast.map((x) => x.c.id),
                        })
                      }
                    >
                      谢幕
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="theatre-tools-host" ref={setToolsHost} />
          </div>
        </section>
      )}
    </>
  );
}

function TheatreLine({
  speech,
  reduced,
}: {
  speech: NonNullable<Session["world"]["speech"]>;
  reduced: boolean;
}) {
  const chars = Array.from(speech.text),
    [count, setCount] = useState(reduced ? chars.length : 0);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    if (reduced || complete) {
      setCount(chars.length);
      return;
    }
    const started = performance.now();
    const timer = window.setInterval(() => {
      const next = Math.min(
        chars.length,
        Math.floor((performance.now() - started) / 24),
      );
      setCount((current) => Math.max(current, next));
      if (next >= chars.length) clearInterval(timer);
    }, 32);
    return () => clearInterval(timer);
  }, [speech.id, reduced, complete]);
  return (
    <div className="theatre-line">
      <div className="theatre-line-heading">
        <strong className="theatre-speaker">{speech.name}</strong>
        <button
          onClick={() => setComplete(true)}
          disabled={count >= chars.length}
          title="立即显示完整台词"
        >
          {count < chars.length ? "显示全文 ▸" : "◆"}
        </button>
      </div>
      <p
        tabIndex={0}
        aria-label={`${speech.name}：${speech.text}`}
        onClick={() => setComplete(true)}
      >
        <span aria-hidden="true">{chars.slice(0, count).join("")}</span>
      </p>
    </div>
  );
}
