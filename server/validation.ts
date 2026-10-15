import type { Character, Scene, Clock } from "../src/shared/types";
import { EQUIPMENT, STATUS } from "../src/shared/rules";
import { DEFAULT_GRID } from "../src/shared/exploration";
import { THEATRE_EMOTES, THEATRE_ACTION_IDS } from "../src/shared/theatre";
export class UserError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function insist(
  value: unknown,
  message: string,
  status = 400,
): asserts value {
  if (!value) throw new UserError(message, status);
}
export function obj(v: unknown): Record<string, unknown> {
  insist(v && typeof v === "object" && !Array.isArray(v), "数据格式不正确");
  return v as Record<string, unknown>;
}
export function str(v: unknown, max = 20000) {
  insist(typeof v === "string" && v.length <= max, "文本过长或格式不正确");
  return v;
}
export function id(v: unknown) {
  const x = str(v, 80);
  insist(/^[a-zA-Z0-9_-]+$/.test(x), "标识不正确");
  return x;
}
export function num(v: unknown, min = -1000000, max = 1000000) {
  insist(
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max,
    "数值超出范围",
  );
  return v;
}
export function int(v: unknown, min = -1000000, max = 1000000) {
  const n = num(v, min, max);
  insist(Number.isInteger(n), "请输入整数");
  return n;
}
export function bool(v: unknown) {
  insist(typeof v === "boolean", "开关格式不正确");
  return v;
}
export function one<T extends string>(v: unknown, items: readonly T[]): T {
  insist(items.includes(v as T), "选项不正确");
  return v as T;
}
export function list<T>(v: unknown, parse: (x: unknown) => T, max = 100): T[] {
  insist(Array.isArray(v) && v.length <= max, "列表过长或格式不正确");
  return v.map(parse);
}
export function unique(xs: string[]) {
  insist(new Set(xs).size === xs.length, "不能重复选择");
  return xs;
}
const asset = (v: unknown) => (v === "" ? "" : id(v));
export function character(v: unknown): Character {
  const c = obj(v),
    attrs = obj(c.attrs),
    m = obj(c.modifiers),
    o = obj(c.overrides);
  const keys = ["hp", "mp", "ip", "def", "mdef", "initiative"] as const;
  const classes = list(
    c.classes,
    (x) => {
      const a = obj(x),
        skills = obj(a.skills);
      insist(Object.keys(skills).length <= 40, "技能过多");
      return {
        id: id(a.id),
        boost:
          a.boost === undefined
            ? undefined
            : one(a.boost, ["hp", "mp", "ip"] as const),
        ...(a.name ? { name: str(a.name, 80) } : {}),
        level: int(a.level, 1, 50),
        skills: Object.fromEntries(
          Object.entries(skills).map(([k, n]) => [id(k), int(n, 0, 50)]),
        ),
      };
    },
    30,
  );
  unique(classes.map((x) => x.id));
  const equipment = list(
    c.equipment,
    (x) =>
      one(
        x,
        EQUIPMENT.map((e) => e.id),
      ),
    10,
  );
  const expressions = list(
    c.expressions,
    (x) => {
      const e = obj(x);
      return { id: id(e.id), name: str(e.name, 80), asset: asset(e.asset) };
    },
    30,
  );
  unique(expressions.map((x) => x.id));
  const abilities = list(c.abilities, (x) => {
    const a = obj(x);
    return {
      id: id(a.id),
      name: str(a.name, 100),
      text: str(a.text, 10000),
      cost: str(a.cost, 200),
      source: a.source === undefined ? undefined : str(a.source, 300),
      target: a.target === undefined ? undefined : str(a.target, 200),
      duration: a.duration === undefined ? undefined : str(a.duration, 100),
    };
  });
  unique(abilities.map((x) => x.id));
  const inventory =
    c.inventory === undefined
      ? undefined
      : list(
          c.inventory,
          (x) => {
            const e = obj(x);
            return {
              id: id(e.id),
              name: str(e.name, 100),
              kind: one(e.kind, [
                "weapon",
                "shield",
                "armor",
                "accessory",
                "item",
              ] as const),
              template:
                e.template === undefined
                  ? undefined
                  : one(
                      e.template,
                      EQUIPMENT.map((e) => e.id),
                    ),
              quantity: int(e.quantity, 1, 999),
              cost: int(e.cost, 0),
              hands: int(e.hands, 0, 2),
              check: str(e.check, 100),
              damage: int(e.damage, 0, 999),
              damageType: str(e.damageType, 30),
              description: str(e.description, 5000),
              def: int(e.def, -100, 100),
              mdef: int(e.mdef, -100, 100),
              initiative: int(e.initiative, -100, 100),
              fixed: e.fixed === undefined ? undefined : int(e.fixed, 0, 999),
              training:
                e.training === undefined
                  ? undefined
                  : one(e.training, ["melee", "ranged", "armor", "shield"]),
            };
          },
          200,
        );
  if (inventory) unique(inventory.map((e) => e.id));
  const rawLoadout = c.loadout === undefined ? {} : obj(c.loadout);
  const loadout: Character["loadout"] = {};
  if (inventory)
    for (const slot of ["main", "off", "armor", "accessory"] as const) {
      if (!rawLoadout[slot]) continue;
      const value = id(rawLoadout[slot]);
      const item = inventory.find((e) => e.id === value);
      insist(item, "装备槽引用了不存在的物品");
      insist(
        slot === "main" || slot === "off"
          ? item.kind === "weapon" || item.kind === "shield"
          : item.kind === slot,
        "物品不能放入此装备槽",
      );
      loadout[slot] = value;
    }
  if (inventory) {
    const main = inventory.find((e) => e.id === loadout.main),
      off = inventory.find((e) => e.id === loadout.off);
    if (main?.hands === 2 || off?.hands === 2)
      insist(main?.id === off?.id, "双手装备需要占用两只手");
    if (main && main.id === off?.id && main.hands !== 2)
      insist(main.quantity >= 2, "同一物品双持需要至少两件");
  }
  return {
    id: id(c.id),
    revision: int(c.revision, 0),
    name: str(c.name, 80).trim() || "无名旅人",
    owner: asset(c.owner),
    kind: one(c.kind, ["pc", "npc"]),
    side: one(c.side, ["heroes", "foes"]),
    public: bool(c.public),
    identity: str(c.identity, 300),
    theme: str(c.theme, 300),
    origin: str(c.origin, 300),
    description: str(c.description),
    privateNotes: str(c.privateNotes),
    attrs: {
      dex: int(attrs.dex, 2, 30),
      ins: int(attrs.ins, 2, 30),
      mig: int(attrs.mig, 2, 30),
      wlp: int(attrs.wlp, 2, 30),
    },
    classes,
    custom: bool(c.custom),
    modifiers: Object.fromEntries(
      keys.map((k) => [k, int(m[k], -9999, 9999)]),
    ) as Character["modifiers"],
    overrides: Object.fromEntries(
      keys
        .filter((k) => o[k] !== undefined)
        .map((k) => [k, int(o[k], k === "initiative" ? -999 : 0, 99999)]),
    ),
    hp: int(c.hp, 0),
    mp: int(c.mp, 0),
    ip: int(c.ip, 0),
    fabula: int(c.fabula, 0),
    zenit: int(c.zenit, 0),
    xp: int(c.xp, 0),
    bonds: list(
      c.bonds,
      (x) => {
        const b = obj(x);
        return {
          name: str(b.name, 100),
          feelings: list(b.feelings, (x) => str(x, 80), 6),
        };
      },
      10,
    ),
    statuses: unique(list(c.statuses, (x) => one(x, STATUS), 6)),
    abilities,
    equipment,
    inventory,
    loadout: inventory ? loadout : undefined,
    gearNotes: str(c.gearNotes),
    portrait: asset(c.portrait),
    expressions,
    color: /^#[0-9a-fA-F]{6}$/.test(String(c.color))
      ? String(c.color)
      : "#d59a5a",
  };
}
export function scene(v: unknown): Scene {
  const s = obj(v);
  const grid = s.grid === undefined ? { ...DEFAULT_GRID } : obj(s.grid);
  const tokens = list(
    s.tokens,
    (x) => {
      const t = obj(x);
      return {
        id: id(t.id),
        actor: id(t.actor),
        x: num(t.x, 0, 100),
        y: num(t.y, 0, 100),
        hidden: bool(t.hidden),
      };
    },
    100,
  );
  unique(tokens.map((t) => t.id));
  const cast = list(
    s.cast,
    (x) => {
      const c = obj(x);
      return {
        actor: id(c.actor),
        expression: asset(c.expression),
        position: int(c.position, 0, 5),
        mirrored: c.mirrored === undefined ? false : bool(c.mirrored),
        offset:
          c.offset === undefined
            ? undefined
            : {
                x: num(obj(c.offset).x, -80, 80),
                y: num(obj(c.offset).y, -40, 20),
              },
        emote:
          c.emote === undefined
            ? undefined
            : one(c.emote, ["", ...THEATRE_EMOTES] as const),
        emoteId: c.emoteId === undefined ? undefined : str(c.emoteId, 80),
        side:
          c.side === undefined
            ? undefined
            : one(c.side, ["left", "right"] as const),
        dockOrder: c.dockOrder === undefined ? undefined : int(c.dockOrder, 0),
        action:
          c.action === undefined
            ? undefined
            : {
                kind: one(obj(c.action).kind, THEATRE_ACTION_IDS),
                id: id(obj(c.action).id),
                at: num(obj(c.action).at, 0, Number.MAX_SAFE_INTEGER),
              },
      };
    },
    6,
  );
  unique(cast.map((c) => c.actor));
  unique(cast.map((c) => String(c.position)));
  return {
    id: id(s.id),
    revision: int(s.revision, 0),
    name: str(s.name, 100),
    folder: s.folder === undefined ? "" : str(s.folder, 60).trim(),
    mode: one(s.mode, ["stage", "map", "battle"]),
    background: asset(s.background),
    audio: asset(s.audio),
    public: bool(s.public),
    notes: str(s.notes),
    tokens,
    grid: {
      columns: int(grid.columns, 4, 60),
      rows: int(grid.rows, 4, 60),
      movePerRound: int(grid.movePerRound, 1, 60),
      diagonal: bool(grid.diagonal),
    },
    cast,
    theatre: s.theatre === undefined ? false : bool(s.theatre),
    cues: list(
      s.cues,
      (x) => {
        const c = obj(x);
        return {
          id: id(c.id),
          actor: asset(c.actor),
          expression: asset(c.expression),
          text: str(c.text, 4000),
        };
      },
      200,
    ),
    cueIndex: int(s.cueIndex, -1, 199),
  };
}
export function clock(v: unknown): Clock {
  const c = obj(v),
    segments = int(c.segments, 4, 12);
  return {
    id: id(c.id),
    scene: c.scene ? id(c.scene) : undefined,
    placement:
      c.placement === undefined
        ? "upper"
        : one(c.placement, ["upper", "lower"] as const),
    name: str(c.name, 100).trim(),
    segments,
    value: int(c.value, 0, segments),
    public: bool(c.public),
    description: str(c.description, 2000),
    kind:
      c.kind === undefined
        ? "goal"
        : one(c.kind, ["goal", "danger", "discovery", "journey"] as const),
    primary: c.primary === undefined ? false : bool(c.primary),
    archived: c.archived === undefined ? false : bool(c.archived),
  };
}
