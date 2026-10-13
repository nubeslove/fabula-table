import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { adminRoutes } from "../server/admin";
import {
  newerVersion,
  getProgramRelease,
  downloadProgram,
} from "../server/update-release";
import { programPath, verifyProgram } from "../server/updater";

const release = (version = "0.2.4") => ({
  tag_name: "v" + version,
  body: "fixture",
  draft: false,
  prerelease: false,
  assets: [
    {
      name: `fabula-table-${version}.zip`,
      browser_download_url: `https://github.com/fixture/table/releases/download/v${version}/fabula-table-${version}.zip`,
      digest: "sha256:" + "a".repeat(64),
      size: 4,
    },
  ],
});
test("更新源限制正式版本，拒绝降级、地址替换和下载校验错误", async (t) => {
  assert.ok(newerVersion("0.2.10", "0.2.9"));
  assert.equal(newerVersion("0.2.3", "0.2.3"), false);
  assert.equal(newerVersion("0.2.2", "0.2.3"), false);
  assert.equal(newerVersion("0.2.4-beta", "0.2.3"), false);
  let value = release();
  t.mock.method(globalThis, "fetch", async () => Response.json(value));
  const info = await getProgramRelease("fixture/table");
  assert.equal(info?.version, "0.2.4");
  value.assets[0].browser_download_url =
    "https://elsewhere.example/executable.zip";
  await assert.rejects(getProgramRelease("fixture/table"), /地址/);
  value = { ...release(), prerelease: true };
  await assert.rejects(getProgramRelease("fixture/table"), /正式/);
  t.mock.method(globalThis, "fetch", async () => new Response("fail"));
  await assert.rejects(downloadProgram(info!), /校验失败/);
});

test("更新清单拒绝世界路径、目录跳转、被改动的程序和不兼容协议", async () => {
  for (const path of [
    "data/rooms/a.json",
    "app/../data/server-key",
    "app//server.mjs",
    "app/public/x:secret",
    "C:/app/server.mjs",
  ])
    assert.throws(() => programPath(path));
  const root = await mkdtemp(join(tmpdir(), "fu manifest "));
  await mkdir(join(root, "app/public"), { recursive: true });
  const files = {
    "app/server.mjs": "server",
    "app/updater.mjs": "updater",
    "app/public/index.html": "html",
    "app/build-info.json": JSON.stringify({
      product: "fabula-table",
      version: "0.2.4",
      updateProtocol: 1,
    }),
  };
  const manifest = [];
  for (const [file, text] of Object.entries(files)) {
    await writeFile(join(root, file), text);
    manifest.push({
      file,
      bytes: Buffer.byteLength(text),
      sha256: createHash("sha256").update(text).digest("hex"),
    });
  }
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  assert.equal((await verifyProgram(root, "0.2.4")).length, 4);
  await assert.rejects(verifyProgram(root, "0.2.5"), /安装器/);
  await writeFile(join(root, "app/server.mjs"), "tampered");
  await assert.rejects(verifyProgram(root, "0.2.4"), /校验失败/);
});

test("管理权限独立于玩家账号；每日自动更新等待空闲且二次核对在线玩家", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "fu admin "));
  const oldEnv = { ...process.env };
  Object.assign(process.env, {
    FU_ADMIN_KEY: "test-administrator-key",
    FU_UPDATE_ROOT: root,
    FU_UPDATE_REPO: "fixture/table",
    FU_AUTO_UPDATE: "1",
  });
  let now = Date.now(),
    online = 0,
    input: Record<string, unknown> = {},
    result: any,
    claim = { room: "account", user: "player" },
    calls = 0,
    joinDuringFetch = false;
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (joinDuringFetch) online = 1;
    return Response.json(release());
  });
  const routes = adminRoutes({
    read: async () => input,
    send: (_r, value) => {
      result = value;
    },
    rate: () => {},
    cookie: () => claim,
    set: (_r, room, user) => {
      claim = { room, user };
    },
    clear: () => {},
    online: () => online,
  });
  const req = { method: "POST" } as IncomingMessage,
    res = {} as ServerResponse;
  try {
    await assert.rejects(
      routes.handle("/api/admin/update", req, res),
      /管理密码/,
    );
    input = { key: "wrong" };
    await assert.rejects(routes.handle("/api/admin/login", req, res), /不正确/);
    input = { key: "test-administrator-key" };
    await routes.handle("/api/admin/login", req, res);
    assert.equal(claim.room, "server-admin");
    assert.equal(result.automatic, true);
    assert.equal(
      JSON.stringify(result).includes("test-administrator-key"),
      false,
    );
    now += 600001;
    online = 1;
    await routes.autoTick(now);
    assert.equal(calls, 0);
    online = 0;
    now += 600001;
    joinDuringFetch = true;
    await routes.autoTick(now);
    assert.equal(calls, 1);
    await assert.rejects(readFile(join(root, "request.json")), /ENOENT/);
    joinDuringFetch = false;
    online = 0;
    now += 600001;
    await routes.autoTick(now);
    assert.equal(
      JSON.parse(await readFile(join(root, "request.json"), "utf8")).version,
      "0.2.4",
    );
    await routes.autoTick(now + 600001);
    assert.equal(calls, 2);
    input = { version: "0.2.4" };
    await assert.rejects(routes.handle("/api/admin/update", req, res), /进行/);
  } finally {
    for (const key of [
      "FU_ADMIN_KEY",
      "FU_UPDATE_ROOT",
      "FU_UPDATE_REPO",
      "FU_AUTO_UPDATE",
    ])
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
  }
});
