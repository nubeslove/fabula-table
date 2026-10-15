export const THEATRE_EMOTES = [
  "happy",
  "surprise",
  "question",
  "angry",
  "sad",
  "heart",
  "thinking",
  "nervous",
  "music",
  "sleepy",
] as const;
export type TheatreEmote = (typeof THEATRE_EMOTES)[number];
export const THEATRE_ACTIONS = {
  shock: {
    name: "震惊",
    emote: "surprise",
    ms: 600,
    hint: "晃动两下，惊讶弹出",
  },
  joy: { name: "开心", emote: "happy", ms: 720, hint: "轻跳两次" },
  angry: { name: "生气", emote: "angry", ms: 650, hint: "急促左右摆动" },
  fear: { name: "害怕", emote: "nervous", ms: 850, hint: "紧张地小幅颤抖" },
  question: {
    name: "疑惑",
    emote: "question",
    ms: 900,
    hint: "歪头，停顿，回正",
  },
  nod: { name: "点头", emote: "happy", ms: 650, hint: "连续点头两次" },
  no: { name: "摇头", emote: "question", ms: 700, hint: "左右摇头两次" },
  bow: { name: "鞠躬", emote: "", ms: 1000, hint: "前倾致意后起身" },
  sad: { name: "沮丧", emote: "sad", ms: 1100, hint: "缓缓低下头" },
  proud: { name: "得意", emote: "happy", ms: 800, hint: "昂起身子，轻轻一抖" },
  love: { name: "撒娇", emote: "heart", ms: 1000, hint: "柔和摇摆，爱心浮现" },
  sleepy: { name: "瞌睡", emote: "sleepy", ms: 1300, hint: "慢慢点头打瞌睡" },
} as const;
export type TheatreAction = keyof typeof THEATRE_ACTIONS;
/** Both timestamps come from the server; a player's clock is not authoritative. */
export function newTheatreAction<T extends { id: string; at: number }>(
  seen: string | undefined,
  action: T | undefined,
  serverTime: number | undefined,
): T | undefined {
  if (!action || action.id === seen) return undefined;
  const age = (serverTime ?? action.at) - action.at;
  return age >= 0 && age < 5000 ? action : undefined;
}
export const THEATRE_ACTION_IDS = Object.keys(
  THEATRE_ACTIONS,
) as TheatreAction[];
export type TheatreSide = "left" | "right";
export function theatreSide(slot: {
  side?: TheatreSide;
  position: number;
}): TheatreSide {
  return slot.side ?? (slot.position % 2 === 0 ? "left" : "right");
}
/** Stable edge grouping: changing speaker never moves other portraits. */
export function theatreLayout<
  T extends {
    actor: string;
    position: number;
    side?: TheatreSide;
    dockOrder?: number;
  },
>(slots: T[], width: number, height: number) {
  const groups = {
    left: slots.filter((s) => theatreSide(s) === "left"),
    right: slots.filter((s) => theatreSide(s) === "right"),
  };
  const both = groups.left.length > 0 && groups.right.length > 0;
  const count = Math.max(groups.left.length, groups.right.length);
  const result: Record<
    string,
    { left: number; width: number; height: number; layer: number }
  > = {};
  for (const side of ["left", "right"] as const) {
    const group = groups[side].sort(
      (a, b) =>
        (b.dockOrder ?? 0) - (a.dockOrder ?? 0) || a.position - b.position,
    );
    const budget = Math.max(0, width - 48) * (both ? 0.45 : 0.78);
    const cardWidth = Math.min(
      240,
      height * 0.94,
      budget / (1 + Math.max(0, count - 1) * 0.82),
    );
    group.forEach((s, i) => {
      const edge = 24 + i * cardWidth * 0.82;
      result[s.actor] = {
        left: side === "left" ? edge : width - edge - cardWidth,
        width: cardWidth,
        height: Math.min(height, cardWidth * 1.4),
        layer: group.length - i,
      };
    });
  }
  return result;
}
export const EMOTE_NAMES: Record<TheatreEmote, string> = {
  happy: "开心",
  surprise: "惊讶",
  question: "疑问",
  angry: "生气",
  sad: "难过",
  heart: "爱心",
  thinking: "思考",
  nervous: "紧张",
  music: "哼歌",
  sleepy: "困倦",
};
export function moveTheatreOffset(
  offset: { x: number; y: number } | undefined,
  dx: number,
  dy: number,
) {
  return {
    x: Math.max(-80, Math.min(80, (offset?.x ?? 0) + dx)),
    y: Math.max(-40, Math.min(20, (offset?.y ?? 0) + dy)),
  };
}
