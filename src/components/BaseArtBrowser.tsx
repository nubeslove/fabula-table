import { useState } from "react";
import { BASE_ART, type BaseArt } from "../shared/base-library";
import { apiUrl } from "../lib/api";
import { Modal } from "./Common";
export const artUrl = (path: string) => apiUrl("../" + path);
export function BaseArtBrowser({
  kind,
  choose,
}: {
  kind?: string;
  choose?: (a: BaseArt) => void;
}) {
  const [preview, setPreview] = useState<BaseArt | null>(null);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(kind ?? ""),
    [pack, setPack] = useState(""),
    [group, setGroup] = useState(""),
    [page, setPage] = useState(0);
  const all = BASE_ART.filter(
    (a) =>
      (!category || a.category === category) &&
      (!pack || a.pack === pack) &&
      (!group || a.group === group) &&
      [a.name, a.variant, a.pack, a.group].join(" ").includes(query),
  );
  const pages = Math.max(1, Math.ceil(all.length / 24)),
    current = Math.min(page, pages - 1);
  return (
    <section className="base-library bounded-panel" aria-label="基础资源库">
      <div className="workspace-toolbar">
        <input
          type="search"
          aria-label="搜索基础资源"
          placeholder="搜索怪物、场景或换色…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="基础资源类别"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setGroup("");
            setPage(0);
          }}
        >
          <option value="">全部类别</option>
          <option>怪物</option>
          <option>场景</option>
        </select>
        <select
          aria-label="素材包"
          value={pack}
          onChange={(e) => {
            setPack(e.target.value);
            setPage(0);
          }}
        >
          <option value="">全部素材包</option>
          {[...new Set(BASE_ART.map((a) => a.pack))].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          aria-label="素材分类"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setPage(0);
          }}
        >
          <option value="">全部分类</option>
          {[
            ...new Set(
              BASE_ART.filter((a) => !category || a.category === category).map(
                (a) => a.group,
              ),
            ),
          ].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </div>
      <div className="base-art-grid">
        {all.slice(current * 24, current * 24 + 24).map((a) => (
          <button
            className="base-art-item"
            key={a.id}
            onClick={() => (choose ? choose(a) : setPreview(a))}
            title={`${a.name} · ${a.variant}\n${a.author} · ${a.pack}`}
          >
            <img src={artUrl(a.thumbnail)} alt={a.name} loading="lazy" />
            <strong>{a.name}</strong>
            <small>{a.variant}</small>
            <small>{a.author}</small>
            {choose && <span>选择使用</span>}
          </button>
        ))}
        {!all.length && <p>没有匹配的资源。</p>}
      </div>
      {preview && (
        <Modal
          title={preview.name + " · " + preview.variant}
          onClose={() => setPreview(null)}
          wide
        >
          <img
            src={artUrl(preview.path)}
            alt={preview.name}
            style={{
              width: "100%",
              height: "min(55dvh,480px)",
              objectFit: "contain",
            }}
          />
          <p>
            {preview.pack} · {preview.author}
          </p>
          <p className="muted">
            已转换为 WebP，原图版权归作者；用于本应用的场景与角色显示。
          </p>
        </Modal>
      )}
      <footer className="workspace-footer">
        <span>{all.length} 项 · 已压缩 WebP · 素材版权归各作者</span>
        <button disabled={!current} onClick={() => setPage(current - 1)}>
          上一页
        </button>
        <span>
          {current + 1}/{pages}
        </span>
        <button
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          下一页
        </button>
      </footer>
    </section>
  );
}
