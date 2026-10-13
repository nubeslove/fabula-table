import {
  mkdtemp,
  mkdir,
  cp,
  copyFile,
  writeFile,
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import assert from "node:assert/strict";
const project = resolve(import.meta.dirname, "..");
const { version } = JSON.parse(
  await readFile(join(project, "package.json"), "utf8"),
);
const target = version.replace(/\d+$/, (patch) => String(Number(patch) + 1));
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
await mkdir(join(project, "output"), { recursive: true });
const results = [];
for (const mode of ["success", "rollback", "interrupted"]) {
  const fixture = await mkdtemp(
    join(project, "output", "online-" + mode + "-"),
  );
  const root = join(fixture, "installed"),
    stage = join(fixture, "release");
  await mkdir(root);
  await mkdir(stage);
  await cp(join(project, "dist"), join(root, "app"), { recursive: true });
  await copyFile(
    join(project, "dist/updater.mjs"),
    join(root, "update-runner.mjs"),
  );
  await cp(join(project, "dist"), join(stage, "app"), { recursive: true });
  const oldSource = await readFile(join(stage, "app/server.mjs"), "utf8");
  assert.ok(oldSource.includes(`version: "${version}"`));
  await writeFile(
    join(stage, "app/server.mjs"),
    mode === "rollback"
      ? "process.exit(1);"
      : oldSource.replace(`version: "${version}"`, `version: "${target}"`),
  );
  const info = JSON.parse(
    await readFile(join(stage, "app/build-info.json"), "utf8"),
  );
  await writeFile(
    join(stage, "app/build-info.json"),
    JSON.stringify({ ...info, version: target }),
  );
  const manifest = [];
  async function walk(dir, relative) {
    for (const file of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, file.name),
        rel = relative + "/" + file.name;
      if (file.isDirectory()) await walk(path, rel);
      else {
        const bytes = await readFile(path);
        manifest.push({
          file: rel,
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  }
  await walk(join(stage, "app"), "app");
  await writeFile(join(stage, "manifest.json"), JSON.stringify(manifest));
  const zip = join(fixture, "update.zip");
  const zipped = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -LiteralPath ${quote(join(stage, "app"))},${quote(join(stage, "manifest.json"))} -DestinationPath ${quote(zip)}`,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  assert.equal(zipped.status, 0, zipped.stdout + zipped.stderr);
  const buffer = await readFile(zip),
    port = randomInt(45000, 54000),
    updates = join(root, "updates");
  await mkdir(updates);
  await mkdir(join(root, "data/assets"), { recursive: true });
  const envText = `FU_HOST=127.0.0.1\nFU_PORT=${port}\nFU_BASE_PATH=/fu\nFU_CREATE_KEY=test-create\nFU_ADMIN_KEY=test-admin\nFU_UPDATE_REPO=fixture/table\nFU_AUTO_UPDATE=0\n`;
  await writeFile(join(root, ".env"), envText);
  await writeFile(join(root, "data/assets/retained"), "retained-GM-resource");
  const runner = join(root, "test-runner.mjs");
  const release = {
    tag_name: "v" + target,
    draft: false,
    prerelease: false,
    assets: [
      {
        name: `fabula-table-${target}.zip`,
        browser_download_url: `https://github.com/fixture/table/releases/download/v${target}/fabula-table-${target}.zip`,
        digest: "sha256:" + createHash("sha256").update(buffer).digest("hex"),
        size: buffer.length,
      },
    ],
  };
  await writeFile(
    runner,
    `import {readFile} from 'node:fs/promises';import {runSupervisor} from './update-runner.mjs';process.loadEnvFile();const realFetch=globalThis.fetch;globalThis.fetch=async (url,options)=>String(url).startsWith('https://api.github.com/')?Response.json(${JSON.stringify(release)}):String(url).startsWith('https://github.com/')?new Response(await readFile(${JSON.stringify(zip)})):realFetch(url,options);await runSupervisor(process.cwd());`,
  );
  let child,
    output = "";
  const start = () => {
    child = spawn(process.execPath, [runner], {
      cwd: root,
      windowsHide: true,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) => !key.startsWith("FU_")),
        ),
        FU_DATA_DIR: join(root, "data"),
        FU_PUBLIC_DIR: join(root, "app/public"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (s) => {
      output += s;
    });
    child.stderr.on("data", (s) => {
      output += s;
    });
  };
  const stop = () => {
    if (child?.pid)
      spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
  };
  const base = `http://127.0.0.1:${port}/fu/api/`;
  async function wait(predicate, seconds = 35) {
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
      try {
        if (await predicate()) return;
      } catch {}
      await delay(200);
    }
    throw new Error("Fixture timed out: " + mode + "\n" + output);
  }
  async function post(path, value, cookie) {
    const response = await fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-FU-Request": "1",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(value),
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response;
  }
  try {
    start();
    await wait(
      async () =>
        (await (await fetch(base + "health")).json()).version === version,
    );
    assert.equal((await fetch(base + "admin/status")).status, 401);
    const admin = await post("admin/login", { key: "test-admin" });
    const adminCookie = admin.headers.get("set-cookie").split(";")[0];
    assert.equal((await admin.json()).automatic, false);
    const registered = await post("account/register", {
      name: "IntegrationGM",
      password: "fixture-password",
    });
    const accountCookie = registered.headers.get("set-cookie").split(";")[0];
    await post(
      "worlds",
      {
        title: "World retained",
        name: "GM",
        password: "room-password",
        creationKey: "test-create",
        expansions: [],
      },
      accountCookie,
    );
    assert.equal(
      (
        await fetch(base + "admin/status", {
          headers: { Cookie: accountCookie },
        })
      ).status,
      401,
    );
    const dataHashes = async () => {
      const entries = [];
      async function scan(dir, rel = "") {
        for (const f of await readdir(dir, { withFileTypes: true })) {
          const p = join(dir, f.name),
            r = rel + "/" + f.name;
          if (f.isDirectory()) await scan(p, r);
          else
            entries.push([
              r,
              createHash("sha256")
                .update(await readFile(p))
                .digest("hex"),
            ]);
        }
      }
      await scan(join(root, "data"));
      return entries.sort((a, b) => a[0].localeCompare(b[0]));
    };
    const before = await dataHashes();
    if (mode === "interrupted") {
      stop();
      const backupName = "backup-1-00000000-0000-0000-0000-000000000000",
        backup = join(updates, backupName);
      await mkdir(backup);
      await cp(join(root, "app"), join(backup, "app"), { recursive: true });
      await cp(join(root, "data"), join(backup, "data"), { recursive: true });
      await writeFile(
        join(updates, "transaction.json"),
        JSON.stringify({
          backup: backupName,
          previousVersion: version,
          version: target,
        }),
      );
      await writeFile(join(root, "app/server.mjs"), "broken partial program");
      await writeFile(join(root, "app/updater.mjs"), "broken partial updater");
      await writeFile(join(root, "data/assets/retained"), "partial migration");
      await writeFile(join(updates, "maintenance"), "updating");
      start();
    } else {
      await writeFile(join(updates, "maintenance"), "updating");
      assert.equal((await fetch(base + "lobby")).status, 503);
      await writeFile(
        join(updates, "request.json"),
        JSON.stringify({ version: target, id: "fixture" }),
      );
    }
    await wait(async () => {
      const state = JSON.parse(
        await readFile(join(updates, "state.json"), "utf8"),
      );
      return state.phase === (mode === "success" ? "complete" : "failed");
    });
    await wait(async () => (await fetch(base + "lobby")).status === 200);
    const expected = mode === "success" ? target : version;
    assert.equal(
      (await (await fetch(base + "health")).json()).version,
      expected,
    );
    assert.deepEqual(await dataHashes(), before);
    assert.equal(await readFile(join(root, ".env"), "utf8"), envText);
    assert.equal(
      (await fetch(base + "admin/status", { headers: { Cookie: adminCookie } }))
        .status,
      200,
    );
    results.push({
      mode,
      expected,
      root,
      worldAndAssetsUnchanged: true,
      state: JSON.parse(await readFile(join(updates, "state.json"), "utf8")),
    });
    console.log(JSON.stringify({ mode, passed: true, root }));
  } finally {
    stop();
    await writeFile(join(fixture, "test-output.log"), output);
  }
}
await writeFile(
  join(project, "output/online-update-verification.json"),
  JSON.stringify(results, null, 2),
);
