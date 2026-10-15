import { baseArtById } from "../shared/base-library";
import { useEntryDeleteMenu } from "./EntryDeleteMenu";
import { useState } from "react";
import type { Command, Scene, World } from "../shared/types";
import { newScene } from "../shared/rules";
import { api, download, uid } from "../lib/api";

const modes = { stage: "贴图", map: "探索", battle: "冲突" };
export function SceneDirectory({
  world: w,
  urls,
  act,
  edit,
  notes,
  opened,
  error,
}: {
  world: World;
  urls: Record<string, string>;
  act: (c: Command) => Promise<boolean>;
  edit: (value: { scene: Scene; isNew: boolean }) => void;
  notes: () => void;
  opened: () => void;
  error: (text: string) => void;
}) {
  const menu = useEntryDeleteMenu(act);
  const deletion = (s: Scene) => ({
    id: s.id,
    name: s.name,
    type: "scene.delete" as const,
    detail: `删除场景及其 Token、台词和关联的冲突命刻，人物卡与素材文件保留。${s.id === w.activeScene ? "当前场景删除后会结束冲突并回到空白舞台。" : ""}`,
  });
  const [folder, setFolder] = useState("*"),
    [query, setQuery] = useState(""),
    [mode, setMode] = useState("");
  const folders = [...new Set(w.scenes.map((s) => s.folder?.trim() || ""))];
  const activeFolder =
    folder === "*" || folders.includes(folder) ? folder : "*";
  const entries = w.scenes.filter(
    (s) =>
      (activeFolder === "*" || (s.folder || "") === activeFolder) &&
      (!mode || mode === s.mode) &&
      s.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const categories = [
    { value: "*", title: "全部场景", count: w.scenes.length },
    ...folders.map((value) => ({
      value,
      title: value || "未分类",
      count: w.scenes.filter((s) => (s.folder || "") === value).length,
    })),
  ];
  return (
    <section className="bounded-panel scene-directory">
      {menu.view}
      <div className="workspace-toolbar">
        <input
          aria-label="搜索场景"
          type="search"
          placeholder="搜索场景名称…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="场景类型筛选"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="">全部</option>
          {Object.entries(modes).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
        <button
          className="primary"
          onClick={() =>
            edit({
              scene: {
                ...newScene(uid()),
                folder: activeFolder === "*" ? "" : activeFolder,
              },
              isNew: true,
            })
          }
        >
          ＋ 新场景
        </button>
      </div>
      <div className="directory-layout">
        <nav className="directory-folders" aria-label="场景分类">
          <span className="directory-label">目录分类</span>
          {categories.map((f) => (
            <button
              key={f.value}
              className={activeFolder === f.value ? "selected" : ""}
              title={f.title}
              aria-pressed={activeFolder === f.value}
              onClick={() => setFolder(f.value)}
            >
              <span>{f.title}</span>
              <small>{f.count}</small>
            </button>
          ))}
        </nav>
        <div className="directory-content">
          <select
            className="directory-mobile-folders"
            aria-label="目录分类"
            value={activeFolder}
            onChange={(e) => setFolder(e.target.value)}
          >
            {categories.map((f) => (
              <option key={f.value} value={f.value}>
                {f.title} · {f.count}
              </option>
            ))}
          </select>
          <div className="directory-list" aria-label="场景条目" tabIndex={0}>
            {entries.map((s) => (
              <article
                className={`scene-entry ${s.id === w.activeScene ? "current" : ""}`}
                key={s.id}
                {...menu.bind(deletion(s))}
              >
                {menu.button(deletion(s))}
                <div className={`scene-entry-thumb mode-${s.mode}`}>
                  {urls[s.background] &&
                  (baseArtById.has(s.background) ||
                    w.assets
                      .find((a) => a.id === s.background)
                      ?.mime.startsWith("image/")) ? (
                    <img src={urls[s.background]} alt="" loading="lazy" />
                  ) : (
                    <span>
                      {s.mode === "map"
                        ? "◇"
                        : s.mode === "battle"
                          ? "⚔"
                          : "✦"}
                    </span>
                  )}
                </div>
                <div className="entry-name">
                  <strong title={s.name}>{s.name}</strong>
                  <small>
                    {modes[s.mode]} · {s.cast.length} 人 / {s.tokens.length}{" "}
                    Token / {s.cues.length} 台词
                    {s.id === w.activeScene && <b> · 正在使用</b>}
                  </small>
                </div>
                <button
                  aria-label={`编辑 ${s.name}`}
                  onClick={() => edit({ scene: s, isNew: false })}
                >
                  编辑
                </button>
                <button
                  className={s.id === w.activeScene ? "quiet" : "primary"}
                  aria-label={`打开 ${s.name}`}
                  onClick={async () => {
                    if (await act({ type: "scene.open", id: s.id })) opened();
                  }}
                >
                  打开
                </button>
              </article>
            ))}
            {!entries.length && (
              <p className="workspace-empty">没有匹配的场景。</p>
            )}
          </div>
        </div>
      </div>
      <footer className="workspace-footer">
        <button onClick={notes}>✎ GM 世界手记</button>
        <span className="footer-hint">
          {entries.length} 个场景 · 编辑时设置分类
        </span>
        <button
          title="导出人物、场景与记录；完整备份仍需保存服务器 data 目录。"
          onClick={() =>
            void api<unknown>("export")
              .then((data) =>
                download(
                  "FU-" + w.id + "-世界备份.json",
                  JSON.stringify(data, null, 2),
                ),
              )
              .catch((e) => error(e.message))
          }
        >
          导出记录
        </button>
      </footer>
    </section>
  );
}
