import { useState, useEffect } from "react";
import type { Character, Command, Resource } from "../shared/types";
import { derived, learnedAbilities } from "../shared/rules";
import { DiceControls } from "./DiceControls";
import { CharacterVitals } from "./CharacterVitals";
import { Field, ErrorText } from "./Common";
export type BattleActionKind = "abilities" | "roll" | "resources";
export function ActionContent({
  character: c,
  kind,
  gm,
  act,
  error,
}: {
  character: Character;
  kind: BattleActionKind;
  gm: boolean;
  act: (c: Command) => Promise<boolean>;
  error: string;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("全部"),
    [resource, setResource] = useState<Resource>(gm ? "hp" : "mp"),
    [delta, setDelta] = useState(-1),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState("");
  async function run(command: Command, message: string) {
    setBusy(true);
    setResult("");
    try {
      const ok = await act(command);
      if (ok) setResult(message);
    } finally {
      setBusy(false);
    }
  }
  const allAbilities = learnedAbilities(c);
  const categories = [...new Set(allAbilities.map((a) => a.source ?? "装备"))];
  const abilities = allAbilities
    .filter((a) => category === "全部" || (a.source ?? "装备") === category)
    .filter((a) => a.name.includes(query) || a.text.includes(query));
  return (
    <div className="battle-action-content">
      {kind === "abilities" && (
        <>
          <div className="ability-toolbar">
            <input
              type="search"
              aria-label="搜索角色能力"
              placeholder="搜索能力…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="能力来源"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option>全部</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <p className="muted">声明发到战斗日志；掷骰、伤害和消耗分别处理。</p>
          <div className="battle-ability-list">
            {abilities.map((a) => (
              <details key={a.id}>
                <summary>
                  {a.name}
                  <small>{a.cost.includes("由 GM") ? "按说明" : a.cost}</small>
                </summary>
                <p className="preserve">{a.text}</p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      { type: "declare", actor: c.id, ability: a.id },
                      `已声明「${a.name}」`,
                    )
                  }
                >
                  声明使用
                </button>
              </details>
            ))}
            {!abilities.length && (
              <p>没有匹配的能力，可在人物卡中添加自定义能力。</p>
            )}
          </div>
        </>
      )}
      {kind === "roll" && <DiceControls character={c} act={act} />}
      {kind === "resources" && (
        <>
          <p>
            HP {c.hp}/{derived(c).hp} · MP {c.mp}/{derived(c).mp} · IP {c.ip}
          </p>
          <div className="form-grid">
            <Field label="资源">
              <select
                value={resource}
                onChange={(e) => setResource(e.target.value as Resource)}
              >
                {(["hp", "mp", "ip", "fabula", "zenit"] as const)
                  .filter((v) => gm || v !== "hp")
                  .map((v) => (
                    <option value={v} key={v}>
                      {
                        {
                          hp: "HP",
                          mp: "MP",
                          ip: "IP",
                          fabula: "物语点",
                          zenit: "泽尼特",
                        }[v]
                      }
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="增减数量">
              <input
                type="number"
                value={delta}
                onChange={(e) => setDelta(+e.target.value)}
              />
            </Field>
          </div>
          <Field label="调整原因">
            <input
              placeholder="伤害、治疗或能力消耗…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={100}
            />
          </Field>
          <p className="muted">扣除用负数；HP 由 GM 手动调整。</p>
          <button
            className="primary"
            disabled={busy || delta === 0}
            onClick={() =>
              void run(
                { type: "resource", id: c.id, resource, delta, reason },
                "资源已调整，记录已发到战斗日志",
              )
            }
          >
            确认调整
          </button>
        </>
      )}
      {result && (
        <p className="notice" role="status">
          {result}
        </p>
      )}
      <ErrorText text={error} />
    </div>
  );
}

export function BattleAction(
  props: Parameters<typeof ActionContent>[0] & { close: () => void },
) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]"))
        props.close();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [props.close]);
  return (
    <section
      className="battle-action-drawer"
      aria-label={`${props.character.name}的行动抽屉`}
    >
      <header>
        <div>
          <small>角色行动</small>
          <strong>
            {props.character.name} ·{" "}
            {{ abilities: "能力", roll: "掷骰", resources: "资源" }[props.kind]}
          </strong>
        </div>
        <button aria-label="收起行动抽屉" onClick={props.close}>
          ⌄ 收起
        </button>
      </header>
      <CharacterVitals character={props.character} />
      <ActionContent {...props} />
    </section>
  );
}
