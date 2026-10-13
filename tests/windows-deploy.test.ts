import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomInt, webcrypto } from "node:crypto";
import { uid } from "../src/lib/api";

test("IP + HTTP 环境缺少 randomUUID 时仍能生成有效且不重复的人物 / 命刻 ID", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) },
  });
  try {
    const ids = Array.from({ length: 100 }, () => uid());
    assert.equal(new Set(ids).size, 100);
    for (const id of ids)
      assert.match(
        id,
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
      );
  } finally {
    Object.defineProperty(globalThis, "crypto", original);
  }
});

const windows = process.platform === "win32";
const ps = join(
  process.env.SystemRoot || "C:/Windows",
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
const cleanEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("FU_")),
  );

test(
  "Windows 部署：IP 输入、保留已有配置、PATH 不含 Node 时定位安装目录",
  { skip: !windows },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "fu setup "));
    const script = join(root, "verify.ps1");
    await mkdir(join(root, "runtime"));
    await copyFile(process.execPath, join(root, "runtime/node.exe"));
    const common = resolve("deploy/windows-common.ps1").replaceAll("'", "''");
    await writeFile(
      script,
      "\uFEFF" +
        `
$ErrorActionPreference = 'Stop'
. '${common}'
foreach ($file in Get-ChildItem -LiteralPath '${resolve("deploy").replaceAll("'", "''")}' -Filter '*.ps1') {
  $tokens = $null; $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count) { throw ($errors | Out-String) }
}
if ((Get-FuEndpoint '203.0.113.42' 3340 direct) -ne 'http://203.0.113.42:3340') { throw 'IP address' }
if ((Get-FuEndpoint 'https://table.example/fu/' 3340 proxy) -ne 'https://table.example') { throw 'proxy origin' }
foreach ($bad in @('https://table.example', '0.0.0.0', 'host.example/other', 'http://user:password@host.example')) {
  $rejected = $false
  try { Get-FuEndpoint $bad 3340 direct | Out-Null } catch { $rejected = $true }
  if (-not $rejected) { throw 'invalid endpoint accepted' }
}
$path = Join-Path $PSScriptRoot '.env'
[IO.File]::WriteAllText($path, "# existing config\nFU_PORT=1111\nFU_CREATE_KEY=preserved-test-key\nFU_FFMPEG=C:/Tools/ffmpeg.exe\n")
Write-FuConfig $path ([ordered]@{FU_PORT='3340';FU_PUBLIC_URL='http://203.0.113.42:3340'})
$config = Read-FuConfig $path
if ($config.FU_PORT -ne '3340' -or $config.FU_CREATE_KEY -ne 'preserved-test-key' -or $config.FU_FFMPEG -ne 'C:/Tools/ffmpeg.exe') { throw 'config not preserved' }
if (-not (Test-Path -LiteralPath "$path.backup")) { throw 'missing backup' }
$env:Path = "$env:SystemRoot/System32"
if (-not (Find-FuNode $PSScriptRoot)) { throw 'installed Node not found without PATH' }
Write-Output 'windows-config-ok'
`,
    );
    const result = spawnSync(
      ps,
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
      { env: cleanEnv(), encoding: "utf8", windowsHide: true },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /windows-config-ok/);
  },
);

test(
  "Windows 启动入口读取 .env 中的端口 / 路径 / 建房钥匙，并保留原数据",
  { skip: !windows },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "fu server "));
    await mkdir(join(root, "app"));
    await mkdir(join(root, "data"));
    await mkdir(join(root, "runtime"));
    await copyFile(process.execPath, join(root, "runtime/node.exe"));
    await writeFile(join(root, "data/keep.txt"), "existing-data");
    for (const file of [
      "start.cmd",
      "start-windows.ps1",
      "windows-common.ps1",
      "launch.mjs",
    ])
      await copyFile(resolve("deploy", file), join(root, file));
    await copyFile(resolve("dist/server.mjs"), join(root, "app/server.mjs"));
    const port = randomInt(45000, 54000);
    await writeFile(
      join(root, ".env"),
      `FU_HOST=127.0.0.1\nFU_PORT=${port}\nFU_BASE_PATH=/fu\nFU_CREATE_KEY=setup-test-key\n`,
    );
    const child = spawn(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/c", "start.cmd"],
      {
        cwd: root,
        env: cleanEnv(),
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    try {
      let healthy = false;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && child.exitCode === null) {
        try {
          const response = await fetch(
            `http://127.0.0.1:${port}/fu/api/health`,
            { signal: AbortSignal.timeout(1200) },
          );
          const result = await response.json();
          if (result.ok && result.product === "fabula-table") {
            healthy = true;
            break;
          }
        } catch {
          /* Wait for this test's child process to start. */
        }
        await new Promise((done) => setTimeout(done, 100));
      }
      assert.ok(healthy, `Startup health check failed (exit ${child.exitCode}):\n${output}`);
      const registered = await fetch(
        `http://127.0.0.1:${port}/fu/api/account/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-FU-Request": "1" },
          body: JSON.stringify({ name: "部署 GM", password: "test-password" }),
        },
      );
      const cookie = registered.headers.get("set-cookie")!.split(";")[0];
      const response = await fetch(`http://127.0.0.1:${port}/fu/api/worlds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FU-Request": "1",
          Cookie: cookie,
        },
        body: JSON.stringify({
          title: "部署检查",
          name: "GM",
          password: "test-password",
          creationKey: "wrong",
        }),
      });
      assert.equal(response.status, 403);
      assert.equal(
        await readFile(join(root, "data/keep.txt"), "utf8"),
        "existing-data",
      );
    } finally {
      // Only terminate the process tree spawned by this test.
      if (child.pid)
        spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
    }
  },
);
