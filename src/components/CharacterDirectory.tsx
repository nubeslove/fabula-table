import { useState } from "react";
import type { Character, Command, Session } from "../shared/types";
import { derived } from "../shared/rules";
import { Portrait } from "./Common";

const categories = { pc: "玩家角色", npc: "非玩家角色" } as const;

export function CharacterDirectory({
  session: { world, me },
  urls,
  act,
  create,
  edit,
}: {
  session: Session;
  urls: Record<string, string>;
  act: (command: Command) => Promise<boolean>;
  create: (npc?: boolean) => void;
  edit: (value: { character: Character; isNew: boolean }) => void;
}) {
  const [kind, setKind] = useState<Character["kind"]>("pc");
  const [query, setQuery] = useState("");
  const gm = me.role === "gm";
  const cast = world.scenes.find((s) => s.id === world.activeScene)?.cast ?? [];
  const group = world.characters.filter((c) => c.kind === kind);
  const search = query.trim().toLocaleLowerCase();
  const entries = group.filter((c) =>
    [
      c.name,
      c.identity,
      c.theme,
      world.members.find((m) => m.id === c.owner)?.name ?? "",
    ].some((text) => text.toLocaleLowerCase().includes(search)),
  );

  return (
    <section className="bounded-panel character-directory">
      <nav className="workspace-tabs" aria-label="人物分类">
        {Object.entries(categories).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={kind === value}
            className={kind === value ? "selected" : ""}
            onClick={() => setKind(value as Character["kind"])}
          >
            {label}
            <small>
              {world.characters.filter((c) => c.kind === value).length}
            </small>
          </button>
        ))}
      </nav>
      <div className="workspace-toolbar">
        <input
          type="search"
          aria-label="搜索人物"
          placeholder={`搜索${categories[kind]}、身份或持有人…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {(gm || kind === "pc") && (
          <button className="primary" onClick={() => create(kind === "npc")}>
            ＋ {kind === "pc" ? "玩家角色" : "非玩家角色"}
          </button>
        )}
      </div>
      <div
        className="directory-list"
        aria-label={`${categories[kind]}条目`}
        tabIndex={0}
      >
        {entries.map((c) => {
          const onStage = cast.some((x) => x.actor === c.id);
          const stats = gm || c.kind === "pc" ? derived(c) : null;
          const owner = world.members.find((m) => m.id === c.owner);
          return (
            <article
              className={`character-entry ${onStage ? "on-stage" : ""}`}
              key={c.id}
            >
              <Portrait name={c.name} src={urls[c.portrait]} color={c.color} />
              <div className="entry-name">
                <strong title={c.name}>{c.name}</strong>
                <small
                  className="character-identity"
                  title={c.identity || c.theme}
                >
                  {c.identity || c.theme || "尚未填写身份"}
                </small>
                <div className="character-entry-meta">
                  <span>
                    {owner
                      ? `持有人：${owner.id === me.id ? "你" : owner.name}`
                      : "GM 控制"}
                  </span>
                  {!c.public && <b>私密</b>}
                  {onStage && <b>在场</b>}
                </div>
                {stats && (
                  <div className="character-entry-stats">
                    <span>
                      HP {c.hp}/{stats.hp}
                    </span>
                    <span>
                      MP {c.mp}/{stats.mp}
                    </span>
                    {c.kind === "pc" && <span>物语点 {c.fabula}</span>}
                  </div>
                )}
              </div>
              <div className="character-entry-actions">
                {(gm || c.owner === me.id) && (
                  <button
                    aria-label={`编辑人物卡：${c.name}`}
                    onClick={() => edit({ character: c, isNew: false })}
                  >
                    编辑
                  </button>
                )}
                {gm && c.public && (
                  <button
                    aria-label={`${onStage ? "退场" : "登场"}：${c.name}`}
                    onClick={() =>
                      void act({
                        type: "stage.cast",
                        actor: c.id,
                        present: !onStage,
                      })
                    }
                  >
                    {onStage ? "退场" : "登场"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!entries.length && (
          <p className="workspace-empty">
            {search
              ? "没有找到符合条件的人物。"
              : `还没有${categories[kind]}。`}
          </p>
        )}
      </div>
      <footer className="workspace-footer">
        <span>
          {entries.length} / {group.length} 位{categories[kind]}
        </span>
        {gm && <span className="footer-hint">可在人物卡中修改类型</span>}
      </footer>
    </section>
  );
}
