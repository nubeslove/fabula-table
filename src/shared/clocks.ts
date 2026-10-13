import type { Clock, JournalEntry } from "./types";

export const CLOCK_KINDS = {
  goal: { label: "目标", glyph: "✧" },
  danger: { label: "危机", glyph: "◆" },
  discovery: { label: "调查", glyph: "◈" },
  journey: { label: "旅程", glyph: "✦" },
} as const;

export function displayClocks(clocks: Clock[]) {
  const visible = clocks.filter((c) => c.public && !c.archived);
  return [
    ...visible.filter((c) => c.primary),
    ...visible.filter((c) => !c.primary),
  ];
}

export function newClock(id: string): Clock {
  return {
    id,
    name: "",
    description: "",
    segments: 6,
    value: 0,
    public: true,
    kind: "goal",
    primary: false,
    archived: false,
  };
}

export function newJournalEntry(id: string): JournalEntry {
  return {
    id,
    revision: 0,
    title: "",
    text: "",
    kind: "clue",
    public: true,
    author: "",
    createdAt: 0,
    updatedAt: 0,
    archived: false,
  };
}
