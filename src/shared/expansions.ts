export const EXPANSIONS = [
  {
    id: "high",
    name: "高度奇幻",
    detail: "徽记师、指挥官、舞者、魔奏者与相关可选规则",
  },
  { id: "techno", name: "科技奇幻", detail: "机师、灵能者、突变体与魔晶石" },
  {
    id: "natural",
    name: "自然奇幻",
    detail: "商人、植物学家、祈唤者、美食家与营地活动",
  },
  {
    id: "playtest",
    name: "测试与补充",
    detail: "死灵术士、卡牌大师、测试英雄技能与规则更新",
  },
  {
    id: "optional",
    name: "其他可选资料",
    detail: "金手指、底力、万圣节及埃德加的赠礼",
  },
] as const;
export const expansionName = (id?: string) =>
  EXPANSIONS.find((e) => e.id === id)?.name ?? "核心规则";
export function checkedExpansions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return EXPANSIONS.filter((e) => value.includes(e.id)).map((e) => e.id);
}
