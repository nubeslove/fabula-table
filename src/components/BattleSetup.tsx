import { useState } from "react";
import type { Command, World } from "../shared/types";
import { Portrait } from "./Common";

export function BattleSetup({
  world,
  urls,
  act,
  started,
}: {
  world: World;
  urls: Record<string, string>;
  act: (command: Command) => Promise<boolean>;
  started?: () => void;
}) {
  const scene = world.scenes.find((s) => s.id === world.activeScene);
  const onScene = new Set([
    ...(scene?.cast.map((c) => c.actor) ?? []),
    ...(scene?.tokens.filter((t) => !t.hidden).map((t) => t.actor) ?? []),
  ]);
  const characters = world.characters.filter((c) => c.public);
  const [chosen, setChosen] = useState(() =>
    characters
      .filter((c) => c.kind === "pc" || onScene.has(c.id))
      .map((c) => c.id),
  );
  const [first, setFirst] = useState<"heroes" | "foes">("heroes");
  const [busy, setBusy] = useState(false);
  const roster = characters.filter((c) => chosen.includes(c.id));
  const ready =
    roster.some((c) => c.side === "heroes") &&
    roster.some((c) => c.side === "foes");

  return (
    <section className="tool-card">
      <h3>选择本次参战角色</h3>
      <p className="muted">
        勾选参加这次冲突的人物。旁观者可以留在舞台上；阵营可在人物卡中修改。
      </p>
      <div className="row wrap">
        <button
          onClick={() =>
            setChosen(
              characters.filter((c) => onScene.has(c.id)).map((c) => c.id),
            )
          }
        >
          仅选本幕人物
        </button>
        <button onClick={() => setChosen(characters.map((c) => c.id))}>
          全选
        </button>
        <button onClick={() => setChosen([])}>清空</button>
        <span className="muted">已选 {roster.length} 人</span>
      </div>
      <div className="battle-sides battle-roster">
        {(["heroes", "foes"] as const).map((side) => (
          <fieldset key={side}>
            <legend>{side === "heroes" ? "我方" : "对方"}</legend>
            {characters
              .filter((c) => c.side === side)
              .map((c) => (
                <label className="roster-choice" key={c.id}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(c.id)}
                    onChange={(e) =>
                      setChosen(
                        e.target.checked
                          ? [...chosen, c.id]
                          : chosen.filter((id) => id !== c.id),
                      )
                    }
                  />
                  <Portrait
                    name={c.name}
                    src={urls[c.portrait]}
                    color={c.color}
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            {!characters.some((c) => c.side === side) && (
              <p className="muted">
                还没有公开的{side === "heroes" ? "我方" : "对方"}角色。
              </p>
            )}
          </fieldset>
        ))}
      </div>
      {!ready && <p className="muted">双方各选至少一位角色，即可开始。</p>}
      <div className="row wrap">
        <select
          aria-label="先行动的一方"
          value={first}
          onChange={(e) => setFirst(e.target.value as typeof first)}
        >
          <option value="heroes">我方先行动</option>
          <option value="foes">对方先行动</option>
        </select>
        <button
          className="primary"
          disabled={!ready || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const ok = await act({
                type: "battle.start",
                first,
                roster: roster.map((c) => c.id),
              });
              if (ok) started?.();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在开始…" : `开始冲突（${roster.length} 人）`}
        </button>
      </div>
    </section>
  );
}
