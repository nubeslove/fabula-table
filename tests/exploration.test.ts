import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, project } from "../server/world";
import { Store } from "../server/store";
import { newCharacter, newScene, newWorld } from "../src/shared/rules";
import {
  cellAt,
  cellCenter,
  cellPath,
  explorationTurn,
  moveCost,
  remainingMoves,
  sceneGrid,
} from "../src/shared/exploration";
import type { Identity, Scene, World } from "../src/shared/types";

const gm: Identity = { id: "gm", name: "GM", role: "gm" };
const a: Identity = { id: "player-a", name: "A", role: "player" };
const b: Identity = { id: "player-b", name: "B", role: "player" };
function fixture() {
  const world = newWorld("explore", "探索", gm);
  world.members.push(a, b);
  for (const [id, owner] of [
    ["a", a.id],
    ["b", b.id],
  ]) {
    const c = newCharacter(id, owner);
    c.name = id;
    apply(world, gm, { type: "character.save", value: c, expected: null });
  }
  const scene = newScene("map");
  scene.mode = "map";
  scene.grid = { columns: 12, rows: 8, movePerRound: 4, diagonal: true };
  scene.tokens = [
    {
      id: "ta",
      actor: "a",
      ...cellCenter({ column: 1, row: 1 }, scene.grid),
      hidden: false,
    },
    {
      id: "tb",
      actor: "b",
      ...cellCenter({ column: 1, row: 3 }, scene.grid),
      hidden: false,
    },
    {
      id: "ta-copy",
      actor: "a",
      ...cellCenter({ column: 2, row: 1 }, scene.grid),
      hidden: false,
    },
    { id: "hidden", actor: "b", x: 90, y: 90, hidden: true },
  ];
  apply(world, gm, { type: "scene.save", value: scene, expected: null });
  apply(world, gm, { type: "scene.open", id: scene.id });
  return world;
}
const map = (w: World): Scene => w.scenes.find((s) => s.id === "map")!;
function turn(
  w: World,
  who: Identity,
  type: "exploration.start" | "exploration.endTurn" | "exploration.stop",
) {
  apply(w, who, {
    type,
    scene: "map",
    expected: map(w).revision,
    order: ["a", "b"],
  });
}
function move(
  w: World,
  who: Identity,
  token: string,
  column: number,
  row: number,
  extra = {},
) {
  const s = map(w);
  apply(w, who, {
    type: "token.move",
    scene: s.id,
    token,
    ...cellCenter({ column, row }, sceneGrid(s)),
    expected: s.revision,
    ...extra,
  });
}

test("方格坐标兼容旧百分比、方形边界和双向转换；路线格数与规则一致", () => {
  const grid = sceneGrid(newScene("legacy"));
  assert.deepEqual(cellAt({ x: 100, y: 100 }, grid), { column: 23, row: 13 });
  assert.deepEqual(cellAt({ x: 0, y: 0 }, grid), { column: 0, row: 0 });
  for (let row = 0; row < grid.rows; row++)
    for (let column = 0; column < grid.columns; column++) {
      assert.deepEqual(cellAt(cellCenter({ column, row }, grid), grid), {
        column,
        row,
      });
    }
  const from = { column: 1, row: 1 },
    to = { column: 4, row: 3 };
  assert.equal(moveCost(from, to, true), 3);
  assert.equal(moveCost(from, to, false), 5);
  for (const diagonal of [true, false])
    assert.equal(
      cellPath(from, to, diagonal).length - 1,
      moveCost(from, to, diagonal),
    );
});

test("探索必须由 GM 开始，玩家限当前角色；旧 token.move 不能绕过额度", () => {
  const w = fixture();
  assert.throws(() => move(w, a, "ta", 2, 1), /等待 GM/);
  assert.throws(() => turn(w, a, "exploration.start"), /GM/);
  turn(w, gm, "exploration.start");
  assert.throws(() => move(w, b, "ta", 2, 1), /不能操作/);
  assert.throws(() => move(w, b, "tb", 2, 3), /没有轮到/);
  assert.throws(
    () => move(w, a, "ta", 2, 1, { expected: undefined }),
    /已更新/,
  );
  assert.throws(() => move(w, a, "ta", 2, 1, { adjust: true }), /GM/);
  assert.throws(() => move(w, b, "hidden", 2, 1), /未开放/);
  move(w, a, "ta", 4, 3);
  assert.equal(remainingMoves(map(w), "a"), 1);
  assert.throws(() => move(w, a, "ta", 6, 3), /不足/);
  assert.equal(remainingMoves(map(w), "a"), 1);
  move(w, a, "ta-copy", 3, 1);
  assert.equal(remainingMoves(map(w), "a"), 0);
  assert.equal(explorationTurn(map(w)).current, "a", "用尽不自动结束回合");
  assert.throws(() => move(w, a, "ta", 5, 3), /不足/);
});

test("结束回合需持有人或 GM；全员结束才补满；重复请求不连跳", () => {
  const w = fixture();
  turn(w, gm, "exploration.start");
  move(w, a, "ta", 4, 3);
  assert.throws(() => turn(w, b, "exploration.endTurn"), /自己的/);
  const expected = map(w).revision;
  turn(w, a, "exploration.endTurn");
  assert.equal(explorationTurn(map(w)).current, "b");
  assert.equal(explorationTurn(map(w)).round, 1);
  assert.equal(remainingMoves(map(w), "a"), 1);
  assert.throws(
    () => apply(w, gm, { type: "exploration.endTurn", scene: "map", expected }),
    /已更新/,
  );
  move(w, b, "tb", 4, 3);
  turn(w, b, "exploration.endTurn");
  assert.equal(explorationTurn(map(w)).current, "a");
  assert.equal(explorationTurn(map(w)).round, 2);
  assert.deepEqual(explorationTurn(map(w)).spent, {});
  assert.equal(remainingMoves(map(w), "a"), 4);
});

test("GM 明确调位不消耗或补充额度；普通代走仍按回合；横竖计数", () => {
  const w = fixture();
  map(w).grid!.diagonal = false;
  move(w, gm, "ta", 1, 1);
  turn(w, gm, "exploration.start");
  assert.throws(() => move(w, a, "ta", 4, 3), /不足/);
  move(w, a, "ta", 3, 3);
  assert.equal(remainingMoves(map(w), "a"), 0);
  move(w, gm, "ta", 9, 6, { adjust: true });
  assert.equal(remainingMoves(map(w), "a"), 0);
  move(w, gm, "tb", 8, 6, { adjust: true });
  assert.equal(explorationTurn(map(w)).current, "a");
  assert.throws(() => move(w, gm, "tb", 9, 6), /没有轮到/);
});

test("场景编辑不回写探索状态；进行中结构更改需要结束；旧场景自动落格", () => {
  const w = fixture();
  turn(w, gm, "exploration.start");
  move(w, a, "ta", 4, 3);
  const s = structuredClone(map(w));
  s.notes = "记录线索";
  s.exploration = {
    active: false,
    round: 99,
    current: "b",
    order: ["b"],
    spent: {},
  };
  apply(w, gm, { type: "scene.save", value: s, expected: s.revision });
  assert.equal(explorationTurn(map(w)).active, true);
  assert.equal(remainingMoves(map(w), "a"), 1);
  for (const change of [
    (x: Scene) => {
      x.grid!.movePerRound = 20;
    },
    (x: Scene) => {
      x.tokens.pop();
    },
    (x: Scene) => {
      x.mode = "stage";
    },
  ]) {
    const edited = structuredClone(map(w));
    change(edited);
    assert.throws(
      () =>
        apply(w, gm, {
          type: "scene.save",
          value: edited,
          expected: edited.revision,
        }),
      /先结束/,
    );
  }
  const hiddenActor = structuredClone(w.characters.find((c) => c.id === "a")!);
  hiddenActor.public = false;
  assert.throws(
    () =>
      apply(w, gm, {
        type: "character.save",
        value: hiddenActor,
        expected: hiddenActor.revision,
      }),
    /先结束/,
  );
  turn(w, gm, "exploration.stop");
  const legacy = newScene("legacy");
  legacy.mode = "map";
  legacy.tokens = [
    { id: "old-token", actor: "a", x: 17.31, y: 92.45, hidden: false },
  ];
  apply(w, gm, { type: "scene.save", value: legacy, expected: null });
  const saved = w.scenes.find((s) => s.id === "legacy")!;
  assert.deepEqual(saved.tokens[0], {
    ...legacy.tokens[0],
    ...cellCenter(cellAt(legacy.tokens[0], sceneGrid(saved)), sceneGrid(saved)),
  });
});

test("场景独立保存额度，未打开场景不能移动；冲突优先；隐藏资料不下发", () => {
  const w = fixture();
  turn(w, gm, "exploration.start");
  move(w, a, "ta", 3, 1);
  const second = newScene("second");
  second.mode = "map";
  second.grid = { columns: 8, rows: 8, movePerRound: 2, diagonal: true };
  second.tokens = [{ id: "second-a", actor: "a", x: 10, y: 10, hidden: false }];
  apply(w, gm, { type: "scene.save", value: second, expected: null });
  apply(w, gm, { type: "scene.open", id: "second" });
  assert.throws(() => move(w, a, "ta", 4, 1), /未开放/);
  assert.throws(() => move(w, gm, "ta", 4, 1, { adjust: true }), /未开放/);
  apply(w, gm, {
    type: "exploration.start",
    scene: "second",
    order: ["a"],
    expected: w.scenes.find((s) => s.id === "second")!.revision,
  });
  apply(w, gm, { type: "scene.open", id: "map" });
  assert.equal(remainingMoves(map(w), "a"), 2);
  const view = project(w, a);
  assert.equal(view.scenes.length, 1);
  assert.ok(!view.scenes[0].tokens.some((t) => t.id === "hidden"));
  w.battle.active = true;
  assert.throws(() => move(w, a, "ta", 4, 1), /结束冲突/);
  assert.throws(
    () => apply(w, gm, { type: "scene.open", id: "second" }),
    /结束冲突/,
  );
});

test("探索顺序只允许去重公开角色，参数范围由服务器检查", () => {
  const w = fixture(),
    s = map(w);
  for (const order of [[], ["a", "a"], ["not-here"]])
    assert.throws(() =>
      apply(w, gm, {
        type: "exploration.start",
        scene: s.id,
        expected: s.revision,
        order,
      }),
    );
  for (const grid of [
    { columns: 0 },
    { rows: 61 },
    { movePerRound: -1 },
    { columns: 8.5 },
  ]) {
    assert.throws(() =>
      apply(w, gm, {
        type: "scene.save",
        value: { ...s, grid: { ...s.grid, ...grid } },
        expected: s.revision,
      }),
    );
  }
  turn(w, gm, "exploration.start");
  assert.throws(() => move(w, a, "ta", 2, 1, { x: NaN }), /数值/);
  assert.throws(() => move(w, a, "ta", 2, 1, { x: 101 }), /数值/);
});

test("服务器重新读取存档仍保留 Token、回合和剩余格数", async () => {
  const root = await mkdtemp(join(tmpdir(), "fu-exploration-"));
  const store = new Store(root);
  await store.init();
  const { room } = await store.create("test", "GM", "test-password");
  await store.change(room.world.id, (room) => {
    const w = fixture();
    w.id = room.world.id;
    room.world = w;
    turn(w, gm, "exploration.start");
    move(w, a, "ta", 4, 3);
  });
  const restored = await new Store(root).get(room.world.id);
  assert.equal(remainingMoves(map(restored.world), "a"), 1);
  assert.equal(explorationTurn(map(restored.world)).current, "a");
  assert.deepEqual(
    cellAt(map(restored.world).tokens[0], sceneGrid(map(restored.world))),
    { column: 4, row: 3 },
  );
});
