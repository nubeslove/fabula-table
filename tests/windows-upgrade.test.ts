import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const windows = process.platform === "win32";
const ps = join(
  process.env.SystemRoot || "C:/Windows",
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith("FU_") && key.toLowerCase() !== "psmodulepath",
  ),
);
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

test(
  "Windows 升级等待后台任务退出，并在无法停止时中止替换",
  { skip: !windows },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "fu upgrade wait "));
    const script = join(root, "verify.ps1");
    await writeFile(
      script,
      "\uFEFF" +
        `
$ErrorActionPreference = 'Stop'
. ${quote(resolve("deploy/upgrade-support.ps1"))}
$script:stopped = $false
$script:polls = 0
function Stop-ScheduledTask { param($TaskName, $TaskPath); $script:stopped = $true }
function Get-ScheduledTask {
  param($TaskName, $TaskPath)
  if (-not $script:stopped) { throw 'Polled before stop' }
  $script:polls++
  [pscustomobject]@{ State = $(if ($script:polls -lt 3) { 'Running' } else { 'Ready' }) }
}
function Get-FuOwnedProcesses { param($Launch, $App); @() }
$task = [pscustomobject]@{TaskName='IsolatedFakeTask';TaskPath='\\'}
Stop-FuDeployment $task 'unused launch' 'unused app' 3
if ($script:polls -lt 3) { throw 'Returned while the scheduler still reported Running' }
function Get-ScheduledTask { param($TaskName, $TaskPath); [pscustomobject]@{ State='Running' } }
$rejected = $false
try { Stop-FuDeployment $task 'unused launch' 'unused app' 1 } catch { $rejected = $true }
if (-not $rejected) { throw 'Continuing while old deployment still runs' }
Write-Output 'scheduler-boundary-ok'
`,
    );
    const result = spawnSync(
      ps,
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
      { env, windowsHide: true, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /scheduler-boundary-ok/);
  },
);

test(
  "后台启动在读取配置失败时仍将原因写入 server.log",
  { skip: !windows },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "fu startup log "));
    await mkdir(join(root, "app"));
    // A directory at .env reproduces a configuration read error before app import.
    await mkdir(join(root, ".env"));
    await copyFile(resolve("deploy/launch.mjs"), join(root, "launch.mjs"));
    await writeFile(
      join(root, "app/server.mjs"),
      "throw new Error('must not reach server');",
    );
    const result = spawnSync(
      process.execPath,
      [join(root, "launch.mjs"), "--background"],
      { env, windowsHide: true, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    const log = await readFile(join(root, "logs/server.log"), "utf8");
    assert.match(log, /FU 启动失败/);
    assert.match(log, /loadEnvFile/);
    assert.match(log, /\.env/);
    assert.doesNotMatch(log, /must not reach server/);
  },
);
