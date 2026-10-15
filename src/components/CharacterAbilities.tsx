import { useState } from "react";
import type { Character } from "../shared/types";
import { learnedAbilities } from "../shared/rules";
import spells from "../shared/spells.json";
import { AbilityReader } from "./AbilityReader";
export function CharacterAbilities({
  character: c,
  change,
}: {
  character: Character;
  change: (c: Character) => void;
}) {
  const [library, setLibrary] = useState(false),
    [query, setQuery] = useState("");
  const entries = (
    library
      ? spells.filter(
          (s) => c.custom || c.classes.some((x) => x.id === s.classId),
        )
      : learnedAbilities(c)
  ).filter((a) => [a.name, a.text, a.source].join().includes(query));
  return (
    <section className="character-ability-workspace">
      <div className="workspace-toolbar">
        <button
          className={!library ? "selected" : ""}
          onClick={() => setLibrary(false)}
        >
          已学条目
        </button>
        <button
          className={library ? "selected" : ""}
          onClick={() => setLibrary(true)}
        >
          核心法术与奥灵
        </button>
        <input
          type="search"
          aria-label="搜索法术与能力"
          placeholder="搜索名称、效果…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <AbilityReader
        abilities={entries}
        canUse={(a) =>
          library
            ? !c.abilities.some((x) => x.id === a.id)
            : c.abilities.some((x) => x.id === a.id)
        }
        label={library ? "记录为已学" : "移除自定义／已学法术"}
        onUse={(a) => {
          if (library) {
            if (!c.abilities.some((x) => x.id === a.id))
              change({ ...c, abilities: [...c.abilities, a] });
            setLibrary(false);
          } else if (c.abilities.some((x) => x.id === a.id))
            change({
              ...c,
              abilities: c.abilities.filter((x) => x.id !== a.id),
            });
        }}
      />
      <p className="muted">
        法术使用本地核心书 20230207
        版；不同版本可在自定义中修改。学习数量与使用条件由 GM
        确认；扩展法术在扩展资源中选择。
      </p>
    </section>
  );
}
