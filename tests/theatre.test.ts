import test from "node:test";
import {
  THEATRE_ACTIONS,
  THEATRE_ACTION_IDS,
  theatreLayout,
  newTheatreAction,
} from "../src/shared/theatre";
import assert from "node:assert/strict";
import { apply, project } from "../server/world";
import { newWorld, newCharacter, newScene } from "../src/shared/rules";
const gm = { id: "gm", name: "GM", role: "gm" as const },
  player = { id: "player", name: "玩家", role: "player" as const };
test("演出新动作只使用服务器时钟判定，重复快照和断线过期动作不重播", () => {
  const action = { id: "fresh", at: 1000, kind: "shock" as const };
  // Client Date.now is intentionally nowhere near the server's epoch.
  assert.ok(Math.abs(Date.now() - action.at) > 5000);
  assert.equal(newTheatreAction("previous", action, 1050), action);
  assert.equal(newTheatreAction("fresh", action, 1100), undefined);
  assert.equal(newTheatreAction("previous", action, 6100), undefined);
  assert.equal(newTheatreAction("previous", undefined, 1100), undefined);
  assert.equal(newTheatreAction("previous", action, undefined), action);
  assert.equal(newTheatreAction(action.id, action, 1050), undefined);
});
test("左右换边到外侧并同步保存，动作白名单配表情、可重播且不改变地图", () => {
  const w = fixture();
  start(w);
  const s = w.scenes[0],
    before = JSON.stringify({
      tokens: s.tokens,
      turn: s.exploration,
      logs: w.logs,
    });
  const dock = {
    type: "theatre.dock",
    scene: s.id,
    actor: "pc",
    side: "right",
  };
  apply(w, player, dock);
  assert.equal(s.cast[0].side, "right");
  assert.deepEqual(s.cast[0].offset, { x: 0, y: 0 });
  assert.throws(() => apply(w, player, { ...dock, actor: "npc" }), /不能操作/);
  assert.throws(() => apply(w, player, { ...dock, side: "center" }));
  const command = {
    type: "theatre.action",
    scene: s.id,
    actor: "pc",
    action: "shock",
  };
  s.cast[0].expression = "custom-face";
  for (const id of THEATRE_ACTION_IDS) {
    apply(w, player, { ...command, action: id });
    assert.equal(s.cast[0].emote, THEATRE_ACTIONS[id].emote);
    assert.equal(s.cast[0].expression, "custom-face");
  }
  const first = s.cast[0].action!.id;
  apply(w, player, { ...command, action: "sleepy" });
  assert.notEqual(s.cast[0].action!.id, first);
  assert.throws(
    () => apply(w, player, { ...command, actor: "npc" }),
    /不能操作/,
  );
  assert.throws(() => apply(w, player, { ...command, action: "script" }));
  assert.deepEqual(
    project(JSON.parse(JSON.stringify(w)), player).scenes[0].cast[0],
    s.cast[0],
  );
  apply(w, player, { ...command, action: "" });
  assert.equal(s.cast[0].action, undefined);
  assert.equal(
    JSON.stringify({ tokens: s.tokens, turn: s.exploration, logs: w.logs }),
    before,
  );
  s.theatre = false;
  assert.throws(() => apply(w, player, dock), /未开启/);
  assert.throws(() => apply(w, player, command), /未开启/);
});
test("六人分列两端留中间空间，单侧多人不出界，换边者占外端", () => {
  const slots = Array.from({ length: 6 }, (_, i) => ({
    actor: String(i),
    position: i,
  }));
  const layout = theatreLayout(slots, 1000, 260);
  assert.ok(layout["4"].left + layout["4"].width < layout["5"].left);
  for (const p of Object.values(layout)) {
    assert.ok(p.left >= 0 && p.left + p.width <= 1000 && p.height <= 260);
  }
  const same = slots.map((s) => ({
    ...s,
    side: "right" as const,
    dockOrder: s.actor === "0" ? 10 : 0,
  }));
  const right = theatreLayout(same, 1000, 260);
  assert.ok(right["0"].left > right["1"].left);
  for (const p of Object.values(right))
    assert.ok(p.left >= 0 && p.left + p.width <= 1000);
});
function fixture() {
  const w = newWorld("theatre", "小剧场", gm);
  const pc = newCharacter("pc", player.id),
    npc = newCharacter("npc", gm.id),
    secret = newCharacter("secret", gm.id);
  secret.public = false;
  npc.kind = "npc";
  w.characters.push(pc, npc, secret);
  w.scenes[0].mode = "map";
  return w;
}
function start(w: ReturnType<typeof fixture>, actors = ["pc", "npc"]) {
  apply(w, gm, {
    type: "theatre.configure",
    scene: w.activeScene,
    expected: w.scenes[0].revision,
    active: true,
    actors,
  });
}
test("选角一次提交，只有 GM 可开演，不接受私密角色、重复角色或过期场景", () => {
  const w = fixture();
  const cmd = {
    type: "theatre.configure",
    scene: w.activeScene,
    expected: 0,
    active: true,
    actors: ["pc"],
  };
  assert.throws(() => apply(w, player, cmd), /GM/);
  assert.throws(() => start(w, ["pc", "secret"]), /公开/);
  assert.equal(w.scenes[0].cast.length, 0);
  assert.throws(() => start(w, ["pc", "pc"]));
  start(w);
  assert.throws(() => apply(w, gm, cmd), /已被更新/);
  assert.throws(
    () => apply(w, gm, { ...cmd, scene: "missing", expected: 1 }),
    /当前场景/,
  );
  assert.equal(w.scenes[0].mode, "map");
  assert.equal(w.scenes[0].theatre, true);
});
test("场内登场人物驱动台词且仅写一次日志，场外和未登场人物不影响画面", () => {
  const w = fixture();
  start(w);
  let n = w.logs.length;
  apply(w, player, {
    type: "chat",
    channel: "ic",
    actor: "pc",
    text: "中文台词\n第二行",
  });
  assert.equal(w.speech?.text, "中文台词\n第二行");
  assert.equal(w.focus, "pc");
  assert.equal(w.logs.length, n + 1);
  const speech = structuredClone(w.speech);
  apply(w, player, { type: "chat", channel: "ooc", text: "场外" });
  assert.deepEqual(w.speech, speech);
  const extra = newCharacter("extra", player.id);
  w.characters.push(extra);
  apply(w, player, {
    type: "chat",
    channel: "ic",
    actor: "extra",
    text: "未登场",
  });
  assert.deepEqual(w.speech, speech);
  assert.throws(
    () =>
      apply(w, player, {
        type: "chat",
        channel: "ic",
        actor: "npc",
        text: "冒充",
      }),
    /不能操作/,
  );
  assert.throws(
    () =>
      apply(w, player, {
        type: "chat",
        channel: "ic",
        actor: "",
        text: "冒充旁白",
      }),
    /GM/,
  );
  apply(w, gm, { type: "chat", channel: "ic", actor: "", text: "旁白" });
  assert.equal(w.speech?.name, "旁白");
  assert.equal(w.logs.at(-1)?.name, "旁白");
});
test("表情镜像检查拥有权，投影恢复演出而不泄露 GM 资料，结束保留演员", () => {
  const w = fixture();
  const pc = w.characters[0];
  pc.expressions = [{ id: "happy", name: "开心", asset: "" }];
  w.characters[1].privateNotes = "秘密";
  w.scenes[0].cues = [
    { id: "cue", actor: "npc", expression: "", text: "未播放秘密" },
  ];
  start(w);
  apply(w, player, {
    type: "stage.expression",
    actor: "pc",
    expression: "happy",
  });
  apply(w, player, { type: "theatre.mirror", actor: "pc", mirrored: true });
  assert.throws(
    () =>
      apply(w, player, {
        type: "theatre.mirror",
        actor: "npc",
        mirrored: true,
      }),
    /不能操作/,
  );
  assert.throws(
    () =>
      apply(w, player, {
        type: "stage.expression",
        actor: "pc",
        expression: "missing",
      }),
    /不存在/,
  );
  apply(w, player, {
    type: "chat",
    channel: "ic",
    actor: "pc",
    text: "晚加入可见",
  });
  const restored = project(JSON.parse(JSON.stringify(w)), player);
  assert.equal(restored.scenes[0].theatre, true);
  assert.equal(restored.scenes[0].cast[0].mirrored, true);
  assert.equal(restored.speech?.text, "晚加入可见");
  assert.equal(restored.scenes[0].cues.length, 0);
  assert.equal(
    restored.characters.find((c) => c.id === "npc")?.privateNotes,
    "",
  );
  assert.equal(
    restored.characters.some((c) => c.id === "secret"),
    false,
  );
  apply(w, gm, {
    type: "theatre.configure",
    scene: w.activeScene,
    expected: w.scenes[0].revision,
    active: false,
    actors: ["pc", "npc"],
  });
  assert.equal(w.speech, null);
  assert.equal(w.scenes[0].cast.length, 2);
  apply(w, player, {
    type: "chat",
    channel: "ic",
    actor: "pc",
    text: "结束后普通聊天",
  });
  assert.equal(w.speech, null);
});
test("旧世界默认为关闭；换场清除台词；编辑场景不能偷偷开启小剧场", () => {
  const w = fixture();
  apply(w, player, {
    type: "chat",
    channel: "ic",
    actor: "pc",
    text: "旧世界普通聊天",
  });
  assert.equal(w.speech, null);
  const value = { ...w.scenes[0], theatre: true };
  apply(w, gm, { type: "scene.save", expected: value.revision, value });
  assert.equal(w.scenes[0].theatre, false);
  w.scenes[0].cues = [
    { id: "cue", actor: "npc", expression: "", text: "预制开场" },
  ];
  start(w);
  apply(w, gm, { type: "cue", index: 0 });
  assert.equal(project(w, gm).speech?.text, "预制开场");
  const next = newScene("next");
  w.scenes.push(next);
  apply(w, gm, { type: "scene.open", id: "next" });
  assert.equal(w.speech, null);
  assert.equal(w.activeScene, "next");
  assert.equal(next.theatre, undefined);
});

test("立绘走位使用增量并保存，受角色权限及活动场景限制，不改变探索移动", () => {
  const w = fixture();
  start(w);
  const s = w.scenes[0];
  s.tokens = [{ id: "t", actor: "pc", x: 30, y: 40, hidden: false }];
  s.exploration = {
    active: true,
    round: 1,
    order: ["pc"],
    current: "pc",
    spent: { pc: 2 },
  };
  const before = structuredClone({ tokens: s.tokens, turn: s.exploration }),
    logs = w.logs.length;
  const move = {
    type: "theatre.move",
    scene: s.id,
    actor: "pc",
    dx: 3,
    dy: -3,
  };
  apply(w, player, move);
  apply(w, player, move);
  assert.deepEqual(s.cast[0].offset, { x: 6, y: -6 });
  assert.deepEqual({ tokens: s.tokens, turn: s.exploration }, before);
  assert.equal(w.logs.length, logs);
  assert.throws(() => apply(w, player, { ...move, actor: "npc" }), /不能操作/);
  assert.throws(() => apply(w, player, { ...move, scene: "other" }), /未开启/);
  assert.throws(() => apply(w, player, { ...move, dx: 100 }));
  for (let i = 0; i < 40; i++) apply(w, player, move);
  assert.deepEqual(s.cast[0].offset, { x: 80, y: -40 });
  assert.deepEqual(
    project(JSON.parse(JSON.stringify(w)), player).scenes[0].cast[0].offset,
    { x: 80, y: -40 },
  );
  apply(w, player, { ...move, dx: 0, dy: 0, reset: true });
  assert.deepEqual(s.cast[0].offset, { x: 0, y: 0 });
  s.theatre = false;
  assert.throws(() => apply(w, player, move), /未开启/);
});
test("通用表情独立于立绘图，可重播和清除；不能指定任意脚本或控制他人", () => {
  const w = fixture();
  start(w);
  const s = w.scenes[0],
    cmd = { type: "theatre.emote", scene: s.id, actor: "pc", emote: "happy" };
  s.cast[0].expression = "custom-face";
  apply(w, player, cmd);
  const first = s.cast[0].emoteId;
  assert.equal(s.cast[0].emote, "happy");
  assert.equal(s.cast[0].expression, "custom-face");
  apply(w, player, cmd);
  assert.notEqual(s.cast[0].emoteId, first);
  assert.throws(() => apply(w, player, { ...cmd, actor: "npc" }), /不能操作/);
  assert.throws(() => apply(w, player, { ...cmd, emote: "<script>" }));
  const restored = project(JSON.parse(JSON.stringify(w)), player);
  assert.equal(restored.scenes[0].cast[0].emote, "happy");
  apply(w, player, { ...cmd, emote: "" });
  assert.equal(s.cast[0].emote, "");
  assert.equal(s.cast[0].expression, "custom-face");
});
