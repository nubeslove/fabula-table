import { useEffect, useRef, useState } from "react";
import type { Command, Log, Session } from "../shared/types";
import { LOG_CHANNELS, logChannel } from "../shared/logs";
import { Empty } from "./Common";

export function StoryLog({
  session: { world, me },
  act,
  extract,
  openJournal,
  expanded,
  toggle,
}: {
  session: Session;
  act: (c: Command) => Promise<boolean>;
  extract: (log: Log) => void;
  openJournal: () => void;
  expanded: boolean;
  toggle: () => void;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState<keyof typeof LOG_CHANNELS>("ic"),
    [mode, setMode] = useState<"ic" | "ooc">("ic"),
    [actorId, setActor] = useState("");
  const actors = world.characters.filter(
    (c) => c.public && (me.role === "gm" || c.owner === me.id),
  );
  const actor =
    actors.find((c) => c.id === actorId) ??
    actors.find((c) => c.kind === "pc" && c.owner === me.id) ??
    actors[0];
  const scroll = useRef<HTMLDivElement>(null),
    follow = useRef(true);
  const logs = world.logs.filter((l) => logChannel(l) === filter);
  useEffect(() => {
    if (scroll.current && follow.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [logs.at(-1)?.id, expanded, filter]);
  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      if (
        await act({
          type: "chat",
          text,
          channel: mode,
          actor: mode === "ic" ? actor?.id : undefined,
        })
      ) {
        setText("");
        follow.current = true;
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={`log-panel ${expanded ? "" : "collapsed"}`}
      aria-label="聊天与记录"
    >
      <header>
        <div>
          <span className="eyebrow">AT THE TABLE</span>
          <h3>聊天与记录</h3>
        </div>
        <div className="row">
          <button className="quiet" onClick={openJournal}>
            线索日志
          </button>
          <button
            className="icon"
            aria-label={expanded ? "收起故事记录" : "展开故事记录"}
            onClick={toggle}
          >
            {expanded ? "−" : "＋"}
          </button>
        </div>
      </header>
      <div className="log-filter" hidden={!expanded}>
        {Object.entries(LOG_CHANNELS).map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? "selected" : ""}
            onClick={() => {
              setFilter(id as keyof typeof LOG_CHANNELS);
              if (id === "ic" || id === "ooc") setMode(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        hidden={!expanded}
        ref={scroll}
        className="log-scroll"
        onScroll={(e) => {
          const p = e.currentTarget;
          follow.current = p.scrollHeight - p.scrollTop - p.clientHeight < 80;
        }}
      >
        {!logs.length && <Empty>讨论、行动和掷骰会留在这里。</Empty>}
        {logs.map((l) => (
          <article className={`log-entry ${l.kind}`} key={l.id}>
            <div>
              <strong>
                {l.name}
                {logChannel(l) === "ooc" && (
                  <small className="chat-label">讨论</small>
                )}
              </strong>
              <time>
                {new Date(l.at).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
            <p>{l.text}</p>
            {l.roll && (
              <div className="dice-result">
                {l.roll.values.map((n, i) => (
                  <span key={i}>
                    <b>{n}</b>
                    <small>d{l.roll!.sides[i]}</small>
                  </span>
                ))}
                <strong>
                  = {l.roll.values.reduce((n, x) => n + x, l.roll.modifier)}
                </strong>
              </div>
            )}
            <div className="log-entry-actions">
              {l.private && <small>仅 GM</small>}
              <button className="quiet" onClick={() => extract(l)}>
                ◈ 存为线索
              </button>
            </div>
          </article>
        ))}
      </div>
      <form
        className="chat-compose"
        hidden={!expanded}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="chat-identity">
          <select
            aria-label="发言频道"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as "ic" | "ooc");
              setFilter(e.target.value as "ic" | "ooc");
            }}
          >
            <option value="ic">场内</option>
            <option value="ooc">场外</option>
          </select>
          {mode === "ic" ? (
            <select
              aria-label="发言角色"
              value={actor?.id ?? ""}
              onChange={(e) => setActor(e.target.value)}
            >
              {actors.length ? (
                actors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              ) : (
                <option value="">请先创建角色</option>
              )}
            </select>
          ) : (
            <strong>{me.name}</strong>
          )}
        </div>
        <textarea
          aria-label="聊天内容"
          placeholder="写下此刻想说的话……"
          rows={2}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div>
          <small>{mode === "ic" ? "以角色身份发言" : "以玩家身份发言"}</small>
          <button
            className="primary"
            disabled={busy || !text.trim() || (mode === "ic" && !actor)}
          >
            {busy ? "发送中" : "发送"}
          </button>
        </div>
      </form>
      <footer hidden={!expanded}>
        <span>房间 {world.id}</span>
        <span>线索保存在独立日志</span>
      </footer>
    </section>
  );
}
