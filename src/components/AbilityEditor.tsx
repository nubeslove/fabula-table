import { useState } from "react";
import type { Ability } from "../shared/types";
import { uid } from "../lib/api";
import { Field } from "./Common";
export function AbilityEditor({
  entries,
  change,
}: {
  entries: Ability[];
  change: (a: Ability[]) => void;
}) {
  const [id, setId] = useState("");
  const a = entries.find((a) => a.id === id) ?? entries[0];
  const edit = (v: Partial<Ability>) =>
    change(entries.map((x) => (x.id === a.id ? { ...x, ...v } : x)));
  return (
    <>
      <button
        onClick={() => {
          const value = {
            id: uid(),
            name: "新能力",
            cost: "",
            text: "",
            target: "",
            duration: "",
          };
          change([...entries, value]);
          setId(value.id);
        }}
      >
        ＋ 能力／法术／奥灵
      </button>
      <div className="entry-workspace custom-ability-editor">
        <nav className="entry-index">
          {entries.map((x) => (
            <button
              key={x.id}
              aria-pressed={x.id === a?.id}
              onClick={() => setId(x.id)}
            >
              <b>{x.name}</b>
              <small>{x.cost || "未注明消耗"}</small>
            </button>
          ))}
        </nav>
        <article className="entry-detail">
          {a && (
            <>
              <div className="form-grid">
                <Field label="名称">
                  <input
                    value={a.name}
                    onChange={(e) => edit({ name: e.target.value })}
                  />
                </Field>
                <Field label="消耗">
                  <input
                    value={a.cost}
                    onChange={(e) => edit({ cost: e.target.value })}
                  />
                </Field>
                <Field label="目标">
                  <input
                    value={a.target ?? ""}
                    onChange={(e) => edit({ target: e.target.value })}
                  />
                </Field>
                <Field label="持续时间">
                  <input
                    value={a.duration ?? ""}
                    onChange={(e) => edit({ duration: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="效果">
                <textarea
                  rows={6}
                  value={a.text}
                  onChange={(e) => edit({ text: e.target.value })}
                />
              </Field>
              <Field label="规则来源／版本">
                <input
                  value={a.source ?? ""}
                  onChange={(e) => edit({ source: e.target.value })}
                />
              </Field>
              <button
                onClick={() => change(entries.filter((x) => x.id !== a.id))}
              >
                移除此条目
              </button>
            </>
          )}
        </article>
      </div>
    </>
  );
}
