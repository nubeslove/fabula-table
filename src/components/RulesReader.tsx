import { useEffect, useMemo, useRef, useState } from "react";
import { EXPANSIONS, expansionName } from "../shared/expansions";
import { ErrorText } from "./Common";
import { reflowText, searchablePage } from "../lib/book-layout";
import type { BookBlock, BookPage, BookSection } from "../lib/book-layout";
interface Doc {
  expansion?: string;
  id: string;
  title: string;
  kind: string;
  file: string;
  pages: number;
}
interface Book {
  note?: string;
  title: string;
  source: string;
  pages: BookPage[];
  sections?: BookSection[];
}
export function RulesReader({ enabled = [] }: { enabled?: string[] }) {
  const [docs, setDocs] = useState<Doc[]>([]),
    [book, setBook] = useState<Book | null>(null),
    [selected, setSelected] = useState("core"),
    [page, setPage] = useState(0),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [tocOpen, setTocOpen] = useState(false),
    [raw, setRaw] = useState(false),
    [anchor, setAnchor] = useState<number | undefined>(),
    [expanded, setExpanded] = useState<number[]>([]);
  const reading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch(new URL("official/manifest.json", document.baseURI), {
      signal: abort.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("规则资料暂不可用");
        return r.json();
      })
      .then((d) => setDocs(d.documents))
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const doc = docs.find((x) => x.id === selected);
    if (!doc) return;
    const abort = new AbortController();
    setBook(null);
    setError("");
    setQuery("");
    setRaw(false);
    fetch(new URL(doc.file, document.baseURI), { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error("本书读取失败，请重新选择资料");
        return r.json();
      })
      .then((data: Book) => {
        setBook(data);
        setAnchor(undefined);
        setPage(
          (data.sections?.find((s) => s.title === "游戏规则")?.page ?? 1) - 1,
        );
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [docs, selected]);
  const sections = book?.sections ?? [],
    current = book?.pages[page];
  const groups = useMemo(() => {
    const result: {
      title: string;
      page: number;
      block?: number;
      children: BookSection[];
    }[] = [];
    for (const s of book?.sections ?? []) {
      if (!s.depth || !result.length) result.push({ ...s, children: [] });
      else result[result.length - 1].children.push(s);
    }
    return result;
  }, [book]);
  const precedesPosition = (s: { page: number; block?: number }) =>
    s.page < page + 1 ||
    (s.page === page + 1 && (s.block ?? 0) <= (anchor ?? 0));
  const activeGroup = groups.reduce(
    (found, g, i) => (precedesPosition(g) ? i : found),
    -1,
  );
  const activeSection = [...sections].reverse().find(precedesPosition);
  const searchPages = useMemo(
    () => book?.pages.map((p, i) => ({ p, i, text: searchablePage(p) })) ?? [],
    [book],
  );
  const term = query.trim(),
    matches = term
      ? searchPages.filter((p) =>
          p.text.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
        )
      : [];
  useEffect(() => {
    setExpanded((old) =>
      old.includes(activeGroup) ? old : [...old, activeGroup],
    );
  }, [activeGroup, book]);
  useEffect(() => {
    const el =
      anchor === undefined
        ? null
        : reading.current?.querySelector<HTMLElement>(
            `[data-book-block="${anchor}"]`,
          );
    if (el && reading.current)
      reading.current.scrollTop +=
        el.getBoundingClientRect().top -
        reading.current.getBoundingClientRect().top;
    else reading.current?.scrollTo({ top: 0 });
  }, [page, selected, raw, anchor]);
  function jump(n: number, block?: number) {
    setPage(n);
    setAnchor(block);
    setTocOpen(false);
  }
  return (
    <section className="bounded-panel rule-reader">
      <div className="workspace-toolbar reader-controls">
        <select
          aria-label="选择资料"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {["core", ...EXPANSIONS.map((e) => e.id)].map((group) => (
            <optgroup
              key={group}
              label={
                group === "core"
                  ? "核心规则"
                  : expansionName(group) +
                    (enabled.includes(group) ? " · 已启用" : " · 参考资料")
              }
            >
              {docs
                .filter((d) => (d.expansion ?? "core") === group)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <input
          type="search"
          aria-label="在本书内搜索"
          disabled={!book}
          placeholder="搜索本书…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value) setTocOpen(true);
          }}
        />
        <button
          className="reader-toc-toggle"
          aria-expanded={tocOpen}
          onClick={() => setTocOpen(!tocOpen)}
        >
          {tocOpen ? "收起目录" : "目录"}
        </button>
      </div>
      <ErrorText text={error} />
      <div className={`reader-layout ${tocOpen ? "toc-open" : ""}`}>
        <nav className="reader-contents" aria-label="规则书章节目录">
          <strong className="directory-label">
            {term ? `搜索结果 · ${matches.length} 页` : "章节目录"}
          </strong>
          {term
            ? matches.map(({ p, i, text }) => {
                const at = text
                  .toLocaleLowerCase()
                  .indexOf(term.toLocaleLowerCase());
                return (
                  <button
                    className={`reader-search-hit ${i === page ? "selected" : ""}`}
                    key={i}
                    onClick={() => jump(i)}
                  >
                    <b>第 {p.printed ?? p.number} 页</b>
                    <span>
                      {text.slice(Math.max(0, at - 14), at + term.length + 38)}
                    </span>
                  </button>
                );
              })
            : groups.map((g, i) => (
                <div className="reader-chapter" key={i}>
                  <div className="reader-chapter-heading">
                    <button
                      aria-label={`${expanded.includes(i) ? "收起" : "展开"}${g.title}目录`}
                      aria-expanded={expanded.includes(i)}
                      onClick={() =>
                        setExpanded(
                          expanded.includes(i)
                            ? expanded.filter((n) => n !== i)
                            : [...expanded, i],
                        )
                      }
                    >
                      {expanded.includes(i) ? "▾" : "▸"}
                    </button>
                    <button
                      className={activeGroup === i ? "selected" : ""}
                      onClick={() => jump(g.page - 1, g.block)}
                    >
                      {g.title}
                    </button>
                  </div>
                  {expanded.includes(i) &&
                    g.children.map((s, j) => (
                      <button
                        className={`reader-section ${s === activeSection ? "selected" : ""}`}
                        style={{ paddingLeft: 12 + Math.min(3, s.depth) * 10 }}
                        aria-current={
                          s === activeSection ? "location" : undefined
                        }
                        key={j}
                        onClick={() => jump(s.page - 1, s.block)}
                      >
                        <span>{s.title}</span>
                        <small>
                          {book?.pages[s.page - 1]?.printed ?? s.page}
                        </small>
                      </button>
                    ))}
                </div>
              ))}
          {!term && !groups.length && (
            <p className="muted">这份资料没有原书目录，可用关键词搜索。</p>
          )}
          {term && !matches.length && <p className="muted">没有匹配的内容。</p>}
        </nav>
        <div
          className="reader-reading"
          ref={reading}
          tabIndex={0}
          aria-label="规则正文"
        >
          {book && current ? (
            <article className="rule-article">
              <div className="reader-breadcrumb">
                {book.title}
                {activeSection && ` / ${activeSection.title}`}
              </div>
              {book.note && <p className="notice">{book.note}</p>}
              {raw ? (
                <div className="reader-raw">{current.text}</div>
              ) : (
                <BookContent
                  blocks={current.blocks ?? reflowText(current, sections)}
                />
              )}
              <p className="reader-source">
                来源：{book.source} · 资料第 {current.number} 页
                {current.printed !== null && ` / 印刷第 ${current.printed} 页`}
              </p>
            </article>
          ) : (
            <p className="workspace-empty">
              {error ? "请选择资料重试。" : "正在读取规则文本…"}
            </p>
          )}
        </div>
      </div>
      {book && current && (
        <footer className="reader-pagination">
          <button disabled={page === 0} onClick={() => jump(page - 1)}>
            ← 上页
          </button>
          <label>
            资料页{" "}
            <input
              aria-label="跳转资料页"
              type="number"
              min={1}
              max={book.pages.length}
              value={page + 1}
              onChange={(e) =>
                jump(
                  Math.max(
                    0,
                    Math.min(book.pages.length - 1, +e.target.value - 1),
                  ),
                )
              }
            />{" "}
            / {book.pages.length}
          </label>
          <button
            disabled={page + 1 === book.pages.length}
            onClick={() => jump(page + 1)}
          >
            下页 →
          </button>
          <button
            className="reader-raw-toggle"
            aria-pressed={raw}
            title="对照原始提取文本"
            onClick={() => setRaw(!raw)}
          >
            {raw ? "排版正文" : "原始文本"}
          </button>
        </footer>
      )}
    </section>
  );
}
function BookContent({ blocks }: { blocks: BookBlock[] }) {
  if (!blocks.length)
    return <p className="muted">本页为插画或空白页，无正文。</p>;
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "table") {
          const cols = Math.max(...b.rows.map((r) => r.length));
          return (
            <div className="rule-table-wrap" key={i}>
              <table>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((text, k) =>
                        j === 0 ? (
                          <th key={k} colSpan={r.length === 1 ? cols : 1}>
                            {text}
                          </th>
                        ) : (
                          <td key={k} colSpan={r.length === 1 ? cols : 1}>
                            {text}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.kind === "h")
          return b.level === 2 ? (
            <h2 key={i} data-book-block={i}>
              {b.text}
            </h2>
          ) : (
            <h3 key={i} data-book-block={i}>
              {b.text}
            </h3>
          );
        if (b.kind === "li")
          return (
            <p className="rule-bullet" key={i}>
              {b.text}
            </p>
          );
        return <p key={i}>{b.text}</p>;
      })}
    </>
  );
}
