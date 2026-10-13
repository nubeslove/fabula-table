import { ExpansionResources } from "./ExpansionResources";
import { expansionName } from "../shared/expansions";
import { CharacterVitals } from "./CharacterVitals";
import { useState } from "react";
import type { Character, Session } from "../shared/types";
import {
  ATTRS,
  ATTR_NAMES,
  CLASSES,
  availableClasses,
  EQUIPMENT,
  STATUS,
  characterProblems,
  derived,
} from "../shared/rules";
import { Field, Modal } from "./Common";
import { uid } from "../lib/api";
export function CharacterEditor({
  initial,
  isNew,
  session,
  onSave,
  onClose,
  error = "",
}: {
  initial: Character;
  isNew: boolean;
  session: Session;
  onSave: (c: Character) => Promise<boolean>;
  onClose: () => void;
  error?: string;
}) {
  const [c, set] = useState(() => structuredClone(initial)),
    [tab, setTab] = useState("人物"),
    [classId, setClassId] = useState(initial.classes[0]?.id ?? ""),
    [saving, setSaving] = useState(false),
    gm = session.me.role === "gm",
    d = derived(c),
    problems = characterProblems(c, isNew);
  const edit = <K extends keyof Character>(key: K, value: Character[K]) =>
    set((old) => ({ ...old, [key]: value }));
  async function save() {
    setSaving(true);
    try {
      const next = structuredClone(c);
      if (isNew) {
        const stats = derived(next);
        next.hp = stats.hp;
        next.mp = stats.mp;
        next.ip = stats.ip;
        next.zenit = Math.max(0, 500 - stats.cost);
      }
      if (await onSave(next)) onClose();
    } finally {
      setSaving(false);
    }
  }
  const assetSelect = (value: string, change: (v: string) => void) => (
    <select value={value} onChange={(e) => change(e.target.value)}>
      <option value="">不用图片</option>
      {session.world.assets
        .filter((a) => a.mime.startsWith("image/"))
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
    </select>
  );
  return (
    <Modal
      title={(isNew ? "创建" : "编辑") + " · " + c.name}
      onClose={onClose}
      error={error}
      wide
      className="character-sheet"
    >
      <div className="character-sheet-masthead">
        <div className="sheet-identity">
          <b style={{ background: c.color }}>{c.name.slice(0, 1)}</b>
          <div>
            <small>
              {c.kind === "npc" ? "非玩家角色" : "玩家角色"} · Lv {d.level}
            </small>
            <strong>{c.name}</strong>
            <span>{c.identity || "为角色写下一句话的身份"}</span>
          </div>
        </div>
        <CharacterVitals character={c} creation={isNew} />
      </div>
      <div className="sheet-defenses">
        <span>
          物防 <b>{d.def}</b>
        </span>
        <span>
          魔防 <b>{d.mdef}</b>
        </span>
        <span>
          先攻 <b>{d.initiative}</b>
        </span>
        <span>
          危机 <b>{d.crisis}</b>
        </span>
        <span>
          泽尼特 <b>{c.zenit}</b>
        </span>
      </div>
      <div className="tabs sheet-tabs">
        {[
          "人物",
          "属性",
          "职业",
          "装备",
          "羁绊与状态",
          "扩展资源",
          "自定义",
          "立绘",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="sheet-page" key={tab}>
        {tab === "人物" && (
          <>
            <div className="form-grid">
              <Field label="姓名">
                <input
                  value={c.name}
                  onChange={(e) => edit("name", e.target.value)}
                  maxLength={80}
                />
              </Field>
              <Field label="主题">
                <input
                  value={c.theme}
                  onChange={(e) => edit("theme", e.target.value)}
                  placeholder="希望、复仇、归属……"
                />
              </Field>
              <Field label="身份">
                <input
                  value={c.identity}
                  onChange={(e) => edit("identity", e.target.value)}
                  placeholder="一句话描述自己"
                />
              </Field>
              <Field label="起源">
                <input
                  value={c.origin}
                  onChange={(e) => edit("origin", e.target.value)}
                  placeholder="你来自哪里？"
                />
              </Field>
            </div>
            <Field label="人物描述">
              <textarea
                value={c.description}
                onChange={(e) => edit("description", e.target.value)}
              />
            </Field>
            {gm && (
              <div className="form-grid">
                <Field label="人物类型">
                  <select
                    value={c.kind}
                    onChange={(e) =>
                      edit("kind", e.target.value as Character["kind"])
                    }
                  >
                    <option value="pc">玩家角色</option>
                    <option value="npc">非玩家角色</option>
                  </select>
                </Field>
                <Field label="持有人">
                  <select
                    value={c.owner}
                    onChange={(e) => edit("owner", e.target.value)}
                  >
                    <option value="">GM 控制</option>
                    {session.world.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="冲突阵营">
                  <select
                    value={c.side}
                    onChange={(e) =>
                      edit("side", e.target.value as Character["side"])
                    }
                  >
                    <option value="heroes">我方</option>
                    <option value="foes">对方</option>
                  </select>
                </Field>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={c.public}
                    onChange={(e) => edit("public", e.target.checked)}
                  />
                  向玩家公开人物
                </label>
              </div>
            )}
          </>
        )}
        {tab === "羁绊与状态" && (
          <>
            <h3>羁绊</h3>
            {c.bonds.map((b, i) => (
              <div className="row" key={i}>
                <input
                  aria-label="羁绊对象"
                  placeholder="对象"
                  value={b.name}
                  onChange={(e) =>
                    edit(
                      "bonds",
                      c.bonds.map((x, j) =>
                        i === j ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  aria-label="羁绊情感"
                  placeholder="情感，用顿号分开"
                  value={b.feelings.join("、")}
                  onChange={(e) =>
                    edit(
                      "bonds",
                      c.bonds.map((x, j) =>
                        i === j
                          ? { ...x, feelings: e.target.value.split("、") }
                          : x,
                      ),
                    )
                  }
                />
                <button
                  onClick={() =>
                    edit(
                      "bonds",
                      c.bonds.filter((_, j) => j !== i),
                    )
                  }
                >
                  移除
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                edit("bonds", [...c.bonds, { name: "", feelings: [] }])
              }
            >
              ＋ 羁绊
            </button>
            <h3>当前状态</h3>
            <div className="row wrap">
              {STATUS.map((status) => (
                <label className="check" key={status}>
                  <input
                    type="checkbox"
                    checked={c.statuses.includes(status)}
                    onChange={(e) =>
                      edit(
                        "statuses",
                        e.target.checked
                          ? [...c.statuses, status]
                          : c.statuses.filter((s) => s !== status),
                      )
                    }
                  />
                  {status}
                </label>
              ))}
            </div>
            {gm && (
              <Field label="GM 私密备注">
                <textarea
                  value={c.privateNotes}
                  onChange={(e) => edit("privateNotes", e.target.value)}
                />
              </Field>
            )}
          </>
        )}
        {tab === "属性" && (
          <>
            <div className="row">
              <span className="muted">起始配置</span>
              {[
                [8, 8, 8, 8],
                [10, 8, 8, 6],
                [10, 10, 6, 6],
              ].map((a) => (
                <button
                  key={a.join()}
                  onClick={() =>
                    edit("attrs", {
                      dex: a[0],
                      ins: a[1],
                      mig: a[2],
                      wlp: a[3],
                    })
                  }
                >
                  {a.join(" / ")}
                </button>
              ))}
            </div>
            <div className="attribute-grid">
              {ATTRS.map((key) => (
                <Field
                  key={key}
                  label={ATTR_NAMES[key] + " " + key.toUpperCase()}
                >
                  {c.custom ? (
                    <input
                      type="number"
                      min={2}
                      max={30}
                      value={c.attrs[key]}
                      onChange={(e) =>
                        edit("attrs", { ...c.attrs, [key]: +e.target.value })
                      }
                    />
                  ) : (
                    <select
                      value={c.attrs[key]}
                      onChange={(e) =>
                        edit("attrs", { ...c.attrs, [key]: +e.target.value })
                      }
                    >
                      {[6, 8, 10, 12].map((n) => (
                        <option key={n} value={n}>
                          d{n}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ))}
            </div>
          </>
        )}
        {tab === "职业" && (
          <>
            <div className="tabs class-tabs">
              {c.classes.map((x) => (
                <button
                  key={x.id}
                  className={
                    classId === x.id ||
                    (!c.classes.some((k) => k.id === classId) &&
                      x === c.classes[0])
                      ? "selected"
                      : ""
                  }
                  onClick={() => setClassId(x.id)}
                >
                  {CLASSES.find((k) => k.id === x.id)?.name ??
                    x.name ??
                    "私设职业"}{" "}
                  <b>{x.level}</b>
                </button>
              ))}
            </div>
            <p className="muted">
              将起始的 5 个等级分给 2～3
              个职业，再为每个职业选择同等数量的技能等级。上方数值会随选择计算。
            </p>
            {c.classes.map((choice, index) => {
              if (
                choice.id !==
                (c.classes.some((x) => x.id === classId)
                  ? classId
                  : c.classes[0]?.id)
              )
                return null;
              const definition = CLASSES.find((x) => x.id === choice.id),
                change = (value: typeof choice) =>
                  edit(
                    "classes",
                    c.classes.map((x, i) => (i === index ? value : x)),
                  );
              return (
                <section className="class-block" key={choice.id}>
                  <div className="row">
                    <strong>
                      {definition?.name || choice.name || "自定义职业"}
                    </strong>
                    <label>
                      等级{" "}
                      <input
                        className="small-input"
                        type="number"
                        min={1}
                        max={c.custom ? 50 : 10}
                        value={choice.level}
                        onChange={(e) =>
                          change({ ...choice, level: +e.target.value })
                        }
                      />
                    </label>
                    <span className="muted">
                      已分配{" "}
                      {Object.values(choice.skills).reduce((n, x) => n + x, 0)}{" "}
                      / {choice.level}
                    </span>
                    <button
                      className="quiet"
                      onClick={() =>
                        edit(
                          "classes",
                          c.classes.filter((_, i) => i !== index),
                        )
                      }
                    >
                      移除职业
                    </button>
                  </div>
                  {definition?.gains && (
                    <p className="notice">免费增益：{definition.gains}</p>
                  )}
                  {!!definition?.boostOptions?.length && (
                    <Field label="免费增益选择">
                      <select
                        value={choice.boost ?? definition.boost}
                        onChange={(e) =>
                          change({
                            ...choice,
                            boost: e.target.value as "hp" | "mp",
                          })
                        }
                      >
                        {definition.boostOptions.map((v) => (
                          <option key={v} value={v}>
                            {v.toUpperCase()} 上限 +5
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {definition?.skills.map((skill) => (
                    <details className="skill-choice" key={skill.id}>
                      <summary>
                        <span>{skill.name}</span>
                        <label onClick={(e) => e.stopPropagation()}>
                          SL{" "}
                          <input
                            aria-label={skill.name + "等级"}
                            type="number"
                            min={0}
                            max={skill.max}
                            value={choice.skills[skill.id] ?? 0}
                            onChange={(e) =>
                              change({
                                ...choice,
                                skills: {
                                  ...choice.skills,
                                  [skill.id]: +e.target.value,
                                },
                              })
                            }
                          />
                          <small> / {skill.max}</small>
                        </label>
                      </summary>
                      <p className="preserve">{skill.description}</p>
                      <small>
                        {definition?.expansion
                          ? expansionName(definition.expansion)
                          : `核心书 ${skill.page} 页`}
                      </small>
                    </details>
                  ))}
                  {!definition && (
                    <input
                      aria-label="自定义职业名称"
                      placeholder="自定义职业名称"
                      value={choice.name ?? ""}
                      onChange={(e) =>
                        change({ ...choice, name: e.target.value })
                      }
                    />
                  )}
                </section>
              );
            })}
            <div className="row">
              <select
                aria-label="添加职业"
                value=""
                onChange={(e) =>
                  edit("classes", [
                    ...c.classes,
                    { id: e.target.value, level: 1, skills: {} },
                  ])
                }
              >
                <option value="">＋ 选择职业</option>
                {availableClasses(session.world.expansions)
                  .filter((cls) => !c.classes.some((x) => x.id === cls.id))
                  .map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} · {expansionName(cls.expansion)}
                    </option>
                  ))}
              </select>
              {c.custom && (
                <button
                  onClick={() =>
                    edit("classes", [
                      ...c.classes,
                      {
                        id: "custom-" + uid(),
                        name: "自定义职业",
                        level: 1,
                        skills: {},
                      },
                    ])
                  }
                >
                  ＋ 私设职业
                </button>
              )}
            </div>
          </>
        )}
        {tab === "装备" && (
          <>
            <p>
              起始装备预算 <strong>500 z</strong> · 已选{" "}
              <strong>{d.cost} z</strong> · 剩余 {500 - d.cost} z
            </p>
            <p className="muted">
              创建后另行掷 2d6 ×
              10，并把结果加入泽尼特。升级后的装备与金钱由团内确认。
            </p>
            {(["weapon", "armor", "shield"] as const).map((kind) => (
              <section key={kind}>
                <h3>
                  {{ weapon: "武器", armor: "防具", shield: "盾牌" }[kind]}
                </h3>
                <div className="equipment-grid">
                  {EQUIPMENT.filter((e) => e.kind === kind).map((e) => (
                    <label
                      className={
                        "equipment " +
                        (c.equipment.includes(e.id) ? "chosen" : "")
                      }
                      key={e.id}
                    >
                      <input
                        type="checkbox"
                        checked={c.equipment.includes(e.id)}
                        onChange={(ev) =>
                          edit(
                            "equipment",
                            ev.target.checked
                              ? [...c.equipment, e.id]
                              : c.equipment.filter((id) => id !== e.id),
                          )
                        }
                      />
                      <span>
                        <strong>{e.name}</strong>
                        <small>
                          {e.cost} z{e.hands ? " · " + e.hands + " 手" : ""}
                          {e.training ? " · 职业装备" : ""}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
            <Field label="其他装备与道具">
              <textarea
                value={c.gearNotes}
                onChange={(e) => edit("gearNotes", e.target.value)}
              />
            </Field>
          </>
        )}
        {tab === "扩展资源" && (
          <ExpansionResources
            enabled={session.world.expansions ?? []}
            chosen={c.abilities}
            add={(a) => edit("abilities", [...c.abilities, a])}
          />
        )}
        {tab === "自定义" && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={c.custom}
                onChange={(e) => edit("custom", e.target.checked)}
              />
              <strong>允许私设配置</strong>
            </label>
            <p className="muted">
              开启后允许非标准属性、职业组合和装备。修正是在自动数值上加减；覆盖直接指定最终数值，留空则继续自动计算。
            </p>
            <div className="override-grid">
              <strong>项目</strong>
              <strong>修正</strong>
              <strong>最终覆盖</strong>
              {(
                ["hp", "mp", "ip", "def", "mdef", "initiative"] as const
              ).flatMap((key) => [
                <label key={key + "l"}>
                  {
                    {
                      hp: "HP 上限",
                      mp: "MP 上限",
                      ip: "IP 上限",
                      def: "物防",
                      mdef: "魔防",
                      initiative: "先攻",
                    }[key]
                  }
                </label>,
                <input
                  key={key + "m"}
                  aria-label={key + "修正"}
                  type="number"
                  value={c.modifiers[key]}
                  onChange={(e) =>
                    edit("modifiers", {
                      ...c.modifiers,
                      [key]: +e.target.value,
                    })
                  }
                />,
                <input
                  key={key + "o"}
                  aria-label={key + "覆盖"}
                  type="number"
                  placeholder="自动"
                  value={c.overrides[key] ?? ""}
                  onChange={(e) => {
                    const next = { ...c.overrides };
                    if (e.target.value === "") delete next[key];
                    else next[key] = +e.target.value;
                    edit("overrides", next);
                  }}
                />,
              ])}
            </div>
            <h3>自定义能力／法术／阿尔卡纳</h3>
            {c.abilities.map((a, i) => {
              const change = (value: typeof a) =>
                edit(
                  "abilities",
                  c.abilities.map((x, j) => (i === j ? value : x)),
                );
              return (
                <div className="class-block" key={a.id}>
                  <div className="row">
                    <input
                      aria-label="能力名称"
                      value={a.name}
                      onChange={(e) => change({ ...a, name: e.target.value })}
                    />
                    <input
                      aria-label="能力消耗"
                      placeholder="消耗，例如 10 MP"
                      value={a.cost}
                      onChange={(e) => change({ ...a, cost: e.target.value })}
                    />
                    <button
                      onClick={() =>
                        edit(
                          "abilities",
                          c.abilities.filter((_, j) => j !== i),
                        )
                      }
                    >
                      移除
                    </button>
                  </div>
                  <textarea
                    aria-label="能力说明"
                    value={a.text}
                    onChange={(e) => change({ ...a, text: e.target.value })}
                  />
                </div>
              );
            })}
            <button
              onClick={() =>
                edit("abilities", [
                  ...c.abilities,
                  { id: uid(), name: "新的能力", cost: "由 GM 确认", text: "" },
                ])
              }
            >
              ＋ 添加能力
            </button>
          </>
        )}
        {tab === "立绘" && (
          <>
            <p className="muted">
              请先由 GM
              在“素材与分享”上传人物图。舞台支持透明立绘，未上传时使用人物名标记。
            </p>
            <Field label="默认立绘／Token 图片">
              {assetSelect(c.portrait, (value) => edit("portrait", value))}
            </Field>
            <Field label="代表色">
              <input
                type="color"
                value={c.color}
                onChange={(e) => edit("color", e.target.value)}
              />
            </Field>
            <h3>表情差分</h3>
            {c.expressions.map((e, i) => (
              <div className="row" key={e.id}>
                <input
                  aria-label="表情名称"
                  placeholder="微笑、惊讶……"
                  value={e.name}
                  onChange={(ev) =>
                    edit(
                      "expressions",
                      c.expressions.map((x, j) =>
                        i === j ? { ...x, name: ev.target.value } : x,
                      ),
                    )
                  }
                />
                {assetSelect(e.asset, (value) =>
                  edit(
                    "expressions",
                    c.expressions.map((x, j) =>
                      i === j ? { ...x, asset: value } : x,
                    ),
                  ),
                )}
                <button
                  onClick={() =>
                    edit(
                      "expressions",
                      c.expressions.filter((_, j) => i !== j),
                    )
                  }
                >
                  移除
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                edit("expressions", [
                  ...c.expressions,
                  { id: uid(), name: "新的表情", asset: "" },
                ])
              }
            >
              ＋ 表情
            </button>
          </>
        )}
      </div>
      {problems.length > 0 && (
        <details className="sheet-problems">
          <summary>还有 {problems.length} 项需要填写或调整</summary>
          {problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </details>
      )}
      <footer className="modal-footer">
        <small>保存不会自动回复已有角色的 HP / MP / IP。</small>
        <button
          className="primary"
          disabled={saving || problems.length > 0}
          onClick={() => void save()}
        >
          {saving ? "正在保存…" : "保存角色"}
        </button>
      </footer>
    </Modal>
  );
}
