import type { World, Identity, JournalEntry } from "../src/shared/types";
import * as v from "./validation";

export function updateJournal(
  w: World,
  me: Identity,
  type: string,
  input: Record<string, unknown>,
) {
  const value = type === "journal.save" ? v.obj(input.value) : input;
  const id = v.id(value.id);
  const old = w.journal.find((e) => e.id === id);
  v.insist(old || type === "journal.save", "日志不存在", 404);
  v.insist(
    !old || old.author === me.id || me.role === "gm",
    "只能修改自己的日志",
    403,
  );
  v.insist(
    old ? input.expected === old.revision : input.expected === null,
    "日志已被更新，请重新打开后编辑",
    409,
  );
  if (type === "journal.archive" && old) {
    old.archived = v.bool(input.value);
    old.revision++;
    old.updatedAt = Date.now();
    return;
  }
  const title = v.str(value.title, 160).trim();
  const text = v.str(value.text, 12000).trim();
  v.insist(title && text, "请填写日志标题和内容");
  const entry: JournalEntry = {
    id,
    title,
    text,
    kind: v.one(value.kind, ["clue", "note"]),
    public: v.bool(value.public),
    author: old?.author ?? me.id,
    revision: (old?.revision ?? -1) + 1,
    createdAt: old?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    archived: old?.archived ?? false,
  };
  if (old) w.journal[w.journal.indexOf(old)] = entry;
  else w.journal.push(entry);
}
