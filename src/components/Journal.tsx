import { useState } from "react";
import type { Command, JournalEntry, Session } from "../shared/types";
import { download } from "../lib/api";
import { Empty, Field, Modal } from "./Common";

export function Journal({
  session: { world, me },
  act,
  edit,
  create,
}: {
  session: Session;
  act: (c: Command) => Promise<boolean>;
  edit: (entry: JournalEntry) => void;
  create: () => void;
}) {
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [archived, setArchived] = useState(false);
  const entries = [...world.journal]
    .filter(
      (e) =>
        (archived || !e.archived) &&
        (kind === "all" || e.kind === kind) &&
        `${e.title}\n${e.text}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  function exportEntries() {
    const text =
      `# ${world.title} · 冒险日志\n\n` +
      entries
        .map(
          (e) =>
            `## ${e.title}\n\n${e.kind === "clue" ? "线索" : "纪要"} · ${e.public ? "全团可见" : "私密"}${e.archived ? " · 已归档" : ""}\n\n${e.text}\n`,
        )
        .join("\n---\n\n");
    download(
      `FU-${world.id}-冒险日志.md`,
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
    );
  }
  return (
    <section className="journal-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ADVENTURE JOURNAL</span>
          <h2>冒险日志</h2>
        </div>
        <button className="primary" onClick={create}>
          ＋ 记一条线索
        </button>
      </div>
      <p className="muted">
        把发现与约定留在这里。线索独立保存，也可以从右侧聊天中摘录。
      </p>
      <div className="journal-filters">
        <input
          aria-label="搜索日志"
          placeholder="搜索人物、地点、线索内容……"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="日志类型"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">全部类型</option>
          <option value="clue">线索</option>
          <option value="note">纪要</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          包括已归档
        </label>
        <button onClick={exportEntries} disabled={!entries.length}>
          导出当前列表
        </button>
      </div>
      <div className="journal-grid">
        {entries.map((e) => (
          <article
            key={e.id}
            className={`journal-card ${e.archived ? "archived" : ""}`}
          >
            <div className="row wrap">
              <span className="journal-symbol">
                {e.kind === "clue" ? "◈" : "≡"}
              </span>
              <span className="eyebrow">
                {e.kind === "clue" ? "线索" : "纪要"}
              </span>
              <span className="tag">{e.public ? "全团可见" : "私密"}</span>
              {e.archived && <span className="tag">已归档</span>}
            </div>
            <h3>{e.title}</h3>
            <p>{e.text}</p>
            <footer>
              <small>
                {world.members.find((m) => m.id === e.author)?.name ?? "成员"} ·{" "}
                {new Date(e.updatedAt).toLocaleDateString("zh-CN")}
              </small>
              {(me.role === "gm" || e.author === me.id) && (
                <div className="row">
                  <button onClick={() => edit(e)}>编辑</button>
                  <button
                    className="quiet"
                    onClick={() =>
                      void act({
                        type: "journal.archive",
                        id: e.id,
                        value: !e.archived,
                        expected: e.revision,
                      })
                    }
                  >
                    {e.archived ? "恢复" : "归档"}
                  </button>
                </div>
              )}
            </footer>
          </article>
        ))}
      </div>
      {!entries.length && (
        <Empty>
          {query
            ? "没有匹配的日志。试试人物名或地点名。"
            : "旅途中的线索、猜想与约定，都可以记在这里。"}
        </Empty>
      )}
    </section>
  );
}

export function JournalEditor({
  initial,
  isNew,
  session,
  error,
  save,
  close,
}: {
  initial: JournalEntry;
  isNew: boolean;
  session: Session;
  error: string;
  save: (value: JournalEntry, expected: number | null) => Promise<boolean>;
  close: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={isNew ? "记下发现" : "编辑冒险日志"}
      error={error}
      onClose={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (await save(draft, isNew ? null : initial.revision)) close();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="日志标题">
          <input
            required
            maxLength={160}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="旧灯塔的第三声钟响"
          />
        </Field>
        <Field label="内容">
          <textarea
            required
            rows={9}
            maxLength={12000}
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            placeholder="发现了什么？来自谁？接下来想确认什么？"
          />
        </Field>
        <div className="form-grid">
          <Field label="记录类型">
            <select
              value={draft.kind}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  kind: e.target.value as JournalEntry["kind"],
                })
              }
            >
              <option value="clue">线索</option>
              <option value="note">纪要</option>
            </select>
          </Field>
          <Field label="谁能看到">
            <select
              value={draft.public ? "public" : "private"}
              onChange={(e) =>
                setDraft({ ...draft, public: e.target.value === "public" })
              }
            >
              <option value="public">全团可见</option>
              <option value="private">
                {session.me.role === "gm" ? "私密 · 作者与 GM" : "仅自己与 GM"}
              </option>
            </select>
          </Field>
        </div>
        <button
          className="primary"
          disabled={busy || !draft.title.trim() || !draft.text.trim()}
        >
          {busy ? "保存中…" : "保存日志"}
        </button>
      </form>
    </Modal>
  );
}
