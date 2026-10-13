import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { apply, project } from "../server/world";
import { Store } from "../server/store";
import { newWorld, newCharacter } from "../src/shared/rules";
import { displayClocks, newClock, newJournalEntry } from "../src/shared/clocks";
import type { Identity } from "../src/shared/types";

const gm: Identity = { id: "gm", name: "主持", role: "gm" };
const player: Identity = { id: "player", name: "旅人", role: "player" };
const other: Identity = { id: "other", name: "同伴", role: "player" };
function fixture() {
  const w = newWorld("room", "旅途", gm);
  w.members.push(player, other);
  const c = {
    ...newClock("gate"),
    name: "雾港警戒",
    description: "守卫正在接近藏身处",
    kind: "danger" as const,
    primary: true,
    value: 2,
  };
  apply(w, gm, { type: "clock.save", value: c });
  return w;
}
test("命刻只能由 GM 手动调整，优先显示支持多选且不会公开秘密", () => {
  const w = fixture();
  const secret = {
    ...newClock("secret"),
    name: "尚未揭晓的背叛",
    public: false,
    primary: true,
  };
  apply(w, gm, { type: "clock.save", value: secret });
  assert.equal(w.clocks.find((c) => c.id === "secret")?.primary, false);
  assert.throws(
    () => apply(w, gm, { type: "clock.primary", id: "secret" }),
    /公开/,
  );
  assert.throws(
    () => apply(w, player, { type: "clock.set", id: "gate", value: 5 }),
    /GM/,
  );
  assert.throws(
    () => apply(w, player, { type: "clock.primary", id: "gate" }),
    /GM/,
  );
  apply(w, gm, { type: "clock.set", id: "secret", value: 3 });
  assert.equal(project(w, player).clocks.length, 1);
  assert.ok(!project(w, player).logs.some((l) => l.text.includes(secret.name)));
  const next = { ...newClock("route"), name: "寻找归途", primary: true };
  apply(w, gm, { type: "clock.save", value: next });
  assert.deepEqual(
    displayClocks(w.clocks).map((c) => c.id),
    ["gate", "route"],
  );
  assert.equal(w.clocks.filter((c) => c.primary).length, 2);
  apply(w, gm, {
    type: "clock.save",
    value: { ...w.clocks.find((c) => c.id === "route")!, archived: true },
  });
  assert.equal(displayClocks(w.clocks)[0]?.id, "gate");
  assert.throws(
    () => apply(w, gm, { type: "clock.tick", id: "route", delta: 1 }),
    /恢复/,
  );
});
test("命刻栏优先显示后保持原顺序，无优先项时恢复原顺序", () => {
  const w = fixture();
  for (const id of ["a", "b", "c", "d"]) {
    apply(w, gm, { type: "clock.save", value: { ...newClock(id), name: id } });
  }
  apply(w, gm, { type: "clock.primary", id: "c" });
  apply(w, gm, { type: "clock.primary", id: "a" });
  assert.deepEqual(
    displayClocks(w.clocks).map((c) => c.id),
    ["gate", "a", "c", "b", "d"],
  );
  const values = w.clocks.map((c) => c.value);
  for (const c of [...w.clocks]) {
    apply(w, gm, { type: "clock.save", value: { ...c, primary: false } });
  }
  assert.deepEqual(
    displayClocks(w.clocks).map((c) => c.id),
    ["gate", "a", "b", "c", "d"],
  );
  assert.deepEqual(
    w.clocks.map((c) => c.value),
    values,
  );
  assert.deepEqual(
    w.clocks.map((c) => c.id),
    ["gate", "a", "b", "c", "d"],
  );
  apply(w, gm, {
    type: "clock.save",
    value: { ...w.clocks[1], public: false, primary: true },
  });
  apply(w, gm, {
    type: "clock.save",
    value: { ...w.clocks[2], archived: true, primary: true },
  });
  assert.deepEqual(
    displayClocks(w.clocks).map((c) => c.id),
    ["gate", "c", "d"],
  );
  assert.throws(
    () => apply(w, gm, { type: "clock.primary", id: "b" }),
    /未归档/,
  );
});

test("编辑命刻说明保留当前刻度，填满不自动触发或归档", () => {
  const w = fixture(),
    stale = structuredClone(w.clocks[0]);
  apply(w, gm, { type: "clock.tick", id: "gate", delta: 1 });
  apply(w, gm, {
    type: "clock.save",
    value: { ...stale, description: "更新后的用途" },
  });
  assert.equal(w.clocks[0].value, 3);
  const beforeScene = w.activeScene;
  apply(w, gm, { type: "clock.set", id: "gate", value: 6 });
  assert.equal(w.clocks[0].value, 6);
  assert.equal(w.clocks[0].archived, false);
  assert.equal(w.activeScene, beforeScene);
  assert.match(w.logs.at(-1)!.text, /3 → 6\/6/);
  assert.throws(() =>
    apply(w, gm, { type: "clock.set", id: "gate", value: 7 }),
  );
  apply(w, gm, {
    type: "clock.save",
    value: { ...stale, segments: 4, value: 0 },
  });
  assert.equal(w.clocks[0].value, 4);
});
test("讨论、骰子、战斗与物语点不会推进命刻或代替舞台发言", () => {
  const w = fixture();
  const pc = newCharacter("hero", player.id),
    foe = newCharacter("foe", "");
  foe.kind = "npc";
  foe.side = "foes";
  foe.custom = true;
  w.characters.push(pc, foe);
  apply(w, gm, { type: "say", actor: "", text: "夜幕降临" });
  const speech = structuredClone(w.speech);
  apply(w, player, {
    type: "chat",
    text: "我想用物语点，让这位守卫是我的旧识。",
  });
  apply(w, gm, { type: "chat", text: "我们聊聊你们之前的关系。" });
  assert.deepEqual(w.speech, speech);
  assert.equal(w.logs.at(-1)?.kind, "chat");
  apply(w, player, {
    type: "resource",
    id: pc.id,
    resource: "fabula",
    delta: -1,
    reason: "约定故事细节",
  });
  apply(w, player, {
    type: "roll",
    actor: pc.id,
    sides: [8, 8],
    modifier: 0,
    label: "调查",
  });
  apply(w, gm, {
    type: "battle.start",
    roster: [pc.id, foe.id],
    first: "heroes",
  });
  apply(w, gm, { type: "battle.select", actor: pc.id });
  apply(w, gm, { type: "battle.endTurn" });
  assert.equal(w.clocks[0].value, 2);
});
test("线索有作者和私密边界，旧版本不能覆盖新内容", () => {
  const w = fixture();
  const entry = {
    ...newJournalEntry("clue"),
    title: "旧灯塔",
    text: "第三声钟响来自地下",
    public: false,
    author: gm.id,
  };
  apply(w, player, { type: "journal.save", value: entry, expected: null });
  assert.equal(w.journal[0].author, player.id);
  assert.equal(project(w, other).journal.length, 0);
  assert.equal(project(w, player).journal.length, 1);
  assert.equal(project(w, gm).journal.length, 1);
  assert.throws(
    () => apply(w, other, { type: "journal.save", value: entry, expected: 0 }),
    /自己的日志/,
  );
  apply(w, player, {
    type: "journal.save",
    value: { ...w.journal[0], public: true, text: "确认是地下钟室" },
    expected: 0,
  });
  assert.equal(project(w, other).journal[0].text, "确认是地下钟室");
  assert.throws(
    () => apply(w, player, { type: "journal.save", value: entry, expected: 0 }),
    /已被更新/,
  );
  assert.throws(
    () =>
      apply(w, other, {
        type: "journal.archive",
        id: entry.id,
        value: true,
        expected: 1,
      }),
    /自己的日志/,
  );
  apply(w, gm, {
    type: "journal.archive",
    id: entry.id,
    value: true,
    expected: 1,
  });
  assert.equal(w.journal[0].archived, true);
  apply(w, player, {
    type: "journal.archive",
    id: entry.id,
    value: false,
    expected: 2,
  });
  assert.equal(w.journal[0].archived, false);
});
test("300 条聊天截断不影响独立线索，重启后保留刻度和日志", async () => {
  const root = await mkdtemp(join(tmpdir(), "fu-records-"));
  const store = new Store(root);
  await store.init();
  const { room, me } = await store.create(
    "记录验收",
    "GM",
    "test-password-only",
  );
  await store.change(room.world.id, (r) => {
    apply(r.world, me, {
      type: "journal.save",
      value: {
        ...newJournalEntry("clue"),
        title: "第一天的线索",
        text: "不会因为聊天多而消失",
      },
      expected: null,
    });
    apply(r.world, me, {
      type: "clock.save",
      value: { ...newClock("clock"), name: "旅途", value: 4, primary: true },
    });
    for (let i = 0; i < 310; i++)
      apply(r.world, me, { type: "chat", text: `讨论 ${i}` });
  });
  const reloaded = await new Store(root).get(room.world.id);
  assert.equal(reloaded.world.logs.length, 300);
  assert.equal(reloaded.world.journal[0].title, "第一天的线索");
  assert.equal(reloaded.world.clocks[0].value, 4);
  assert.equal(displayClocks(reloaded.world.clocks)[0]?.id, "clock");
});
test("旧房间补日志列表时保留已有命刻和资料", async () => {
  const root = await mkdtemp(join(tmpdir(), "fu-old-room-"));
  const store = new Store(root);
  await store.init();
  const { room } = await store.create("旧世界", "GM", "test-password-only");
  const path = join(root, "rooms", room.world.id + ".json");
  const legacy = JSON.parse(await readFile(path, "utf8"));
  delete legacy.world.journal;
  legacy.world.clocks = [
    {
      id: "old",
      name: "旧命刻",
      description: "原来的说明",
      value: 3,
      segments: 8,
      public: true,
    },
  ];
  await writeFile(path, JSON.stringify(legacy));
  const loaded = await new Store(root).get(room.world.id);
  assert.deepEqual(loaded.world.journal, []);
  assert.equal(loaded.world.clocks[0].value, 3);
  assert.equal(
    displayClocks(loaded.world.clocks)[0]?.description,
    "原来的说明",
  );
});
