import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { apply, project } from "../server/world";
import { character } from "../server/validation";
import {
  newWorld,
  newCharacter,
  derived,
  characterInventory,
  characterLoadout,
  inventoryItem,
  learnedAbilities,
} from "../src/shared/rules";
import { MONSTERS, monsterCharacter } from "../src/shared/bestiary";
import { BASE_ART } from "../src/shared/base-library";
import { formation } from "../src/shared/formation";
import spells from "../src/shared/spells.json";
const gm = { id: "gm", name: "GM", role: "gm" as const },
  player = { id: "p", name: "玩家", role: "player" as const };
test("旧装备转换后保持数值，背包不提供穿戴加值；双盾分别计算", () => {
  const c = newCharacter("pc", "p"),
    old = derived(c);
  c.inventory = characterInventory(c);
  c.loadout = characterLoadout({ ...c, inventory: undefined });
  assert.deepEqual(derived(c), old);
  c.inventory.push(inventoryItem("bronze-shield", "spare"));
  assert.equal(derived(c).def, old.def);
  c.loadout = {
    main: "spare",
    off: c.inventory.find((i) => i.template === "rune-shield")!.id,
  };
  assert.equal(derived(c).def, c.attrs.dex + 4);
  assert.equal(character(c).inventory?.length, 4);
  c.loadout.main = "missing";
  assert.throws(() => character(c), /不存在/);
});
test("双手装备占两格且只计算一次；自定义攻击可声明", () => {
  const c = newCharacter("pc", "p");
  c.custom = true;
  c.inventory = [
    {
      ...inventoryItem("greatsword", "custom"),
      name: "星轨刃",
      check: "DEX + INS + 2",
      damage: 12,
      damageType: "光",
      description: "自定义三点",
    },
  ];
  c.loadout = { main: "custom", off: "custom" };
  assert.equal(character(c).inventory?.length, 1);
  assert.equal(derived(c).cost, 200);
  assert.equal(
    learnedAbilities(c).filter((a) => a.name === "星轨刃").length,
    1,
  );
  delete c.loadout.off;
  assert.throws(() => character(c), /两只手/);
});
test("怪物预制能保存并引用基础立绘，NPC 数据仍由服务器隐藏", () => {
  const w = newWorld("test", "资源验收", gm);
  w.members.push(player);
  for (const m of MONSTERS) {
    const c = monsterCharacter(m, m.id);
    assert.ok(c.portrait, m.name);
    apply(w, gm, { type: "character.save", value: c, expected: null });
    assert.equal(w.characters.at(-1)?.hp, m.hp);
  }
  assert.equal(project(w, player).characters.length, 0);
  const c = structuredClone(w.characters[0]);
  c.public = true;
  c.inventory = [inventoryItem("bronze-shield", "secret")];
  c.loadout = { off: "secret" };
  apply(w, gm, { type: "character.save", value: c, expected: c.revision });
  const view = project(w, player).characters[0];
  assert.deepEqual(view.inventory, []);
  assert.deepEqual(view.loadout, {});
  assert.equal(view.portrait, c.portrait);
  apply(w, player, {
    type: "character.save",
    value: monsterCharacter(MONSTERS[0], "forged"),
    expected: null,
  });
  assert.equal(w.characters.at(-1)?.kind, "pc");
  assert.equal(w.characters.at(-1)?.owner, player.id);
});
test("基础库所有缩略图与原图可用；法术条目有独立字段", () => {
  assert.equal(new Set(BASE_ART.map((a) => a.id)).size, BASE_ART.length);
  for (const a of BASE_ART) {
    assert.ok(existsSync("public/" + a.path), a.path);
    assert.ok(existsSync("public/" + a.thumbnail), a.thumbnail);
  }
  assert.equal(spells.length, 45);
  assert.ok(spells.every((s) => s.target && s.duration && s.text.length > 30));
  const c = newCharacter("x", "p");
  c.abilities = [spells[0]];
  assert.equal(character(c).abilities[0].target, spells[0].target);
});
test("下一轮仅 GM 可操作，未结束的行动不得被跳过", () => {
  const w = newWorld("test", "test", gm);
  w.members.push(player);
  w.battle.active = true;
  assert.throws(() => apply(w, player, { type: "battle.nextRound" }));
  apply(w, gm, { type: "battle.nextRound" });
  assert.equal(w.battle.round, 2);
  w.battle.current = "acting";
  assert.throws(() => apply(w, gm, { type: "battle.nextRound" }), /结束/);
});
test("人数增长使用两排，小屏分页保留可读宽度", () => {
  const large = formation(1100, 650, 16, true);
  assert.equal(large.rows, 2);
  assert.ok(large.capacity >= 16);
  const small = formation(620, 450, 16, true);
  assert.equal(small.rows, 2);
  assert.ok(small.capacity < 16);
  assert.ok(small.capacity >= 4);
});
