export type Attribute = "dex" | "ins" | "mig" | "wlp";
export type Resource = "hp" | "mp" | "ip" | "fabula" | "zenit";
export interface ClassChoice {
  boost?: "hp" | "mp" | "ip";
  id: string;
  name?: string;
  level: number;
  skills: Record<string, number>;
}
export interface Ability {
  id: string;
  name: string;
  text: string;
  cost: string;
  source?: string;
  target?: string;
  duration?: string;
}
export interface Expression {
  id: string;
  name: string;
  asset: string;
}
export interface InventoryItem {
  id: string;
  name: string;
  kind: "weapon" | "shield" | "armor" | "accessory" | "item";
  template?: string;
  quantity: number;
  cost: number;
  hands: number;
  check: string;
  damage: number;
  damageType: string;
  description: string;
  def: number;
  mdef: number;
  initiative: number;
  fixed?: number;
  training?: string;
}
export type EquipmentSlot = "main" | "off" | "armor" | "accessory";
export interface Character {
  id: string;
  revision: number;
  name: string;
  owner: string;
  kind: "pc" | "npc";
  side: "heroes" | "foes";
  public: boolean;
  identity: string;
  theme: string;
  origin: string;
  description: string;
  privateNotes: string;
  attrs: Record<Attribute, number>;
  classes: ClassChoice[];
  custom: boolean;
  modifiers: {
    hp: number;
    mp: number;
    ip: number;
    def: number;
    mdef: number;
    initiative: number;
  };
  overrides: Partial<
    Record<"hp" | "mp" | "ip" | "def" | "mdef" | "initiative", number>
  >;
  hp: number;
  mp: number;
  ip: number;
  fabula: number;
  zenit: number;
  xp: number;
  bonds: { name: string; feelings: string[] }[];
  statuses: string[];
  abilities: Ability[];
  equipment: string[];
  inventory?: InventoryItem[];
  loadout?: Partial<Record<EquipmentSlot, string>>;
  gearNotes: string;
  portrait: string;
  expressions: Expression[];
  color: string;
}
export interface Token {
  id: string;
  actor: string;
  x: number;
  y: number;
  hidden: boolean;
}
export interface ExplorationGrid {
  columns: number;
  rows: number;
  movePerRound: number;
  diagonal: boolean;
}
export interface ExplorationTurn {
  active: boolean;
  round: number;
  order: string[];
  current: string;
  spent: Record<string, number>;
}
export interface Scene {
  id: string;
  revision: number;
  name: string;
  /** GM preparation directory; omitted by older saves. */
  folder?: string;
  mode: "stage" | "map" | "battle";
  background: string;
  audio: string;
  public: boolean;
  notes: string;
  tokens: Token[];
  /** Optional for saves created before square-grid exploration. */
  grid?: ExplorationGrid;
  exploration?: ExplorationTurn;
  cast: { actor: string; expression: string; position: number }[];
  cues: { id: string; actor: string; expression: string; text: string }[];
  cueIndex: number;
}
export interface Asset {
  id: string;
  hash: string;
  name: string;
  mime: string;
  size: number;
  preload: boolean;
  sourceHash?: string;
}
export interface Clock {
  scene?: string;
  placement?: "upper" | "lower";
  id: string;
  name: string;
  segments: number;
  value: number;
  public: boolean;
  description: string;
  kind?: "goal" | "danger" | "discovery" | "journey";
  /** 优先显示；保留旧存档字段名，可同时选中多个。 */
  primary?: boolean;
  archived?: boolean;
}
export interface JournalEntry {
  id: string;
  revision: number;
  title: string;
  text: string;
  kind: "clue" | "note";
  public: boolean;
  author: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}
export interface Log {
  channel?: "system" | "ic" | "ooc" | "dice" | "combat";
  id: string;
  at: number;
  kind: "speech" | "chat" | "roll" | "action" | "system";
  author: string;
  actor: string;
  name: string;
  text: string;
  roll?: { sides: number[]; values: number[]; modifier: number };
  private?: boolean;
}
export interface World {
  expansions?: string[];
  schema: 1;
  id: string;
  title: string;
  revision: number;
  members: { id: string; name: string; role: "gm" | "player" }[];
  characters: Character[];
  scenes: Scene[];
  activeScene: string;
  assets: Asset[];
  clocks: Clock[];
  journal: JournalEntry[];
  logs: Log[];
  gmNotes: string;
  focus: string;
  speech: { actor: string; name: string; text: string; id: string } | null;
  battle: {
    active: boolean;
    round: number;
    first: "heroes" | "foes";
    side: "heroes" | "foes";
    acted: string[];
    roster: string[];
    current: string;
  };
  fabulaSpent: number;
}
export interface Identity {
  id: string;
  name: string;
  role: "gm" | "player";
}
export interface Session {
  accountLinked?: boolean;
  world: World;
  me: Identity;
  invite?: string;
  preloadKey?: string;
}
export type Command =
  | { type: "battle.nextRound" }
  | { type: "character.save"; value: Character; expected: number | null }
  | { type: "character.delete"; id: string }
  | {
      type: "resource";
      id: string;
      resource: Resource;
      delta: number;
      reason: string;
    }
  | { type: "scene.save"; value: Scene; expected: number | null }
  | { type: "scene.open"; id: string }
  | { type: "scene.delete"; id: string }
  | {
      type: "token.move";
      scene: string;
      token: string;
      x: number;
      y: number;
      expected?: number;
      adjust?: boolean;
    }
  | {
      type: "exploration.start";
      scene: string;
      order: string[];
      expected: number;
    }
  | {
      type: "exploration.endTurn" | "exploration.stop";
      scene: string;
      expected: number;
    }
  | { type: "stage.cast"; actor: string; present: boolean; position?: number }
  | { type: "stage.focus"; actor: string }
  | { type: "stage.expression"; actor: string; expression: string }
  | { type: "say"; actor: string; text: string }
  | { type: "chat"; text: string; channel?: "ic" | "ooc"; actor?: string }
  | { type: "cue"; index: number }
  | {
      type: "roll";
      actor: string;
      sides: number[];
      modifier: number;
      label: string;
    }
  | { type: "declare"; actor: string; ability: string }
  | { type: "clock.save"; value: Clock }
  | { type: "clock.tick"; id: string; delta: number }
  | { type: "clock.set"; id: string; value: number }
  | { type: "clock.primary"; id: string }
  | { type: "clock.delete"; id: string }
  | { type: "journal.save"; value: JournalEntry; expected: number | null }
  | { type: "journal.archive"; id: string; value: boolean; expected: number }
  | { type: "battle.start"; roster: string[]; first: "heroes" | "foes" }
  | { type: "battle.select"; actor: string }
  | { type: "battle.endTurn" }
  | { type: "battle.stop" }
  | { type: "asset.preload"; id: string; value: boolean }
  | { type: "notes"; text: string };
