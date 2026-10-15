import test from "node:test";
import assert from "node:assert/strict";
import { apply, referencedAssets } from "../server/world";
import { newWorld, newCharacter } from "../src/shared/rules";
import { newClock } from "../src/shared/clocks";
const gm = { id: "gm", name: "GM", role: "gm" as const },
  player = { id: "p", name: "玩家", role: "player" as const },
  other = { id: "other", name: "其他玩家", role: "player" as const };
function fixture() {
  const w = newWorld("test", "删除验收", gm);
  w.characters.push(
    newCharacter("pc", player.id),
    newCharacter("other", other.id),
  );
  return w;
}
test("删除角色清理冲突、探索、台词与Token；只能删除自己的角色", () => {
  const w = fixture(),
    s = w.scenes[0];
  s.tokens = [{ id: "token", actor: "pc", x: 0, y: 0, hidden: false }];
  s.cast = [{ actor: "pc", expression: "", position: 0 }];
  s.cues = [{ id: "cue", actor: "pc", expression: "", text: "测试" }];
  s.cueIndex = 0;
  s.exploration = {
    active: true,
    round: 2,
    current: "pc",
    order: ["pc", "other"],
    spent: { pc: 2 },
  };
  Object.assign(w.battle, {
    active: true,
    roster: ["pc", "other"],
    acted: ["pc"],
    current: "pc",
  });
  w.focus = "pc";
  w.speech = { id: "say", actor: "pc", name: "PC", text: "保留历史" };
  assert.throws(
    () => apply(w, other, { type: "character.delete", id: "pc" }),
    /不能操作/,
  );
  apply(w, player, { type: "character.delete", id: "pc" });
  assert.deepEqual(w.battle.roster, ["other"]);
  assert.equal(w.battle.current, "");
  assert.deepEqual(s.exploration.order, ["other"]);
  assert.equal(s.exploration.current, "other");
  assert.deepEqual(s.exploration.spent, {});
  assert.equal(s.tokens.length + s.cast.length + s.cues.length, 0);
  assert.equal(s.cueIndex, -1);
  assert.equal(w.speech, null);
  assert.equal(w.focus, "");
  assert.ok(w.logs.at(-1)?.text.includes("删除了人物"));
});
test("删除活动场景回到空白舞台并清理关联命刻，不删除人物与素材", () => {
  const w = fixture(),
    id = w.activeScene;
  w.clocks = [
    { ...newClock("scene-clock"), scene: id },
    newClock("world-clock"),
  ];
  w.battle.active = true;
  assert.throws(() => apply(w, player, { type: "scene.delete", id }), /GM/);
  apply(w, gm, { type: "scene.delete", id });
  assert.equal(w.scenes.length, 1);
  assert.notEqual(w.activeScene, id);
  assert.equal(w.scenes[0].public, true);
  assert.equal(w.battle.active, false);
  assert.equal(w.characters.length, 2);
  assert.deepEqual(
    w.clocks.map((c) => c.id),
    ["world-clock"],
  );
});
test("删除世界素材撤销引用与下载权限；基础资源不被误删", () => {
  const w = fixture(),
    s = w.scenes[0],
    c = w.characters[0];
  w.assets = [
    {
      id: "art",
      name: "图片",
      hash: "a".repeat(64),
      mime: "image/webp",
      size: 20,
      preload: true,
    },
  ];
  c.portrait = "art";
  c.expressions = [{ id: "smile", name: "笑", asset: "art" }];
  s.background = "art";
  s.audio = "art";
  s.cast = [{ actor: c.id, expression: "smile", position: 0 }];
  s.cues = [{ id: "cue", actor: c.id, expression: "smile", text: "测试" }];
  assert.throws(
    () => apply(w, player, { type: "asset.delete", id: "art" }),
    /GM/,
  );
  apply(w, gm, { type: "asset.delete", id: "art" });
  assert.equal(w.assets.length, 0);
  assert.equal(c.portrait, "");
  assert.equal(c.expressions.length, 0);
  assert.equal(s.background, "");
  assert.equal(s.audio, "");
  assert.equal(s.cast[0].expression, "");
  assert.equal(s.cues[0].expression, "");
  assert.equal(referencedAssets(w, player).has("art"), false);
  assert.throws(
    () => apply(w, gm, { type: "asset.delete", id: "base-library" }),
    /不存在/,
  );
});
test("操作面板的基本行动只写日志，不自动扣资源或修改行动状态", () => {
  const w = fixture(),
    c = w.characters[0],
    before = structuredClone(c);
  assert.throws(
    () =>
      apply(w, other, { type: "battle.basic", actor: c.id, action: "防御" }),
    /不能操作/,
  );
  apply(w, player, { type: "battle.basic", actor: c.id, action: "防御" });
  assert.deepEqual(c, before);
  assert.equal(w.logs.at(-1)?.channel, "combat");
  assert.ok(w.logs.at(-1)?.text.includes("防御"));
  assert.throws(
    () =>
      apply(w, player, { type: "battle.basic", actor: c.id, action: "未知" }),
    /无效|不支持|选项/,
  );
});
