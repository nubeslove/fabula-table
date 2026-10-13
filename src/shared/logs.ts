import type { Log } from "./types";
export const LOG_CHANNELS = {
  ic: "场内聊天",
  ooc: "场外聊天",
  dice: "掷骰",
  combat: "战斗日志",
  system: "系统日志",
} as const;
export function logChannel(log: Log): keyof typeof LOG_CHANNELS {
  if (log.channel) return log.channel;
  if (log.kind === "speech") return "ic";
  if (log.kind === "chat") return "ooc";
  if (log.kind === "roll") return "dice";
  if (
    log.kind === "action" ||
    /^(冲突|第\s*\d+\s*轮|HP |MP |IP |物语点 |泽尼特 )/.test(log.text)
  )
    return "combat";
  return "system";
}
