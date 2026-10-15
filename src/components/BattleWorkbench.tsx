import { UiIcon } from "./TableChrome";
import { useEffect, useState } from "react";
import type { Character, Command } from "../shared/types";
import {
  characterInventory,
  characterLoadout,
  derived,
  learnedAbilities,
} from "../shared/rules";
import { ActionContent, type BattleActionKind } from "./BattleAction";
import { CharacterVitals } from "./CharacterVitals";
import { InventoryPanel } from "./InventoryPanel";
import { RuleText } from "./AbilityReader";
import { ErrorText, Portrait } from "./Common";

export function BattleWorkbench(props: {
  character: Character;
  portrait?: string;
  kind: BattleActionKind;
  gm: boolean;
  act: (c: Command) => Promise<boolean>;
  error: string;
  close: () => void;
}) {
  const c = props.character;
  const [view, setView] = useState<
    "quick" | "overview" | "abilities" | "gear" | "roll" | "resources"
  >(props.kind === "abilities" ? "quick" : props.kind);
  const all = learnedAbilities(c),
    common = (c.abilities.length ? c.abilities : all).slice(0, 4);
  const [abilityId, setAbilityId] = useState(common[0]?.id ?? ""),
    [itemId, setItemId] = useState("");
  const [draft, setDraft] = useState<Character | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const selected = all.find((a) => a.id === abilityId) ?? common[0];
  const inventory = characterInventory(c),
    loadout = characterLoadout(c);
  const item = inventory.find((i) => i.id === itemId) ?? inventory[0];
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]"))
        props.close();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [props.close]);
  async function send(command: Command, message: string) {
    setBusy(true);
    try {
      if (await props.act(command)) setNotice(message);
    } finally {
      setBusy(false);
    }
  }
  const full = ["overview", "abilities", "gear"].includes(view);
  return (
    <section
      className={`battle-workbench ${full ? "full-sheet" : "quick-sheet"}`}
      aria-label={`${c.name}的操作面板`}
    >
      <header className="workbench-header">
        <div className="workbench-person">
          <Portrait name={c.name} src={props.portrait} color={c.color} />
          <div>
            <strong>{c.name}</strong>
            <small>
              Lv {derived(c).level} ·{" "}
              {c.kind === "npc" ? "非玩家角色" : "玩家角色"}
            </small>
          </div>
        </div>
        <CharacterVitals character={c} />
        <button aria-label="收起操作面板" onClick={props.close}>
          ×
        </button>
      </header>
      {full && (
        <nav className="workbench-tabs" aria-label="角色卡页签">
          <button onClick={() => setView("quick")}>‹ 行动</button>
          {(
            [
              ["overview", "人物概览"],
              ["abilities", "能力与法术"],
              ["gear", "装备与背包"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={view === id}
              disabled={!!draft}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      <div className="workbench-body">
        {view === "quick" && (
          <div className="quick-action-layout">
            <section>
              <div className="section-label">
                本回合行动 <small>手动声明</small>
              </div>
              <div className="basic-action-grid">
                <button
                  disabled={busy}
                  onClick={() =>
                    void send(
                      { type: "battle.basic", actor: c.id, action: "攻击" },
                      "已声明攻击；请另行掷骰",
                    )
                  }
                >
                  <UiIcon path="M4 20 20 4v5L9 20z M4 14l6 6 M3 21l3-3" />
                  攻击
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void send(
                      { type: "battle.basic", actor: c.id, action: "防御" },
                      "已声明防御",
                    )
                  }
                >
                  <UiIcon path="m12 3 8 4v6c0 4-4 7-8 9-4-2-8-5-8-9V7z" />
                  防御
                </button>
                <button onClick={() => setView("gear")}>
                  <UiIcon path="M5 8h14l2 13H3z M8 8V5a4 4 0 0 1 8 0v3 M8 13h8" />
                  装备
                </button>
                <button
                  onClick={() => {
                    setItemId(
                      inventory.find((i) => i.kind === "item")?.id ?? "",
                    );
                    setView("gear");
                  }}
                >
                  <UiIcon path="M9 3h6 M10 3v5l-5 7a5 5 0 0 0 4 7h6a5 5 0 0 0 4-7l-5-7V3 M6 15h12" />
                  物品
                </button>
              </div>
              <button className="quiet" onClick={() => setView("overview")}>
                打开完整角色卡 ↗
              </button>
            </section>
            <section>
              <div className="section-label">
                常用能力与法术 <small>点选后声明</small>
              </div>
              <div className="quick-ability-list">
                {common.map((a) => (
                  <button
                    key={a.id}
                    aria-pressed={a.id === selected?.id}
                    onClick={() => setAbilityId(a.id)}
                  >
                    <b>{a.name}</b>
                    <small>{a.cost.includes("GM") ? "依说明" : a.cost}</small>
                  </button>
                ))}
                {!common.length && <p>尚未记录能力或法术。</p>}
              </div>
            </section>
            <section className="quick-ability-preview">
              {selected ? (
                <>
                  <h3>{selected.name}</h3>
                  <p>
                    {selected.cost} · {selected.target || "依说明"} ·{" "}
                    {selected.duration || "依说明"}
                  </p>
                  <small>效果由 GM 裁定，不自动扣除资源。</small>
                  <div className="quick-preview-actions">
                    <button onClick={() => setView("abilities")}>
                      阅读条目
                    </button>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void send(
                          {
                            type: "declare",
                            actor: c.id,
                            ability: selected.id,
                          },
                          `已声明「${selected.name}」`,
                        )
                      }
                    >
                      声明使用
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={() => setView("abilities")}>
                  查看能力目录
                </button>
              )}
            </section>
          </div>
        )}
        {view === "overview" && (
          <div className="workbench-overview">
            <section>
              <h3>{c.identity || "人物概览"}</h3>
              <p>
                主题：{c.theme} · 起源：{c.origin || "未填写"}
              </p>
              <RuleText text={c.description || "尚未填写人物描述。"} />
            </section>
            <section>
              <h3>属性与防御</h3>
              <p>
                DEX d{c.attrs.dex} · INS d{c.attrs.ins} · MIG d{c.attrs.mig} ·
                WLP d{c.attrs.wlp}
              </p>
              <p>
                物防 {derived(c).def} · 魔防 {derived(c).mdef} · 先攻{" "}
                {derived(c).initiative}
              </p>
              <p>状态：{c.statuses.join("、") || "无"}</p>
              <button onClick={() => setView("resources")}>调整资源</button>
              <button onClick={() => setView("roll")}>掷骰</button>
            </section>
          </div>
        )}
        {(view === "abilities" || view === "roll" || view === "resources") && (
          <ActionContent
            {...props}
            kind={view === "abilities" ? "abilities" : view}
            initialAbility={abilityId}
          />
        )}
        {view === "gear" &&
          (draft ? (
            <div className="workbench-gear-edit">
              <InventoryPanel character={draft} change={setDraft} />
              <footer>
                <button disabled={busy} onClick={() => setDraft(null)}>
                  取消编辑
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      if (
                        await props.act({
                          type: "character.save",
                          value: draft,
                          expected: draft.revision,
                        })
                      ) {
                        setDraft(null);
                        setNotice("装备与背包已保存");
                      }
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  保存装备与背包
                </button>
              </footer>
            </div>
          ) : (
            <div className="workbench-equipment">
              <aside>
                <div className="section-label">
                  当前装备 <small>4 槽位</small>
                </div>
                <div className="workbench-slot-grid">
                  {Object.entries({
                    main: "主手",
                    off: "副手",
                    armor: "防具",
                    accessory: "饰品",
                  }).map(([key, label]) => {
                    const equipped = inventory.find(
                      (i) => i.id === loadout[key as keyof typeof loadout],
                    );
                    return (
                      <button
                        key={key}
                        onClick={() => equipped && setItemId(equipped.id)}
                      >
                        <small>
                          {label}
                          {equipped?.hands === 2 ? " · 关联占用" : ""}
                        </small>
                        <span>
                          {key === "main" || key === "off" ? "⚔" : "◇"}
                        </span>
                        <b>{equipped?.name || "空置"}</b>
                      </button>
                    );
                  })}
                </div>
                <p>双手装备关联占用主副手；双持和双盾按各槽位显示。</p>
              </aside>
              <nav className="workbench-backpack" aria-label="行动背包">
                <div className="section-label">
                  背包与持有物 <small>{inventory.length} 项</small>
                </div>
                <div>
                  {inventory.map((i) => (
                    <button
                      key={i.id}
                      aria-pressed={i.id === item?.id}
                      onClick={() => setItemId(i.id)}
                    >
                      <b>{i.name}</b>
                      <small>
                        {Object.values(loadout).includes(i.id)
                          ? "已装备"
                          : "背包"}{" "}
                        · ×{i.quantity}
                      </small>
                    </button>
                  ))}
                </div>
              </nav>
              <article className="workbench-item">
                {item ? (
                  <>
                    <header>
                      <h2>{item.name}</h2>
                      <small>
                        {item.hands === 2
                          ? "双手"
                          : item.hands === 1
                            ? "单手"
                            : ""}{" "}
                        · {item.template ? "基础装备" : "自定义"}
                      </small>
                    </header>
                    <dl className="ability-facts">
                      <div>
                        <dt>
                          {item.kind === "weapon" ? "命中" : "物防 / 魔防"}
                        </dt>
                        <dd>
                          {item.kind === "weapon"
                            ? item.check
                            : `${item.fixed ?? item.def} / ${item.mdef}`}
                        </dd>
                      </div>
                      <div>
                        <dt>{item.kind === "weapon" ? "伤害" : "数量"}</dt>
                        <dd>
                          {item.kind === "weapon"
                            ? `HR + ${item.damage} · ${item.damageType}`
                            : item.quantity}
                        </dd>
                      </div>
                      <div>
                        <dt>价值</dt>
                        <dd>{item.cost} Z</dd>
                      </div>
                    </dl>
                    <div className="workbench-item-text">
                      <RuleText text={item.description || "无额外规则。"} />
                      {c.gearNotes && (
                        <>
                          <h4>背包备注</h4>
                          <RuleText text={c.gearNotes} />
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p>背包中尚无物品。</p>
                )}
                <footer>
                  {item?.kind === "item" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send(
                          {
                            type: "battle.basic",
                            actor: c.id,
                            action: "物品",
                            item: item.name,
                          },
                          `已声明使用「${item.name}」；数量由玩家手动调整`,
                        )
                      }
                    >
                      声明使用
                    </button>
                  )}
                  <button onClick={() => setDraft(structuredClone(c))}>
                    编辑装备与背包
                  </button>
                </footer>
              </article>
            </div>
          ))}
      </div>
      {(notice || props.error) && (
        <footer className="workbench-notice">
          <span role="status">{notice}</span>
          <ErrorText text={props.error} />
        </footer>
      )}
    </section>
  );
}
