// One-off release verification. All writes and service processes use newly created test directories.
// No installed task, real deployment, firewall, or public service is modified.
import assert from "node:assert/strict";
import {
  cp,
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  readdir,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash, randomInt } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

assert.equal(process.platform, "win32");
const project = resolve(import.meta.dirname, "..");
const oldPackage = join(project, "release/fabula-table-0.1.6");
const versionArg = process.argv.find((arg) => arg.startsWith("--version="));
const version =
  versionArg?.slice(10) ||
  JSON.parse(await readFile(join(project, "package.json"), "utf8")).version;
const modesArg = process.argv.find((arg) => arg.startsWith("--modes="));
const modes = modesArg?.slice(8).split(",") || [
  "restart",
  "slow-start",
  "rollback",
];
const upgradePackage = join(project, `release/fabula-table-upgrade-${version}`);
const evidence = join(project, "output");
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !k.startsWith("FU_") && k.toLowerCase() !== "psmodulepath",
  ),
);
const ps = join(
  process.env.SystemRoot,
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const quote = (text) => "'" + text.replaceAll("'", "''") + "'";
const results = [];
async function hashes(root) {
  const result = {};
  async function walk(dir) {
    for (const file of await readdir(join(root, dir), {
      withFileTypes: true,
    })) {
      const rel = join(dir, file.name);
      if (file.isDirectory()) await walk(rel);
      else
        result[rel] = createHash("sha256")
          .update(await readFile(join(root, rel)))
          .digest("hex");
    }
  }
  for (const dir of ["data", "runtime"]) await walk(dir);
  result[".env"] = createHash("sha256")
    .update(await readFile(join(root, ".env")))
    .digest("hex");
  return result;
}
async function health(port, expected) {
  for (let i = 0; i < 60; i++) {
    try {
      const h = await (
        await fetch(`http://127.0.0.1:${port}/fu/api/health`, {
          signal: AbortSignal.timeout(800),
        })
      ).json();
      if (h.version === expected) return h;
    } catch {}
    await pause(100);
  }
  throw new Error(
    `Test service did not start on ${port}: expected ${expected}`,
  );
}
async function runPowerShell(args) {
  return new Promise((done, reject) => {
    const child = spawn(
      ps,
      ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args],
      { env, windowsHide: true },
    );
    let output = "";
    child.stdout.on("data", (b) => (output += b.toString()));
    child.stderr.on("data", (b) => (output += b.toString()));
    child.once("error", reject);
    child.once("close", (status) => done({ status, output }));
  });
}
async function stopTestService(root) {
  // The unique absolute launch filename must belong to this run's test directory.
  assert.ok(root.startsWith(evidence + "\\upgrade-016-"));
  const launch = join(root, "launch.mjs");
  const lookup = spawnSync(
    ps,
    [
      "-NoProfile",
      "-Command",
      `$entry=${quote(launch)}; Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match ('(?:^|[\\s\"])' + [regex]::Escape($entry) + '(?:[\\s\"]|$)') } | Select-Object -ExpandProperty ProcessId`,
    ],
    { env, windowsHide: true, encoding: "utf8" },
  );
  assert.equal(lookup.status, 0, lookup.stderr);
  for (const value of lookup.stdout.trim().split(/\s+/).filter(Boolean)) {
    assert.match(value, /^\d+$/);
    try {
      process.kill(Number(value));
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}

for (const mode of modes) {
  assert.ok(["restart", "stopped", "slow-start", "rollback"].includes(mode));
  const root = await mkdtemp(join(evidence, `upgrade-016-${mode}-`));
  await cp(oldPackage, root, { recursive: true });
  // A synthetic old world and upload are sufficient here. Real old-world copies were checked separately.
  await mkdir(join(root, "data/rooms"), { recursive: true });
  await mkdir(join(root, "data/assets"));
  await mkdir(join(root, "runtime"));
  await writeFile(
    join(root, "data/server-key"),
    "upgrade-fixture-signing-key-not-a-real-secret",
  );
  await writeFile(
    join(root, "data/rooms/fixture.json"),
    JSON.stringify({
      world: {
        id: "fixture",
        title: "保留的测试世界",
        characters: [],
        scenes: [],
        notes: "旧世界测试记录",
      },
      users: [],
    }),
  );
  await writeFile(
    join(root, "data/assets/fixture.webp"),
    "fixture-original-upload",
  );
  await writeFile(
    join(root, "runtime/preserve.txt"),
    "existing-runtime-settings",
  );
  const port = randomInt(45000, 54000);
  await writeFile(
    join(root, ".env"),
    `FU_HOST=127.0.0.1\nFU_PORT=${port}\nFU_BASE_PATH=/fu\nFU_CREATE_KEY=fixture-key\n`,
  );
  const before = await hashes(root);
  let source = upgradePackage;
  if (mode === "rollback" || mode === "slow-start") {
    source = await mkdtemp(join(evidence, "upgrade-failing-package-"));
    await cp(upgradePackage, source, { recursive: true });
    // Valid package integrity with an intentional startup error: exercise the rollback path.
    const entry =
      mode === "rollback"
        ? "throw new Error('Intentional isolated upgrade failure');\n"
        : "await new Promise(resolve => setTimeout(resolve, 45000));\n" +
          (await readFile(join(source, "app/server.mjs"), "utf8"));
    await writeFile(join(source, "app/server.mjs"), entry);
    const manifest = JSON.parse(
      await readFile(join(source, "manifest.json"), "utf8"),
    );
    const server = manifest.find((e) => e.file === "app/server.mjs");
    server.bytes = Buffer.byteLength(entry);
    server.sha256 = createHash("sha256").update(entry).digest("hex");
    await writeFile(join(source, "manifest.json"), JSON.stringify(manifest));
  }
  const child =
    mode === "stopped"
      ? null
      : spawn(process.execPath, [join(root, "launch.mjs"), "--background"], {
          cwd: root,
          env,
          windowsHide: true,
          stdio: "ignore",
        });
  try {
    if (child) await health(port, "0.1.6");
    const result = await runPowerShell([
      "-File",
      join(source, "upgrade-windows.ps1"),
      "-TargetDirectory",
      root,
    ]);
    await writeFile(join(root, "upgrade-test.log"), result.output);
    assert.equal(result.status, mode === "rollback" ? 1 : 0, result.output);
    const expected = mode === "rollback" ? "0.1.6" : version;
    await health(port, expected);
    assert.equal(
      JSON.parse(await readFile(join(root, "app/build-info.json"), "utf8"))
        .version,
      expected,
    );
    assert.deepEqual(
      await hashes(root),
      before,
      "Worlds, uploads, configuration, key and runtime must remain byte-identical",
    );
    const backups = await readdir(join(root, "backups"));
    assert.equal(backups.length, 1);
    if (mode === "rollback" && version !== "0.2.0") {
      const report = await readFile(
        join(root, "backups", backups[0], "upgrade-report.txt"),
        "utf8",
      );
      assert.match(report, /Intentional isolated upgrade failure/);
      assert.match(report, /已确认旧版 0\.1\.6 恢复运行/);
      assert.ok(
        !report.includes("fixture-key"),
        "No configured creation key in the report",
      );
    }
    results.push({
      mode,
      root,
      version: expected,
      preservedFiles: Object.keys(before).length,
      backup: join(root, "backups", backups[0]),
      passed: true,
    });
    console.log(JSON.stringify(results.at(-1)));
  } finally {
    await stopTestService(root);
    if (child?.exitCode === null) child.kill();
  }
}
await writeFile(
  join(evidence, `upgrade-016-to-${version}-result.json`),
  JSON.stringify(results, null, 2),
);
