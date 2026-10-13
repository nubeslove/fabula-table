import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomInt } from "node:crypto";
import { newCharacter, newScene } from "../src/shared/rules";
import { cellCenter } from "../src/shared/exploration";
import { Store } from "../server/store";
test("HTTP：独立入口、认证、玩家权限、素材授权、只读预下载和静态压缩", async () => {
  const port = randomInt(35000, 44000),
    root = await mkdtemp(join(tmpdir(), "fu-http-")),
    base = `http://127.0.0.1:${port}/fu`;
  const legacyStore = new Store(root);
  await legacyStore.init();
  const legacy = await legacyStore.create(
    "升级遗留世界",
    "旧 GM",
    "legacy-password",
  );
  const child = spawn(process.execPath, [resolve("dist/server.mjs")], {
    env: {
      ...process.env,
      FU_PORT: String(port),
      FU_HOST: "127.0.0.1",
      FU_BASE_PATH: "/fu",
      FU_DATA_DIR: root,
      FU_PUBLIC_DIR: resolve("dist/public"),
      FU_CREATE_KEY: "test-create-key",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    await new Promise<void>((ok, no) => {
      const timeout = setTimeout(
        () => no(new Error("server startup timeout")),
        10000,
      );
      child.stdout.on("data", (b) => {
        if (b.toString().includes("已启动")) {
          clearTimeout(timeout);
          ok();
        }
      });
      child.once("error", (e) => {
        clearTimeout(timeout);
        no(e);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        no(new Error("server exited " + code));
      });
    });
    const post = async (path: string, value: unknown, cookie = "") =>
      fetch(base + "/api/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FU-Request": "1",
          Cookie: cookie,
        },
        body: JSON.stringify(value),
      });
    assert.equal((await fetch(base + "/api/session")).status, 401);
    const gmAccount = await post("account/register", {
      name: "GM",
      password: "password-one",
    });
    const gmAccountCookie = gmAccount.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (
        await post(
          "worlds",
          { title: "桌", password: "world-secret", creationKey: "wrong" },
          gmAccountCookie,
        )
      ).status,
      403,
    );
    const created = await post(
      "worlds",
      { title: "桌", password: "world-secret", creationKey: "test-create-key" },
      gmAccountCookie,
    );
    assert.equal(created.status, 200);
    const gmCookie =
        gmAccountCookie +
        "; " +
        created.headers.get("set-cookie")!.split(";")[0],
      gm = await created.json();
    assert.ok(created.headers.get("set-cookie")?.includes("HttpOnly"));
    const playerAccount = await post("account/register", {
      name: "玩家",
      password: "password-two",
    });
    const playerAccountCookie = playerAccount.headers
      .get("set-cookie")!
      .split(";")[0];
    assert.equal(
      (
        await post(
          "enter",
          { room: gm.world.id, password: "wrong" },
          playerAccountCookie,
        )
      ).status,
      403,
    );
    const joined = await post(
      "enter",
      { room: gm.world.id, password: "world-secret" },
      playerAccountCookie,
    );
    assert.equal(joined.status, 200);
    const playerCookie =
        playerAccountCookie +
        "; " +
        joined.headers.get("set-cookie")!.split(";")[0],
      player = await joined.json();
    const lobby = await (
      await fetch(base + "/api/lobby", {
        headers: { Cookie: playerAccountCookie },
      })
    ).json();
    assert.equal(lobby.rooms[0].role, "player");
    assert.equal(lobby.rooms[0].locked, true);
    assert.equal(
      (await post("enter", { room: gm.world.id }, playerAccountCookie)).status,
      200,
    );
    assert.equal(
      (
        await fetch(base + "/api/session", {
          headers: { Cookie: playerCookie },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          "settings",
          { password: "", expansions: ["high"] },
          playerCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (await post("settings", { password: "", expansions: ["high"] }, gmCookie))
        .status,
      200,
    );
    assert.equal(player.invite, undefined);
    assert.equal(player.preloadKey, undefined);
    assert.equal(
      (
        await post(
          "command",
          { type: "notes", text: "GM private story" },
          playerCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          "command",
          { type: "notes", text: "GM private story" },
          gmCookie,
        )
      ).status,
      200,
    );
    const c = newCharacter("pc", player.me.id);
    assert.equal(
      (
        await post(
          "command",
          { type: "character.save", value: c, expected: null },
          playerCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          "command",
          { type: "resource", id: "pc", resource: "hp", delta: -5, reason: "" },
          playerCookie,
        )
      ).status,
      403,
    );
    const snapshot = await (
      await fetch(base + "/api/session", { headers: { Cookie: playerCookie } })
    ).json();
    assert.equal(snapshot.world.gmNotes, "");
    assert.equal(snapshot.world.characters[0].hp, 40);
    const exploration = newScene("http-map");
    exploration.mode = "map";
    exploration.grid = {
      columns: 12,
      rows: 8,
      movePerRound: 3,
      diagonal: true,
    };
    exploration.tokens = [
      {
        id: "http-token",
        actor: "pc",
        ...cellCenter({ column: 1, row: 1 }, exploration.grid),
        hidden: false,
      },
    ];
    assert.equal(
      (
        await post(
          "command",
          { type: "scene.save", value: exploration, expected: null },
          gmCookie,
        )
      ).status,
      200,
    );
    const opened = await (
      await post(
        "command",
        { type: "scene.open", id: exploration.id },
        gmCookie,
      )
    ).json();
    const started = await (
      await post(
        "command",
        {
          type: "exploration.start",
          scene: exploration.id,
          order: ["pc"],
          expected: opened.world.scenes.find(
            (s: { id: string }) => s.id === exploration.id,
          ).revision,
        },
        gmCookie,
      )
    ).json();
    const mapRevision = started.world.scenes.find(
      (s: { id: string }) => s.id === exploration.id,
    ).revision;
    const movedResponse = await post(
      "command",
      {
        type: "token.move",
        scene: exploration.id,
        token: "http-token",
        ...cellCenter({ column: 4, row: 2 }, exploration.grid),
        expected: mapRevision,
      },
      playerCookie,
    );
    assert.equal(movedResponse.status, 200);
    const moved = await movedResponse.json();
    assert.equal(moved.world.scenes[0].exploration.spent.pc, 3);
    assert.equal(
      (
        await post(
          "command",
          {
            type: "token.move",
            scene: exploration.id,
            token: "http-token",
            ...cellCenter({ column: 5, row: 2 }, exploration.grid),
            expected: moved.world.scenes[0].revision,
          },
          playerCookie,
        )
      ).status,
      400,
    );
    const nextRound = await (
      await post(
        "command",
        {
          type: "exploration.endTurn",
          scene: exploration.id,
          expected: moved.world.scenes[0].revision,
        },
        playerCookie,
      )
    ).json();
    assert.equal(nextRound.world.scenes[0].exploration.round, 2);
    assert.deepEqual(nextRound.world.scenes[0].exploration.spent, {});
    const upload = async (cookie: string, seed: number) =>
      fetch(base + "/api/upload", {
        method: "POST",
        headers: {
          "X-FU-Request": "1",
          "X-File-Name": "fixture.webp",
          Cookie: cookie,
        },
        body: Buffer.concat([Buffer.from("RIFF0000WEBP"), Buffer.from([seed])]),
      });
    assert.equal((await upload(playerCookie, 1)).status, 403);
    const a = await (await upload(gmCookie, 1)).json(),
      hidden = await (await upload(gmCookie, 2)).json();
    assert.equal(
      (
        await fetch(`${base}/api/assets/${gm.world.id}/${a.asset.id}`, {
          headers: { Cookie: playerCookie },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          "command",
          { type: "asset.preload", id: a.asset.id, value: true },
          gmCookie,
        )
      ).status,
      200,
    );
    const manifest = await (
      await fetch(`${base}/api/preload/${gm.world.id}?key=${gm.preloadKey}`)
    ).json();
    assert.deepEqual(
      manifest.assets.map((a: { id: string }) => a.id),
      [a.asset.id],
    );
    assert.deepEqual(Object.keys(manifest).sort(), [
      "assets",
      "title",
      "world",
    ]);
    assert.ok(!JSON.stringify(manifest).includes("private story"));
    assert.equal(
      (
        await fetch(
          `${base}/api/assets/${gm.world.id}/${a.asset.id}?key=${gm.preloadKey}`,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(
          `${base}/api/assets/${gm.world.id}/${hidden.asset.id}?key=${gm.preloadKey}`,
        )
      ).status,
      401,
    );
    const range = await fetch(
      `${base}/api/assets/${gm.world.id}/${a.asset.id}?key=${gm.preloadKey}`,
      { headers: { Range: "bytes=0-3" } },
    );
    assert.equal(range.status, 206);
    assert.equal(await range.text(), "RIFF");
    assert.equal((await post("preload-key", {}, gmCookie)).status, 200);
    assert.equal(
      (await fetch(`${base}/api/preload/${gm.world.id}?key=${gm.preloadKey}`))
        .status,
      403,
    );
    const page = await fetch(base + "/");
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes("最终物语"));
    assert.ok(
      page.headers
        .get("content-security-policy")
        ?.includes("frame-ancestors 'none'"),
    );
    const official = await (
      await fetch(base + "/official/manifest.json")
    ).json();
    const book = await fetch(
      base +
        "/" +
        official.documents.find((d: { id: string }) => d.id === "core").file,
      { headers: { "Accept-Encoding": "gzip" } },
    );
    assert.equal(book.status, 200);
    assert.equal(book.headers.get("content-encoding"), "gzip");
    assert.equal((await book.json()).pages.length, 362);
    assert.equal(
      (
        await fetch(base + "/api/command", {
          method: "POST",
          headers: { Cookie: gmCookie, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "notes", text: "bad" }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/command", {
          method: "POST",
          headers: {
            Cookie: gmCookie,
            "Content-Type": "application/json",
            "X-FU-Request": "1",
            Origin: "https://evil.invalid",
          },
          body: JSON.stringify({ type: "notes", text: "bad" }),
        })
      ).status,
      403,
    );
    const accidental = await post(
      "enter",
      { room: legacy.room.world.id },
      gmAccountCookie,
    );
    const accidentalCookie =
      gmAccountCookie +
      "; " +
      accidental.headers.get("set-cookie")!.split(";")[0];
    const deniedClaim = await post(
      "claim",
      { room: legacy.room.world.id, name: "旧 GM", password: "wrong" },
      accidentalCookie,
    );
    assert.equal(
      deniedClaim.status,
      401,
      "A newly linked player session is not proof of the old GM identity",
    );
    const claimed = await post(
      "claim",
      {
        room: legacy.room.world.id,
        name: "旧 GM",
        password: "legacy-password",
      },
      accidentalCookie,
    );
    assert.equal(claimed.status, 200);
    const recovered = await claimed.json();
    assert.equal(recovered.me.id, legacy.me.id);
    assert.equal(recovered.me.role, "gm");
  } finally {
    child.kill();
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", () => resolve());
    });
  }
});
