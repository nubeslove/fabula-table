import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store";
import { Accounts } from "../server/accounts";
import { apply, project } from "../server/world";
import {
  newWorld,
  newCharacter,
  newScene,
  derived,
  CLASSES,
} from "../src/shared/rules";
import { logChannel } from "../src/shared/logs";
import type { Identity } from "../src/shared/types";

test("统一账号：旧身份只能凭原口令认领；世界角色 ID 保留，重启/换设备仍可返回", async () => {
  const root = await mkdtemp(join(tmpdir(), "fu-accounts-")),
    store = new Store(root),
    accounts = new Accounts(root);
  await store.init();
  await accounts.init();
  const legacy = await store.create("旧世界", "旧 GM", "legacy-password");
  const before = await readFile(
    join(root, "rooms", legacy.room.world.id + ".json"),
    "utf8",
  );
  const account = await accounts.register("新统一账号", "account-password");
  await assert.rejects(
    store.claim(legacy.room.world.id, account, "旧 GM", "wrong"),
    /口令/,
  );
  assert.equal(
    await readFile(join(root, "rooms", legacy.room.world.id + ".json"), "utf8"),
    before,
  );
  const me = await store.claim(
    legacy.room.world.id,
    account,
    "旧 GM",
    "legacy-password",
  );
  assert.equal(me.id, legacy.me.id);
  assert.equal(me.role, "gm");
  const other = await accounts.register("另一个人", "password-2");
  await assert.rejects(
    store.claim(legacy.room.world.id, other, "旧 GM", "legacy-password"),
    /绑定/,
  );
  const restart = new Store(root),
    restartAccounts = new Accounts(root);
  await restart.init();
  await restartAccounts.init();
  assert.equal(
    (
      await restart.enter(
        legacy.room.world.id,
        restartAccounts.login(account.name, "account-password"),
        "",
      )
    ).id,
    me.id,
  );
  const listing = await restart.list(account.id);
  assert.equal(listing[0].role, "gm");
  assert.equal(listing[0].locked, false);
  assert.ok(!JSON.stringify(listing).includes("hash"));
  assert.ok(!JSON.stringify(listing).includes("gmNotes"));
});
test("世界密码仅供加入，留空开放；旧邀请码不再绕过密码，新成员始终是玩家", async () => {
  const root = await mkdtemp(join(tmpdir(), "fu-rooms-")),
    store = new Store(root),
    accounts = new Accounts(root);
  await store.init();
  await accounts.init();
  const gm = await accounts.register("GM", "gm-password"),
    player = await accounts.register("player", "player-password");
  const locked = await store.createForAccount("锁定", gm, "secret", ["high"]);
  await assert.rejects(
    store.enter(locked.room.world.id, player, ""),
    /世界密码/,
  );
  await assert.rejects(
    store.login(
      locked.room.world.id,
      "other",
      "new-password",
      locked.room.invite,
    ),
    /大厅/,
  );
  const member = await store.enter(locked.room.world.id, player, "secret");
  assert.equal(member.role, "player");
  assert.equal(
    (await store.enter(locked.room.world.id, player, "")).id,
    member.id,
  );
  const open = await store.createForAccount("开放", gm, "", []);
  assert.equal(
    (await store.enter(open.room.world.id, player, "")).role,
    "player",
  );
});
test("误点加入后仍可凭原口令接续 GM；已有新人物时不自动合并身份", async () => {
  const root = await mkdtemp(join(tmpdir(), "fu-claim-recovery-"));
  const store = new Store(root),
    accounts = new Accounts(root);
  await store.init();
  await accounts.init();
  const old = await store.create("旧世界", "旧 GM", "legacy-password");
  const account = await accounts.register("新账号", "account-password");
  const accidental = await store.enter(old.room.world.id, account, "");
  await assert.rejects(
    store.claim(old.room.world.id, account, "旧 GM", "wrong"),
    /口令/,
  );
  assert.equal(
    (await store.enter(old.room.world.id, account, "")).id,
    accidental.id,
  );
  const claimed = await store.claim(
    old.room.world.id,
    account,
    "旧 GM",
    "legacy-password",
  );
  assert.equal(claimed.id, old.me.id);
  assert.equal(claimed.role, "gm");
  assert.equal((await store.get(old.room.world.id)).users.length, 1);
  const another = await store.create(
    "另一个旧世界",
    "旧 GM",
    "legacy-password",
  );
  const joined = await store.enter(another.room.world.id, account, "");
  await store.change(another.room.world.id, (r) =>
    r.world.characters.push(newCharacter("existing-new-character", joined.id)),
  );
  await assert.rejects(
    store.claim(another.room.world.id, account, "旧 GM", "legacy-password"),
    /已有人物或日志/,
  );
  assert.equal(
    (await store.get(another.room.world.id)).world.characters[0].owner,
    joined.id,
  );
});
const gm: Identity = { id: "gm", name: "GM", role: "gm" },
  player: Identity = { id: "p", name: "玩家", role: "player" };
test("扩展职业由世界开关控制，关闭不丢已有选择；可选免费增益只计一次", () => {
  const w = newWorld("w", "w", gm);
  w.members.push(player);
  const c = newCharacter("c", player.id);
  c.equipment = [];
  c.classes = [
    { id: "exp-dancer", level: 3, skills: { "exp-dancer-1": 3 }, boost: "mp" },
    { id: "exp-symbolist", level: 2, skills: { "exp-symbolist-1": 2 } },
  ];
  assert.throws(
    () =>
      apply(w, player, { type: "character.save", value: c, expected: null }),
    /扩展/,
  );
  w.expansions = ["high"];
  apply(w, player, { type: "character.save", value: c, expected: null });
  assert.equal(derived(c).mp, 5 + c.attrs.wlp * 5 + 5);
  assert.equal(derived(c).ip, 8);
  assert.equal(derived(c).hp, 5 + c.attrs.mig * 5);
  w.expansions = [];
  apply(w, player, {
    type: "character.save",
    value: w.characters[0],
    expected: 0,
  });
  assert.equal(w.characters[0].classes.length, 2);
  assert.equal(CLASSES.filter((c) => c.expansion).length, 13);
  for (const cls of CLASSES.filter((c) => c.expansion)) {
    assert.equal(cls.skills.length, 5);
    assert.ok(cls.skills.every((s) => s.description.trim() && s.max >= 1));
  }
});
test("五类记录按身份和用途分类，角色发言不能冒用其他玩家或私密 NPC", () => {
  const w = newWorld("w", "w", gm);
  w.members.push(player);
  const c = newCharacter("c", player.id);
  apply(w, player, { type: "character.save", value: c, expected: null });
  apply(w, player, {
    type: "chat",
    channel: "ic",
    actor: c.id,
    text: "角色对白",
  });
  assert.equal(logChannel(w.logs.at(-1)!), "ic");
  assert.equal(w.logs.at(-1)!.name, c.name);
  apply(w, player, {
    type: "chat",
    channel: "ooc",
    actor: c.id,
    text: "玩家讨论",
  });
  assert.equal(logChannel(w.logs.at(-1)!), "ooc");
  assert.equal(w.logs.at(-1)!.name, player.name);
  const npc = newCharacter("npc", gm.id);
  npc.public = false;
  apply(w, gm, { type: "character.save", value: npc, expected: null });
  assert.throws(
    () =>
      apply(w, player, {
        type: "chat",
        channel: "ic",
        actor: npc.id,
        text: "冒用",
      }),
    /不能操作/,
  );
  assert.throws(
    () =>
      apply(w, gm, {
        type: "chat",
        channel: "ic",
        actor: npc.id,
        text: "泄露",
      }),
    /私密/,
  );
  apply(w, gm, {
    type: "resource",
    id: c.id,
    resource: "hp",
    delta: -2,
    reason: "伤害",
  });
  assert.equal(logChannel(w.logs.at(-1)!), "combat");
  assert.equal(w.speech, null);
});
test("冲突命刻跟随指定场景，私密场景不泄露，刻度只能 GM 手动改变", () => {
  const w = newWorld("w", "w", gm),
    s = newScene("battle");
  s.mode = "battle";
  s.public = false;
  w.scenes.push(s);
  apply(w, gm, {
    type: "clock.save",
    value: {
      id: "clock",
      name: "破阵",
      segments: 6,
      value: 2,
      public: true,
      description: "",
      scene: s.id,
      placement: "lower",
    },
  });
  assert.equal(project(w, player).clocks.length, 0);
  assert.throws(
    () => apply(w, player, { type: "clock.tick", id: "clock", delta: 1 }),
    /GM/,
  );
  apply(w, gm, { type: "clock.tick", id: "clock", delta: 1 });
  assert.equal(w.clocks[0].value, 3);
  assert.equal(project(w, player).logs.length, 0);
  s.public = true;
  w.activeScene = s.id;
  assert.equal(project(w, player).clocks[0].placement, "lower");
});
