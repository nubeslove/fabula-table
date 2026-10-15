import { useState } from "react";
import type { Ability } from "../shared/types";
export function RuleText({ text }: { text: string }) {
  return (
    <div className="rule-prose">
      {text
        .replace(/([^。！？；：:\n])\n(?=[^\n])/g, "$1")
        .split(/\n+/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>
            {p
              .split(
                /(【[^】]+】|[^。；\n]{1,8}[：:]|\b(?:HP|MP|IP|DEX|INS|MIG|WLP|HR)\b)/,
              )
              .map((part, j) =>
                /^(【|[^。；]{1,8}[：:]$|HP$|MP$|IP$|DEX$|INS$|MIG$|WLP$|HR$)/.test(
                  part,
                ) ? (
                  <strong key={j}>{part}</strong>
                ) : (
                  part
                ),
              )}
          </p>
        ))}
    </div>
  );
}
export function AbilityReader({
  abilities,
  onUse,
  label = "声明使用",
  disabled = false,
  canUse = () => true,
}: {
  abilities: Ability[];
  onUse?: (a: Ability) => void;
  label?: string;
  disabled?: boolean;
  canUse?: (a: Ability) => boolean;
}) {
  const [selected, setSelected] = useState("");
  const a = abilities.find((a) => a.id === selected) ?? abilities[0];
  return (
    <div className="entry-workspace ability-reader">
      <nav className="entry-index" aria-label="能力条目">
        {abilities.map((a) => (
          <button
            key={a.id}
            aria-pressed={
              a.id ===
              (abilities.find((a) => a.id === selected) ?? abilities[0])?.id
            }
            onClick={() => setSelected(a.id)}
          >
            <b>{a.name}</b>
            <small>{a.cost.includes("由 GM") ? "按说明" : a.cost}</small>
          </button>
        ))}
        {!a && <p>没有匹配的条目。</p>}
      </nav>
      <article className="entry-detail">
        {a && (
          <>
            <header>
              <small>{a.source || "自定义"}</small>
              <h2>{a.name}</h2>
            </header>
            <dl className="ability-facts">
              <div>
                <dt>消耗</dt>
                <dd>{a.cost}</dd>
              </div>
              <div>
                <dt>目标</dt>
                <dd>{a.target || "依条目说明"}</dd>
              </div>
              <div>
                <dt>持续时间</dt>
                <dd>{a.duration || "依条目说明"}</dd>
              </div>
            </dl>
            <RuleText text={a.text} />
            {onUse && canUse(a) && (
              <button
                className="primary"
                disabled={disabled}
                onClick={() => onUse(a)}
              >
                {label}
              </button>
            )}
          </>
        )}
      </article>
    </div>
  );
}
