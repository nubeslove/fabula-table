import { AbilityReader } from "./AbilityReader";
import { useState, useEffect } from "react";

import { expansionName } from "../shared/expansions";
import type { Ability } from "../shared/types";
export function ExpansionResources({
  enabled,
  chosen,
  add,
}: {
  enabled: string[];
  chosen: Ability[];
  add: (a: Ability) => void;
}) {
  const [data, setData] = useState<
      (Ability & { expansion: string; category: string })[]
    >([]),
    [loadError, setLoadError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      const manifest = await fetch(
        new URL("official/manifest.json", document.baseURI),
        { signal: abort.signal },
      ).then((r) => {
        if (!r.ok) throw new Error("规则清单读取失败");
        return r.json();
      });
      if (!manifest.characterResources)
        throw new Error("请安装本版本的官方规则文本包");
      const response = await fetch(
        new URL(manifest.characterResources.file, document.baseURI),
        { signal: abort.signal },
      );
      if (!response.ok) throw new Error("扩展资料读取失败");
      setData(await response.json());
    })().catch((e) => {
      if (e.name !== "AbortError") setLoadError(e.message);
    });
    return () => abort.abort();
  }, []);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("全部"),
    [page, setPage] = useState(0);
  const available = data.filter((r) => enabled.includes(r.expansion)),
    categories = [...new Set(available.map((r) => r.category))];
  const found = available.filter(
    (r) =>
      (category === "全部" || r.category === category) &&
      (r.name.includes(query) ||
        r.source?.includes(query) ||
        r.text.includes(query)),
  );
  const pages = Math.max(1, Math.ceil(found.length / 12)),
    current = Math.min(page, pages - 1);
  return (
    <section className="expansion-resources">
      {loadError && (
        <p role="alert" className="error">
          {loadError}
        </p>
      )}
      <div className="row">
        <input
          type="search"
          aria-label="搜索扩展资源"
          placeholder="搜索技能、金手指或职业资料…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="扩展资源分类"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(0);
          }}
        >
          <option>全部</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <p className="muted">
        来源于世界已启用的扩展。前置条件与效果由 GM
        确认；加入后保存在人物卡中，可继续修改。
      </p>
      <AbilityReader abilities={found.slice(current*12,current*12+12)} label="加入人物卡" onUse={a=>{if(!chosen.some(x=>x.id===a.id))add(a)}}/>
      {!found.length && (
        <p className="empty">没有可用条目。GM 可在世界设置中启用扩展。</p>
      )}
      <div className="row">
        <button disabled={!current} onClick={() => setPage(current - 1)}>
          上一组
        </button>
        <small>
          {current + 1} / {pages} · {found.length} 项
        </small>
        <button
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          下一组
        </button>
      </div>
    </section>
  );
}
