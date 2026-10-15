import { RuleText } from "./AbilityReader";
import { useState } from "react";
import type { Character, EquipmentSlot, InventoryItem } from "../shared/types";
import {
  EQUIPMENT,
  characterInventory,
  characterLoadout,
  inventoryItem,
} from "../shared/rules";
import { uid } from "../lib/api";
import { Field } from "./Common";
const slots = {
  main: "主手",
  off: "副手",
  armor: "防具",
  accessory: "饰品",
} as const;
export function InventoryPanel({
  character: c,
  change,
}: {
  character: Character;
  change: (c: Character) => void;
}) {
  const [editing, setEditing] = useState(false),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState("");
  const inventory = characterInventory(c),
    loadout = characterLoadout(c);
  const selectedItem = inventory.find((e) => e.id === selected) ?? inventory[0];
  const update = (items: InventoryItem[], equipment = loadout) =>
    change({ ...c, inventory: items, loadout: equipment });
  function equip(slot: EquipmentSlot, id: string) {
    const next = { ...loadout };
    const old = inventory.find((e) => e.id === next[slot]);
    const item = inventory.find((e) => e.id === id);
    if ((slot === "main" || slot === "off") && old?.hands === 2) {
      delete next.main;
      delete next.off;
    }
    if (id) next[slot] = id;
    else delete next[slot];
    if ((slot === "main" || slot === "off") && item?.hands === 2) {
      next.main = id;
      next.off = id;
    } else if ((slot === "main" || slot === "off") && item) {
      const other = slot === "main" ? "off" : "main";
      const otherItem = inventory.find((e) => e.id === next[other]);
      if (otherItem?.hands === 2 || (next[other] === id && item.quantity < 2))
        delete next[other];
    }
    update(inventory, next);
  }
  function patch(values: Partial<InventoryItem>) {
    if (!selectedItem) return;
    const items = inventory.map((e) =>
      e.id === selectedItem.id ? { ...e, ...values } : e,
    );
    const next = { ...loadout };
    if (values.kind !== undefined || values.hands !== undefined)
      for (const slot of Object.keys(next) as EquipmentSlot[])
        if (next[slot] === selectedItem.id) delete next[slot];
    update(items, next);
  }
  return (
    <section className="inventory-workspace">
      <div className="equipment-slots">
        {Object.entries(slots).map(([key, label]) => (
          <Field key={key} label={label}>
            <select
              aria-label={label + "装备"}
              value={loadout[key as EquipmentSlot] ?? ""}
              onChange={(e) => equip(key as EquipmentSlot, e.target.value)}
            >
              <option value="">空置</option>
              {inventory
                .filter((i) =>
                  key === "main" || key === "off"
                    ? i.kind === "weapon" || i.kind === "shield"
                    : i.kind === key,
                )
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.hands === 2 ? " · 双手" : ""}
                  </option>
                ))}
            </select>
          </Field>
        ))}
      </div>
      <small className="equipment-hint">
        双手装备占用两格；双持盾牌可分别放入主副手，需具备“双重盾牌”或获 GM
        允许。双持攻击分开声明、掷骰。
      </small>
      <div className="workspace-toolbar">
        <input
          aria-label="搜索背包"
          placeholder="搜索背包…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="添加基础装备"
          value=""
          onChange={(e) => {
            const item = inventoryItem(e.target.value, uid());
            update([...inventory, item]);
            setSelected(item.id);
          }}
        >
          <option value="">＋ 基础装备</option>
          {EQUIPMENT.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {e.cost} Z
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            const item = inventoryItem("", uid());
            update([...inventory, item]);
            setSelected(item.id);
          }}
        >
          ＋ 自定义
        </button>
      </div>
      <div className="entry-workspace">
        <nav className="entry-index" aria-label="背包条目">
          {inventory
            .filter((i) => i.name.includes(query))
            .map((i) => (
              <button
                key={i.id}
                aria-pressed={i.id === selectedItem?.id}
                onClick={() => setSelected(i.id)}
              >
                <b>{i.name}</b>
                <small>
                  {Object.values(loadout).includes(i.id)
                    ? "◆ 正在装备"
                    : "背包"}{" "}
                  · ×{i.quantity} · {i.cost} Z
                </small>
              </button>
            ))}
        </nav>
        <article className="entry-detail">
          {selectedItem ? (
            <>
              <div className="inventory-detail-heading">
                <h3>{selectedItem.name}</h3>
                <button onClick={() => setEditing(!editing)}>
                  {editing ? "查看条目" : "编辑物品"}
                </button>
              </div>
              <div hidden={editing}>
                <dl className="ability-facts">
                  <div>
                    <dt>价值</dt>
                    <dd>{selectedItem.cost} Z</dd>
                  </div>
                  <div>
                    <dt>数量</dt>
                    <dd>{selectedItem.quantity}</dd>
                  </div>
                  <div>
                    <dt>占用</dt>
                    <dd>
                      {selectedItem.hands ? selectedItem.hands + " 手" : "—"}
                    </dd>
                  </div>
                </dl>
                {selectedItem.kind === "weapon" && (
                  <>
                    <p>
                      <b>命中检定</b>　{selectedItem.check || "尚未填写"}
                    </p>
                    <p>
                      <b>伤害</b>　HR + {selectedItem.damage} ·{" "}
                      {selectedItem.damageType}
                    </p>
                  </>
                )}
                <p>
                  <b>防御修正</b>　物防{" "}
                  {selectedItem.fixed !== undefined
                    ? "固定 " + selectedItem.fixed
                    : "+" + selectedItem.def}{" "}
                  · 魔防 +{selectedItem.mdef} · 先攻 {selectedItem.initiative}
                </p>
                <RuleText text={selectedItem.description || "没有额外效果。"} />
                <details>
                  <summary>背包备注</summary>
                  <Field label="背包备注">
                    <textarea
                      value={c.gearNotes}
                      onChange={(e) =>
                        change({ ...c, gearNotes: e.target.value })
                      }
                    />
                  </Field>
                </details>
              </div>
              <div hidden={!editing}>
                <div className="form-grid">
                  <Field label="名称">
                    <input
                      value={selectedItem.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </Field>
                  <Field label="类型">
                    <select
                      value={selectedItem.kind}
                      onChange={(e) =>
                        patch({ kind: e.target.value as InventoryItem["kind"] })
                      }
                    >
                      {Object.entries({
                        weapon: "武器",
                        shield: "盾牌",
                        armor: "防具",
                        accessory: "饰品",
                        item: "道具",
                      }).map(([id, label]) => (
                        <option value={id} key={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="数量">
                    <input
                      type="number"
                      min={1}
                      value={selectedItem.quantity}
                      onChange={(e) => patch({ quantity: +e.target.value })}
                    />
                  </Field>
                  <Field label="价值 / 泽尼特">
                    <input
                      type="number"
                      min={0}
                      value={selectedItem.cost}
                      onChange={(e) => patch({ cost: +e.target.value })}
                    />
                  </Field>
                </div>
                {(selectedItem.kind === "weapon" ||
                  selectedItem.kind === "shield") && (
                  <div className="form-grid">
                    <Field label="占用手数">
                      <select
                        value={selectedItem.hands}
                        onChange={(e) => patch({ hands: +e.target.value })}
                      >
                        <option value={1}>单手</option>
                        <option value={2}>双手</option>
                      </select>
                    </Field>
                    <Field label="命中检定">
                      <input
                        value={selectedItem.check}
                        placeholder="DEX + INS + 2"
                        onChange={(e) => patch({ check: e.target.value })}
                      />
                    </Field>
                    <Field label="伤害：HR +">
                      <input
                        type="number"
                        value={selectedItem.damage}
                        onChange={(e) => patch({ damage: +e.target.value })}
                      />
                    </Field>
                    <Field label="伤害类型">
                      <input
                        value={selectedItem.damageType}
                        onChange={(e) => patch({ damageType: e.target.value })}
                      />
                    </Field>
                  </div>
                )}
                <div className="form-grid">
                  {(["def", "mdef", "initiative"] as const).map((key) => (
                    <Field
                      key={key}
                      label={
                        {
                          def: "物防加值",
                          mdef: "魔防加值",
                          initiative: "先攻修正",
                        }[key]
                      }
                    >
                      <input
                        type="number"
                        value={selectedItem[key]}
                        onChange={(e) => patch({ [key]: +e.target.value })}
                      />
                    </Field>
                  ))}
                  <Field label="防具固定物防（可留空）">
                    <input
                      type="number"
                      value={selectedItem.fixed ?? ""}
                      onChange={(e) =>
                        patch({
                          fixed:
                            e.target.value === "" ? undefined : +e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="效果／自定义武器规则">
                  <textarea
                    value={selectedItem.description}
                    placeholder="类别、射程类型、特性与限制；仅作记录，不自动结算。"
                    onChange={(e) => patch({ description: e.target.value })}
                  />
                </Field>
                <p className="muted">
                  自定义武器：基础 300 Z、双手、3 自定义点；命中 DEX + INS 或
                  DEX + MIG，基础 HR + 5 物理。将特性与最终数值填在这里，由 GM
                  确认。规则来源：自定义武器扩展。
                </p>
                <button
                  onClick={() => {
                    const next = { ...loadout };
                    for (const k of Object.keys(next) as EquipmentSlot[])
                      if (next[k] === selectedItem.id) delete next[k];
                    update(
                      inventory.filter((e) => e.id !== selectedItem.id),
                      next,
                    );
                  }}
                >
                  移除这件物品
                </button>
              </div>
            </>
          ) : (
            <p>背包暂无物品。</p>
          )}
        </article>
      </div>
    </section>
  );
}
