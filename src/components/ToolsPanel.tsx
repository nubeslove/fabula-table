import { ActionContent, type BattleActionKind } from "./BattleAction";
import { CharacterVitals } from "./CharacterVitals";
import { useState } from "react";
import type { Session, Command, Character } from "../shared/types";
import { Empty, Portrait } from "./Common";
import { BattleSetup } from "./BattleSetup";
type Props = {
  session: Session;
  act: (c: Command) => Promise<boolean>;
  urls: Record<string, string>;
  edit: (c: Character) => void;
  initialTab?: string;
  battleStarted?: () => void;
};
export function ToolsPanel({
  session: { world: w, me },
  act,
  urls,
  edit,
  initialTab = "角色行动",
  battleStarted,
}: Props) {
  const gm = me.role === "gm",
    [actorId, setActor] = useState(""),
    available = w.characters.filter((c) => gm || c.owner === me.id),
    c = available.find((c) => c.id === actorId) ?? available[0],
    [tab, setTab] = useState(initialTab),
    [action, setAction] = useState<BattleActionKind>("abilities");
  const b = w.battle;
  return (
    <section
      className={`tools-workspace ${tab === "角色行动" ? "actions" : "combat"}`}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">AT THE TABLE</span>
          <h2>跑团工具</h2>
        </div>
        <span className="tag">手动裁定</span>
      </div>
      <div className="tabs">
        {["角色行动", "冲突回合"].map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "角色行动" && (
        <>
          {c ? (
            <>
              <div className="actor-focus">
                <Portrait
                  name={c.name}
                  src={urls[c.portrait]}
                  color={c.color}
                />
                <select
                  aria-label="操作角色"
                  value={c.id}
                  onChange={(e) => setActor(e.target.value)}
                >
                  {available.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button onClick={() => edit(c)}>编辑人物卡</button>
              </div>
              <CharacterVitals character={c} />
              <div className="tabs">
                {(
                  [
                    ["abilities", "能力"],
                    ["roll", "掷骰"],
                    ["resources", "资源调整"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    className={action === id ? "selected" : ""}
                    onClick={() => setAction(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ActionContent
                key={c.id + action}
                character={c}
                kind={action}
                gm={gm}
                act={act}
                error=""
              />
            </>
          ) : (
            <Empty>先创建一位角色，就可以掷骰、声明能力和管理物语点。</Empty>
          )}
        </>
      )}
      {tab === "冲突回合" && (
        <>
          <p className="muted">
            双方交替选择尚未行动的角色。人数较多的一方会完成剩余行动，再进入下一轮。点击能力、掷骰和扣血均不会自动推进回合。
          </p>
          {!b.active ? (
            <>
              <Empty>当前没有冲突。</Empty>
              {gm && (
                <BattleSetup
                  world={w}
                  urls={urls}
                  act={act}
                  started={battleStarted}
                />
              )}
            </>
          ) : (
            <>
              <div className="battle-banner">
                <strong>第 {b.round} 轮</strong>
                <span>{b.side === "heroes" ? "我方" : "对方"}行动</span>
                <b>
                  {w.characters.find((c) => c.id === b.current)?.name ||
                    "等待选择行动者"}
                </b>
              </div>
              <div className="battle-sides">
                {(["heroes", "foes"] as const).map((side) => (
                  <section key={side}>
                    <h3>{side === "heroes" ? "我方" : "对方"}</h3>
                    {w.characters
                      .filter((c) => b.roster.includes(c.id) && c.side === side)
                      .map((c) => (
                        <button
                          className={
                            "battle-actor " +
                            (b.current === c.id ? "selected" : "")
                          }
                          key={c.id}
                          disabled={
                            !gm || side !== b.side || b.acted.includes(c.id)
                          }
                          onClick={() =>
                            void act({ type: "battle.select", actor: c.id })
                          }
                        >
                          <Portrait
                            name={c.name}
                            src={urls[c.portrait]}
                            color={c.color}
                          />
                          <strong>{c.name}</strong>
                          <span>
                            {b.acted.includes(c.id)
                              ? "已行动"
                              : b.current === c.id
                                ? "行动中"
                                : "待行动"}
                          </span>
                        </button>
                      ))}
                  </section>
                ))}
              </div>
              {gm && (
                <div className="row">
                  <button
                    className="primary"
                    disabled={!b.current}
                    onClick={() => void act({ type: "battle.endTurn" })}
                  >
                    结束当前行动 →
                  </button>
                  <button onClick={() => void act({ type: "battle.stop" })}>
                    结束冲突
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
