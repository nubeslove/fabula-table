import data from "./core-catalog.json";
import type {
  Ability,
  Attribute,
  Character,
  Scene,
  World,
  InventoryItem,
  EquipmentSlot,
} from "./types";
import expansions from "./expansion-catalog.json";
export interface ClassDefinition {
  id: string;
  name: string;
  boost: string;
  training: string[];
  page: number;
  skills: {
    id: string;
    name: string;
    max: number;
    description: string;
    page: number;
  }[];
  references: { title: string; page: number; text: string }[];
  expansion?: string;
  source?: string;
  gains?: string;
  boostOptions?: string[];
}
export const CLASSES: ClassDefinition[] = [...data, ...expansions];
export const availableClasses = (enabled: string[] = []) =>
  CLASSES.filter((c) => !c.expansion || enabled.includes(c.expansion));
export const ATTRS: Attribute[] = ["dex", "ins", "mig", "wlp"];
export const ATTR_NAMES = {
  dex: "灵巧",
  ins: "洞察",
  mig: "力量",
  wlp: "意志",
};
export const STATUS = ["缓慢", "眩晕", "虚弱", "动摇", "愤怒", "中毒"];
export interface Equipment {
  id: string;
  name: string;
  kind: "weapon" | "armor" | "shield";
  cost: number;
  training?: string;
  hands?: number;
  check?: string;
  damage?: number;
  def?: number;
  fixed?: number;
  mdef?: number;
  initiative?: number;
}
export const EQUIPMENT: Equipment[] = [
  {
    id: "staff",
    name: "法杖",
    kind: "weapon",
    cost: 100,
    hands: 2,
    check: "WLP + WLP",
    damage: 6,
  },
  {
    id: "tome",
    name: "魔典",
    kind: "weapon",
    cost: 100,
    hands: 2,
    check: "INS + INS",
    damage: 6,
  },
  {
    id: "crossbow",
    name: "十字弩",
    kind: "weapon",
    cost: 150,
    hands: 2,
    check: "DEX + INS",
    damage: 8,
  },
  {
    id: "shortbow",
    name: "短弓",
    kind: "weapon",
    cost: 200,
    hands: 2,
    check: "DEX + DEX",
    damage: 8,
  },
  {
    id: "knuckles",
    name: "铁指虎",
    kind: "weapon",
    cost: 150,
    hands: 1,
    check: "DEX + MIG",
    damage: 6,
  },
  {
    id: "dagger",
    name: "钢匕首",
    kind: "weapon",
    cost: 150,
    hands: 1,
    check: "DEX + INS + 1",
    damage: 4,
  },
  {
    id: "pistol",
    name: "手枪",
    kind: "weapon",
    cost: 250,
    hands: 1,
    training: "ranged",
    check: "DEX + INS",
    damage: 8,
  },
  {
    id: "chain",
    name: "链鞭",
    kind: "weapon",
    cost: 150,
    hands: 2,
    check: "DEX + DEX",
    damage: 8,
  },
  {
    id: "hammer",
    name: "铁锤",
    kind: "weapon",
    cost: 200,
    hands: 1,
    check: "MIG + MIG",
    damage: 6,
  },
  {
    id: "axe",
    name: "板斧",
    kind: "weapon",
    cost: 250,
    hands: 1,
    training: "melee",
    check: "MIG + MIG",
    damage: 10,
  },
  {
    id: "greataxe",
    name: "战斧",
    kind: "weapon",
    cost: 250,
    hands: 2,
    training: "melee",
    check: "MIG + MIG",
    damage: 14,
  },
  {
    id: "spear",
    name: "轻矛",
    kind: "weapon",
    cost: 200,
    hands: 1,
    training: "melee",
    check: "DEX + MIG",
    damage: 8,
  },
  {
    id: "heavy-spear",
    name: "重矛",
    kind: "weapon",
    cost: 200,
    hands: 2,
    training: "melee",
    check: "DEX + MIG",
    damage: 12,
  },
  {
    id: "sword",
    name: "青铜剑",
    kind: "weapon",
    cost: 200,
    hands: 1,
    training: "melee",
    check: "DEX + MIG + 1",
    damage: 6,
  },
  {
    id: "greatsword",
    name: "巨剑",
    kind: "weapon",
    cost: 200,
    hands: 2,
    training: "melee",
    check: "DEX + MIG + 1",
    damage: 10,
  },
  {
    id: "katana",
    name: "武士刀",
    kind: "weapon",
    cost: 200,
    hands: 2,
    training: "melee",
    check: "DEX + INS + 1",
    damage: 10,
  },
  {
    id: "rapier",
    name: "刺剑",
    kind: "weapon",
    cost: 200,
    hands: 1,
    training: "melee",
    check: "DEX + INS + 1",
    damage: 6,
  },
  {
    id: "shuriken",
    name: "手里剑",
    kind: "weapon",
    cost: 150,
    hands: 1,
    check: "DEX + INS",
    damage: 4,
  },
  {
    id: "silk",
    name: "丝质衬衫",
    kind: "armor",
    cost: 100,
    def: 0,
    mdef: 2,
    initiative: -1,
  },
  {
    id: "travel",
    name: "旅行装束",
    kind: "armor",
    cost: 100,
    def: 1,
    mdef: 1,
    initiative: -1,
  },
  {
    id: "tunic",
    name: "战斗束腰外衣",
    kind: "armor",
    cost: 150,
    def: 1,
    mdef: 1,
  },
  {
    id: "robe",
    name: "贤者长袍",
    kind: "armor",
    cost: 200,
    def: 1,
    mdef: 2,
    initiative: -2,
  },
  {
    id: "chainmail",
    name: "锁子甲",
    kind: "armor",
    cost: 150,
    training: "armor",
    fixed: 10,
    initiative: -2,
  },
  {
    id: "bronze-plate",
    name: "青铜板甲",
    kind: "armor",
    cost: 200,
    training: "armor",
    fixed: 11,
    initiative: -3,
  },
  {
    id: "rune-plate",
    name: "符文板甲",
    kind: "armor",
    cost: 250,
    training: "armor",
    fixed: 11,
    mdef: 1,
    initiative: -3,
  },
  {
    id: "steel-plate",
    name: "钢铁板甲",
    kind: "armor",
    cost: 300,
    training: "armor",
    fixed: 12,
    initiative: -4,
  },
  {
    id: "bronze-shield",
    name: "青铜盾牌",
    kind: "shield",
    cost: 100,
    hands: 1,
    def: 2,
  },
  {
    id: "rune-shield",
    name: "符文盾牌",
    kind: "shield",
    cost: 150,
    hands: 1,
    training: "shield",
    def: 2,
    mdef: 2,
  },
];
export function inventoryItem(template: string, id: string): InventoryItem {
  const e = EQUIPMENT.find((e) => e.id === template);
  return {
    id,
    template: e?.id,
    name: e?.name ?? "自定义物品",
    kind: e?.kind ?? "item",
    quantity: 1,
    cost: e?.cost ?? 0,
    hands: e?.hands ?? 0,
    check: e?.check ?? "",
    damage: e?.damage ?? 0,
    damageType: "物理",
    description: "",
    def: e?.def ?? 0,
    mdef: e?.mdef ?? 0,
    initiative: e?.initiative ?? 0,
    fixed: e?.fixed,
    training: e?.training,
  };
}
export function characterInventory(c: Character) {
  return (
    c.inventory ??
    c.equipment.map((id, i) => inventoryItem(id, `legacy-${i}-${id}`))
  );
}
export function characterLoadout(
  c: Character,
): Partial<Record<EquipmentSlot, string>> {
  if (c.inventory !== undefined) return c.loadout ?? {};
  const slots: Partial<Record<EquipmentSlot, string>> = {};
  for (const e of characterInventory(c)) {
    if (e.kind === "armor") slots.armor ??= e.id;
    else if (e.kind === "shield") {
      if (!slots.off) slots.off = e.id;
      else slots.main ??= e.id;
    } else if (e.kind === "weapon") {
      if (!slots.main) slots.main = e.id;
      else if (!slots.off) slots.off = e.id;
      if (e.hands === 2) slots.off = e.id;
    }
  }
  return slots;
}
export function equippedItems(c: Character) {
  if (c.inventory === undefined) return characterInventory(c);
  const ids = new Set(Object.values(c.loadout ?? {}));
  return characterInventory(c).flatMap((e) =>
    !ids.has(e.id)
      ? []
      : c.loadout?.main === e.id && c.loadout?.off === e.id && e.hands === 1
        ? [e, e]
        : [e],
  );
}
export function currentAttributes(c: Character) {
  const a = { ...c.attrs };
  const down = (key: Attribute) => (a[key] = Math.max(6, a[key] - 2));
  if (c.statuses.includes("缓慢")) down("dex");
  if (c.statuses.includes("眩晕")) down("ins");
  if (c.statuses.includes("虚弱")) down("mig");
  if (c.statuses.includes("动摇")) down("wlp");
  if (c.statuses.includes("愤怒")) {
    down("dex");
    down("ins");
  }
  if (c.statuses.includes("中毒")) {
    down("mig");
    down("wlp");
  }
  return a;
}
export function derived(c: Character) {
  const level = c.classes.reduce((n, x) => n + x.level, 0) || 5,
    classes = c.classes
      .map((x) => {
        const d = CLASSES.find((k) => k.id === x.id);
        return d
          ? {
              ...d,
              boost:
                x.boost && d.boostOptions?.includes(x.boost)
                  ? x.boost
                  : d.boost,
            }
          : undefined;
      })
      .filter((x) => !!x),
    a = currentAttributes(c),
    gear = equippedItems(c),
    armor = gear.find((e) => e.kind === "armor");
  const rank = (id: string) =>
    c.classes.reduce((n, x) => n + (x.skills[id] ?? 0), 0);
  const bonuses = {
    hp:
      classes.filter((x) => x.boost === "hp").length * 5 +
      rank("guardian-4") * 3,
    mp:
      classes.filter((x) => x.boost === "mp").length * 5 +
      rank("loremaster-2") * 3,
    ip: classes.filter((x) => x.boost === "ip").length * 2,
  };
  const base = {
    hp: level + c.attrs.mig * 5 + bonuses.hp,
    mp: level + c.attrs.wlp * 5 + bonuses.mp,
    ip: 6 + bonuses.ip,
    def:
      (armor?.fixed ?? a.dex) +
      gear.reduce((n, e) => n + (e.def ?? 0), 0) +
      (!gear.some(
        (e) => e.kind === "shield" || (e.kind === "armor" && e.training),
      )
        ? rank("rogue-2")
        : 0),
    mdef: a.ins + gear.reduce((n, e) => n + (e.mdef ?? 0), 0),
    initiative: gear.reduce((n, e) => n + (e.initiative ?? 0), 0),
  };
  const result = Object.fromEntries(
    Object.entries(base).map(([k, v]) => [
      k,
      c.overrides[k as keyof typeof base] ??
        v + c.modifiers[k as keyof typeof base],
    ]),
  ) as typeof base;
  return {
    ...result,
    level,
    crisis: Math.floor(result.hp / 2),
    cost: characterInventory(c).reduce((n, e) => n + e.cost * e.quantity, 0),
  };
}
export function characterProblems(c: Character, initial = false) {
  if (c.custom || c.kind === "npc") return [];
  const errors: string[] = [],
    level = c.classes.reduce((n, x) => n + x.level, 0),
    sum = (x: Character["classes"][number]) =>
      Object.values(x.skills).reduce((n, r) => n + r, 0);
  if (initial && (level !== 5 || c.classes.length < 2 || c.classes.length > 3))
    errors.push("起始角色需要将 5 个等级分配给 2～3 个职业");
  if (
    initial &&
    !["8,8,8,8", "6,8,8,10", "6,6,10,10"].includes(
      Object.values(c.attrs)
        .sort((a, b) => a - b)
        .join(","),
    )
  )
    errors.push("起始属性请选择三种标准配置之一");
  if (c.classes.filter((x) => x.level < 10).length > 3)
    errors.push("同时最多拥有 3 个未精通职业");
  for (const x of c.classes) {
    const cls = CLASSES.find((k) => k.id === x.id);
    if (!cls) {
      errors.push("自定义职业请开启私设模式");
      continue;
    }
    if (sum(x) !== x.level)
      errors.push(`${cls.name}：技能等级合计应为 ${x.level}`);
    for (const [id, rank] of Object.entries(x.skills)) {
      const skill = cls.skills.find((s) => s.id === id);
      if (!skill || rank > skill.max)
        errors.push(`${cls.name}：技能选择或等级无效`);
    }
  }
  const training = new Set(
      c.classes.flatMap(
        (x) => CLASSES.find((k) => k.id === x.id)?.training ?? [],
      ),
    ),
    gear = equippedItems(c);
  if (gear.filter((x) => x.kind === "armor").length > 1)
    errors.push("只能穿一件防具");
  if (gear.reduce((n, e) => n + (e.hands ?? 0), 0) > 2)
    errors.push("装备占用超过两只手，请调整或开启私设模式");
  if (gear.some((e) => e.training && !training.has(e.training)))
    errors.push("当前职业尚未授予所选职业装备的使用能力");
  if (initial && derived(c).cost > 500)
    errors.push("起始装备预算为 500 泽尼特");
  return errors;
}
export function learnedAbilities(c: Character): Ability[] {
  return [
    ...c.classes.flatMap(
      (x) =>
        CLASSES.find((k) => k.id === x.id)
          ?.skills.filter((s) => (x.skills[s.id] ?? 0) > 0)
          .map((s) => ({
            id: s.id,
            name: s.name + (s.max > 1 ? ` · SL ${x.skills[s.id]}` : ""),
            text: s.description,
            cost: "依能力说明，由 GM 确认",
            source: `${CLASSES.find((k) => k.id === x.id)?.name ?? "职业"} · ${CLASSES.find((k) => k.id === x.id)?.expansion ? "扩展" : "核心"}`,
          })) ?? [],
    ),
    ...equippedItems(c)
      .filter((e) => e.kind === "weapon")
      .map((e, index) => ({
        id: `gear:${e.id}:${index}`,
        name: e.name,
        text: `命中：${e.check}；伤害：HR + ${e.damage}，${e.damageType}。${e.description} 请另行掷骰，GM 确认伤害。`,
        cost: "动作",
        source: "装备",
      })),
    ...c.abilities,
  ];
}
export function newCharacter(id: string, owner: string): Character {
  const c: Character = {
    id,
    revision: 0,
    name: "新的旅人",
    owner,
    kind: "pc",
    side: "heroes",
    public: true,
    identity: "",
    theme: "希望",
    origin: "",
    description: "",
    privateNotes: "",
    attrs: { dex: 8, ins: 10, mig: 6, wlp: 8 },
    classes: [
      {
        id: "weaponmaster",
        level: 3,
        skills: { "weaponmaster-1": 1, "weaponmaster-2": 2 },
      },
      { id: "orator", level: 2, skills: { "orator-2": 1, "orator-5": 1 } },
    ],
    custom: false,
    modifiers: { hp: 0, mp: 0, ip: 0, def: 0, mdef: 0, initiative: 0 },
    overrides: {},
    hp: 0,
    mp: 0,
    ip: 0,
    fabula: 3,
    zenit: 50,
    xp: 0,
    bonds: [],
    statuses: [],
    abilities: [],
    equipment: ["rapier", "travel", "rune-shield"],
    gearNotes: "起始资金：另行掷 2d6 × 10，加到剩余预算上。",
    portrait: "",
    expressions: [],
    color: "#d59a5a",
  };
  Object.assign(c, { hp: derived(c).hp, mp: derived(c).mp, ip: derived(c).ip });
  return c;
}
export function newScene(id: string): Scene {
  return {
    id,
    revision: 0,
    name: "新的场景",
    folder: "",
    mode: "stage",
    background: "",
    audio: "",
    public: false,
    notes: "",
    tokens: [],
    cast: [],
    cues: [],
    cueIndex: -1,
  };
}
export function newWorld(
  id: string,
  title: string,
  gm: { id: string; name: string },
): World {
  const scene = newScene("opening");
  scene.name = "故事的开端";
  scene.public = true;
  return {
    schema: 1,
    id,
    title,
    revision: 0,
    members: [{ ...gm, role: "gm" }],
    characters: [],
    scenes: [scene],
    activeScene: scene.id,
    assets: [],
    clocks: [],
    journal: [],
    logs: [],
    gmNotes: "",
    focus: "",
    speech: null,
    battle: {
      active: false,
      round: 1,
      first: "heroes",
      side: "heroes",
      acted: [],
      roster: [],
      current: "",
    },
    fabulaSpent: 0,
  };
}
