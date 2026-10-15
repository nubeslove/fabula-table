import { useState } from "react";
import type { ClassDefinition } from "../shared/rules";
import type { ClassChoice } from "../shared/types";
import { RuleText } from "./AbilityReader";
export function ClassSkills({
  definition,
  choice,
  change,
}: {
  definition: ClassDefinition;
  choice: ClassChoice;
  change: (c: ClassChoice) => void;
}) {
  const [id, setId] = useState("");
  const skill =
    definition.skills.find((s) => s.id === id) ?? definition.skills[0];
  return (
    <div className="entry-workspace class-skill-reader">
      <nav className="entry-index">
        {definition.skills.map((s) => (
          <button
            key={s.id}
            aria-pressed={skill.id === s.id}
            onClick={() => setId(s.id)}
          >
            <b>{s.name}</b>
            <small>
              SL {choice.skills[s.id] ?? 0} / {s.max}
            </small>
          </button>
        ))}
      </nav>
      <article className="entry-detail">
        <h3>{skill.name}</h3>
        <label>
          技能等级 SL{" "}
          <input
            className="small-input"
            aria-label={skill.name + "等级"}
            type="number"
            min={0}
            max={skill.max}
            value={choice.skills[skill.id] ?? 0}
            onChange={(e) =>
              change({
                ...choice,
                skills: { ...choice.skills, [skill.id]: +e.target.value },
              })
            }
          />
        </label>
        <RuleText text={skill.description} />
        <small>
          {definition.source ?? "核心书"} · {skill.page} 页
        </small>
      </article>
    </div>
  );
}
