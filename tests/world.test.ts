import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, project, referencedAssets } from "../server/world";
import {Accounts} from "../server/accounts";
import { Store } from "../server/store";
import {
  newWorld,
  newCharacter,
  newScene,
  derived,
  currentAttributes,
  characterProblems,
} from "../src/shared/rules";
import type { Identity, World } from "../src/shared/types";
const gm: Identity = { id: "gm", name: "导演", role: "gm" },
  player: Identity = { id: "player", name: "旅人", role: "player" },
  other: Identity = { id: "other", name: "路人", role: "player" };
function fixture() {
  const w = newWorld("room", "测试世界", gm);
  w.members.push(player, other);
  const pc = newCharacter("pc", player.id);
  pc.name = "测试旅人";
  apply(w, player, { type: "character.save", value: pc, expected: null });
  return w;
}
test("普通玩家可以用用户身份掷单骰与双骰，但不能冒用其他角色", () => {
  const w = fixture();
  for (const sides of [[20], [6, 12]]) {
    apply(w, other, { type: "roll", actor: "", sides, modifier: 2, label: "调查" });
    const log = w.logs.at(-1)!;
    assert.equal(log.name, other.name);
    assert.equal(log.actor, "");
    assert.equal(log.channel, "dice");
    assert.deepEqual(log.roll?.sides, sides);
    assert.equal(log.roll?.values.length, sides.length);
    assert.ok(log.roll!.values.every((value, i) => value >= 1 && value <= sides[i]));
  }
  assert.throws(() => apply(w, other, { type: "roll", actor: "pc", sides: [8], modifier: 0, label: "" }), /不能操作/);
  assert.throws(() => apply(w, other, { type: "roll", actor: "", sides: [], modifier: 0, label: "" }), /请选择骰子/);
});
test("场景分类保存且只对 GM 可见；旧场景无需迁移", () => {
  const w = fixture(),
    s = newScene("chapter_one");
  s.folder = "  第一章 · 秘密  ";
  apply(w, gm, { type: "scene.save", value: s, expected: null });
  assert.equal(w.scenes.find((x) => x.id === s.id)?.folder, "第一章 · 秘密");
  apply(w, gm, { type: "scene.open", id: s.id });
  assert.equal(project(w, player).scenes[0].folder, "");
  const legacy = structuredClone(w.scenes[0]);
  delete legacy.folder;
  apply(w, gm, {
    type: "scene.save",
    value: legacy,
    expected: legacy.revision,
  });
  assert.equal(w.scenes.find((x) => x.id === legacy.id)?.folder, "");
});
test("建卡标准、装备防御与状态按已核对规则计算", () => {
  const c = newCharacter("a", "player"),
    d = derived(c);
  assert.deepEqual(characterProblems(c, true), []);
  assert.equal(d.level, 5);
  assert.equal(d.hp, 40);
  assert.equal(d.mp, 50);
  assert.equal(d.ip, 6);
  assert.equal(d.def, 11);
  assert.equal(d.mdef, 13);
  c.attrs.ins = 12;
  c.statuses = ["眩晕", "愤怒"];
  assert.equal(currentAttributes(c).ins, 8);
  assert.equal(currentAttributes(c).dex, 6);
  c.overrides.hp = 123;
  assert.equal(derived(c).hp, 123);
});
test("声明和掷骰不扣资源、不推回合；扣 HP 仅允许 GM", () => {
  const w = fixture(),
    before = structuredClone(w.characters[0]);
  apply(w, player, { type: "declare", actor: "pc", ability: "weaponmaster-1" });
  apply(w, player, {
    type: "roll",
    actor: "pc",
    sides: [8, 10],
    modifier: 1,
    label: "检定",
  });
  assert.equal(w.characters[0].hp, before.hp);
  assert.equal(w.characters[0].mp, before.mp);
  assert.equal(w.battle.round, 1);
  assert.throws(
    () =>
      apply(w, player, {
        type: "resource",
        id: "pc",
        resource: "hp",
        delta: -5,
        reason: "伤害",
      }),
    /GM/,
  );
  apply(w, gm, {
    type: "resource",
    id: "pc",
    resource: "hp",
    delta: -5,
    reason: "伤害",
  });
  assert.equal(w.characters[0].hp, before.hp - 5);
  const log = w.logs.at(-2)!;
  assert.equal(log.roll?.values.length, 2);
  assert.ok(
    log.roll!.values.every((n, i) => n >= 1 && n <= log.roll!.sides[i]),
  );
});
test("玩家不能通过编辑人物卡恢复 HP、转移控制、获取 GM 备注", () => {
  const w = fixture();
  w.characters[0].privateNotes = "隐藏设定";
  w.characters[0].hp = 7;
  const c = structuredClone(w.characters[0]);
  c.hp = 999;
  c.owner = "other";
  c.kind = "npc";
  c.privateNotes = "篡改";
  apply(w, player, { type: "character.save", value: c, expected: c.revision });
  assert.equal(w.characters[0].hp, 7);
  assert.equal(w.characters[0].owner, "player");
  assert.equal(w.characters[0].kind, "pc");
  assert.equal(w.characters[0].privateNotes, "隐藏设定");
  assert.equal(project(w, player).characters[0].privateNotes, "");
  assert.throws(
    () =>
      apply(w, other, {
        type: "character.save",
        value: w.characters[0],
        expected: w.characters[0].revision,
      }),
    /不能操作/,
  );
});
test("旧版本编辑拒绝覆盖；私设保留而且不自动回满资源", () => {
  const w = fixture(),
    c = structuredClone(w.characters[0]);
  apply(w, gm, {
    type: "resource",
    id: "pc",
    resource: "hp",
    delta: -3,
    reason: "",
  });
  assert.throws(
    () =>
      apply(w, player, {
        type: "character.save",
        value: c,
        expected: c.revision,
      }),
    /已被更新/,
  );
  const next = structuredClone(w.characters[0]);
  next.custom = true;
  next.overrides.hp = 150;
  apply(w, player, {
    type: "character.save",
    value: next,
    expected: next.revision,
  });
  assert.equal(derived(w.characters[0]).hp, 150);
  assert.equal(w.characters[0].hp, 37);
});
test("玩家看不到未开放场景、预制台词、私密 NPC、命刻和素材", () => {
  const w = fixture(),
    hidden = newCharacter("hidden", "");
  hidden.public = false;
  hidden.kind = "npc";
  hidden.custom = true;
  hidden.portrait = "secret";
  w.characters.push(hidden);
  w.assets.push(
    {
      id: "secret",
      hash: "a",
      name: "秘密.webp",
      mime: "image/webp",
      size: 1,
      preload: false,
    },
    {
      id: "public",
      hash: "b",
      name: "公开.webp",
      mime: "image/webp",
      size: 1,
      preload: true,
    },
  );
  const s = newScene("future");
  s.background = "secret";
  s.cues = [
    { id: "cue", actor: "hidden", expression: "", text: "未公开的剧情" },
  ];
  s.notes = "未来场景";
  w.scenes.push(s);
  w.scenes[0].cues = [
    { id: "c", actor: "pc", expression: "", text: "尚未念出的台词" },
  ];
  w.gmNotes = "世界秘密";
  w.clocks.push({
    id: "clock",
    name: "秘密命刻",
    segments: 6,
    value: 0,
    public: false,
    description: "",
  });
  const view = project(w, player);
  assert.equal(view.scenes.length, 1);
  assert.deepEqual(view.scenes[0].cues, []);
  assert.equal(view.gmNotes, "");
  assert.equal(view.characters.length, 1);
  assert.equal(view.clocks.length, 0);
  assert.deepEqual(
    view.assets.map((a) => a.id),
    ["public"],
  );
  assert.equal(referencedAssets(w, player).has("secret"), false);
  assert.ok(!JSON.stringify(view).includes("秘密"));
});
test("Token 移动仅允许玩家本人的已显示标记", () => {
  const w = fixture();
  w.scenes[0].tokens = [
    { id: "token", actor: "pc", x: 10, y: 20, hidden: false },
  ];
  apply(w, player, {
    type: "token.move",
    scene: "opening",
    token: "token",
    x: 50,
    y: 60,
  });
  assert.equal(w.scenes[0].tokens[0].x, 50);
  assert.throws(
    () =>
      apply(w, other, {
        type: "token.move",
        scene: "opening",
        token: "token",
        x: 20,
        y: 30,
      }),
    /不能操作/,
  );
  w.scenes[0].tokens[0].hidden = true;
  assert.throws(
    () =>
      apply(w, player, {
        type: "token.move",
        scene: "opening",
        token: "token",
        x: 20,
        y: 30,
      }),
    /未开放/,
  );
  assert.throws(
    () =>
      apply(w, gm, {
        type: "token.move",
        scene: "opening",
        token: "token",
        x: NaN,
        y: 30,
      }),
    /数值/,
  );
});
test("舞台台本由 GM 播放后才成为公开台词", () => {
  const w = fixture();
  apply(w, gm, { type: "stage.cast", actor: "pc", present: true });
  w.scenes[0].cues = [
    { id: "cue", actor: "pc", expression: "", text: "我们一起走吧" },
  ];
  assert.throws(() => apply(w, player, { type: "cue", index: 0 }), /GM/);
  apply(w, gm, { type: "cue", index: 0 });
  assert.equal(project(w, player).speech?.text, "我们一起走吧");
  assert.equal(w.focus, "pc");
  assert.deepEqual(project(w, player).scenes[0].cues, []);
});
test("六人轮换和台本表情同步；默认立绘不会沿用上一句的表情", () => {
  const w = fixture();
  for (let i = 0; i < 6; i++) {
    const c = newCharacter(`cast${i}`, "");
    c.kind = "npc";
    c.custom = true;
    c.expressions = [{ id: "smile", name: "微笑", asset: `image${i}` }];
    w.characters.push(c);
    w.assets.push({
      id: `image${i}`,
      hash: String(i),
      name: "表情",
      size: 10,
      mime: "image/webp",
      preload: false,
    });
    apply(w, gm, { type: "stage.cast", actor: c.id, present: true });
  }
  assert.equal(project(w, player).scenes[0].cast.length, 6);
  assert.throws(
    () => apply(w, gm, { type: "stage.cast", actor: "pc", present: true }),
    /6 人/,
  );
  for (let i = 0; i < 6; i++) {
    apply(w, gm, { type: "stage.focus", actor: `cast${i}` });
    assert.equal(project(w, player).focus, `cast${i}`);
  }
  assert.equal(project(w, player).assets.length, 0);
  apply(w, gm, {
    type: "stage.expression",
    actor: "cast5",
    expression: "smile",
  });
  assert.deepEqual(
    project(w, player).assets.map((a) => a.id),
    ["image5"],
  );
  w.scenes[0].cues = [
    { id: "neutral", actor: "cast5", expression: "", text: "回到平静的表情" },
  ];
  apply(w, gm, { type: "cue", index: 0 });
  assert.equal(w.scenes[0].cast[5].expression, "");
  assert.equal(project(w, player).assets.length, 0);
  assert.equal(project(w, player).speech?.text, "回到平静的表情");
  apply(w, gm, { type: "stage.cast", actor: "cast5", present: false });
  assert.equal(w.focus, "");
  assert.equal(w.speech, null);
});
test("冲突只接收勾选的参战者，旁观 NPC 留在舞台且不影响回合", () => {
  const w = fixture();
  for (const id of ["enemy", "bystander"]) {
    const c = newCharacter(id, "");
    c.kind = "npc";
    c.side = "foes";
    c.custom = true;
    w.characters.push(c);
    apply(w, gm, { type: "stage.cast", actor: id, present: true });
  }
  apply(w, gm, {
    type: "battle.start",
    roster: ["pc", "enemy"],
    first: "heroes",
  });
  assert.deepEqual(w.battle.roster, ["pc", "enemy"]);
  assert.ok(w.scenes[0].cast.some((c) => c.actor === "bystander"));
  apply(w, gm, { type: "battle.select", actor: "pc" });
  apply(w, gm, { type: "battle.endTurn" });
  assert.throws(
    () => apply(w, gm, { type: "battle.select", actor: "bystander" }),
    /尚未行动/,
  );
  apply(w, gm, { type: "battle.select", actor: "enemy" });
  apply(w, gm, { type: "battle.endTurn" });
  assert.equal(w.battle.round, 2);
});
test("双方人数不等时交替行动，剩余方完成后进入下一轮", () => {
  const w = fixture();
  for (const id of ["enemy1", "enemy2"]) {
    const c = newCharacter(id, "");
    c.kind = "npc";
    c.side = "foes";
    c.custom = true;
    w.characters.push(c);
  }
  apply(w, gm, {
    type: "battle.start",
    roster: ["pc", "enemy1", "enemy2"],
    first: "heroes",
  });
  apply(w, gm, { type: "battle.select", actor: "pc" });
  apply(w, gm, { type: "battle.endTurn" });
  assert.equal(w.battle.side, "foes");
  apply(w, gm, { type: "battle.select", actor: "enemy1" });
  apply(w, gm, { type: "battle.endTurn" });
  assert.equal(w.battle.side, "foes");
  apply(w, gm, { type: "battle.select", actor: "enemy2" });
  apply(w, gm, { type: "battle.endTurn" });
  assert.equal(w.battle.round, 2);
  assert.equal(w.battle.side, "heroes");
  assert.deepEqual(w.battle.acted, []);
});
test("物语点扣除有下限，命刻填满不自动触发事件", () => {
  const w = fixture();
  apply(w, player, {
    type: "resource",
    id: "pc",
    resource: "fabula",
    delta: -1,
    reason: "塑造故事",
  });
  assert.equal(w.fabulaSpent, 1);
  assert.throws(
    () =>
      apply(w, player, {
        type: "resource",
        id: "pc",
        resource: "fabula",
        delta: -3,
        reason: "",
      }),
    /不足/,
  );
  apply(w, gm, {
    type: "clock.save",
    value: {
      id: "c",
      name: "目标",
      value: 3,
      segments: 4,
      public: true,
      description: "",
    },
  });
  apply(w, gm, { type: "clock.tick", id: "c", delta: 2 });
  assert.equal(w.clocks[0].value, 4);
  assert.equal(w.scenes.length, 1);
});
test("登录、顺序持久化、重启恢复；失败操作不写入", async () => {
  const root = await mkdtemp(join(tmpdir(), "fu-store-test-"));
  const store = new Store(root);
  await store.init();
  const { room, me } = await store.create("测试", "GM", "test-password");
  const accounts=new Accounts(root);await accounts.init();
  const account=await accounts.register("玩家","player-password");
  const p=await store.enter(room.world.id,account,"");
  assert.equal(p.role,"player");
  assert.equal((await store.enter(room.world.id,account,"")).id,p.id);
  await assert.rejects(
    store.login(room.world.id, "GM", "wrong-password", room.invite),
    /口令/,
  );
  await Promise.all(
    Array.from({ length: 8 }, () =>
      store.change(room.world.id, (r) => {
        r.world.fabulaSpent++;
      }),
    ),
  );
  await assert.rejects(
    store.change(room.world.id, (r) => {
      r.world.title = "错误修改";
      throw new Error("cancel");
    }),
  );
  const restarted = new Store(root);
  await restarted.init();
  const saved = await restarted.get(room.world.id);
  assert.equal(saved.world.title, "测试");
  assert.equal(saved.world.fabulaSpent, 8);
  assert.equal(saved.users[0].id, me.id);
  assert.ok(!JSON.stringify(saved).includes("test-password"));
});
