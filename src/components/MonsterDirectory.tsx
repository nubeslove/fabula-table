import { useState } from "react";
import { MONSTERS, monsterCharacter } from "../shared/bestiary";
import { baseArtById } from "../shared/base-library";
import { artUrl } from "./BaseArtBrowser";
import { uid } from "../lib/api";
import type { Command } from "../shared/types";
export function MonsterDirectory({
  act,
}: {
  act: (c: Command) => Promise<boolean>;
}) {
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState(""),
    [selected, setSelected] = useState(MONSTERS[0].id),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const entries = MONSTERS.filter(
    (m) =>
      (!kind || m.species === kind) &&
      [m.name, m.species].join().includes(query),
  );
  const m = entries.find((m) => m.id === selected) ?? entries[0];
  const c = m ? monsterCharacter(m, "preview") : null;
  const img = c ? baseArtById.get(c.portrait) : null;
  return (
    <section className="bounded-panel monster-directory">
      <div className="workspace-toolbar">
        <input
          type="search"
          aria-label="搜索预制怪物"
          placeholder="搜索怪物名称…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="怪物种类"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">全部种类</option>
          {[...new Set(MONSTERS.map((m) => m.species))].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="entry-workspace">
        <nav className="entry-index">
          {entries.map((x) => (
            <button
              key={x.id}
              aria-pressed={x.id === m?.id}
              onClick={() => setSelected(x.id)}
            >
              <b>{x.name}</b>
              <small>
                Lv {x.level} · {x.species}
              </small>
            </button>
          ))}
        </nav>
        <article className="entry-detail">
          {m && c ? (
            <>
              <div className="monster-preview">
                {img && <img src={artUrl(img.path)} alt={m.name} />}
                <div>
                  <h2>{m.name}</h2>
                  <p>
                    Lv {m.level} · {m.species}
                  </p>
                  <p>
                    HP <b>{m.hp}</b> · MP <b>{m.mp}</b>
                  </p>
                  <p>
                    物防 {m.def} · 魔防 {m.mdef} · 先攻 {m.init}
                  </p>
                  <small>{c.origin}</small>
                </div>
              </div>
              <p>{m.description}</p>
              <p>
                <b>伤害亲和度：</b>
                {m.affinities}
              </p>
              {m.abilities.map((a, i) => (
                <section key={i}>
                  <h3>{a.name}</h3>
                  <small>
                    {a.cost} · {a.target} · {a.duration}
                  </small>
                  <p>{a.text}</p>
                </section>
              ))}
              <small>
                立绘：{img?.author}。外形匹配素材，非官方怪物插图；Token
                与立绘共用透明原图。
              </small>
            </>
          ) : (
            <p>没有匹配的怪物。</p>
          )}
        </article>
      </div>
      <footer className="workspace-footer">
        <span role="status">
          {message || "导入为私密 NPC，修改并公开后即可参战。"}
        </span>
        <button
          className="primary"
          disabled={busy || !m}
          onClick={async () => {
            setBusy(true);
            try {
              if (
                await act({
                  type: "character.save",
                  value: monsterCharacter(m, uid()),
                  expected: null,
                })
              )
                setMessage(`已加入「${m.name}」，可到非玩家角色中编辑`);
            } finally {
              setBusy(false);
            }
          }}
        >
          加入世界
        </button>
      </footer>
    </section>
  );
}
