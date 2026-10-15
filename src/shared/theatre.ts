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
