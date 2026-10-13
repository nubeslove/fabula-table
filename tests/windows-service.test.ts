import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomInt } from "node:crypto";
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
test(
  "Windows 新安装识别旧任务；停止只影响当前 FU；重新启动恢复自启与服务",
  { skip: process.platform !== "win32" },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "fu control "));
    const installed = join(root, "new FU"),
      other = join(root, "old FU");
    const port = randomInt(45000, 54000);
    for (const dir of [installed, other]) {
      await mkdir(join(dir, "app"), { recursive: true });
      await mkdir(join(dir, "data"));
      await writeFile(
        join(dir, "app/build-info.json"),
        JSON.stringify({ product: "fabula-table", version: "0.2.3" }),
      );
    }
    await writeFile(
      join(installed, "launch.mjs"),
      `import {createServer} from 'node:http';createServer((q,r)=>r.end(JSON.stringify({ok:true,product:'fabula-table',version:'0.2.3'}))).listen(${port},'127.0.0.1');`,
    );
    await writeFile(join(other, "launch.mjs"), "setInterval(()=>{},1000)");
    const unrelated = spawn(process.execPath, [join(other, "launch.mjs")], {
      windowsHide: true,
      stdio: "ignore",
    });
    const script = join(root, "test.ps1");
    await writeFile(
      script,
      "\uFEFF" +
        `
$ErrorActionPreference = 'Stop'
. ${quote(resolve("deploy/windows-common.ps1"))}
. ${quote(resolve("deploy/upgrade-support.ps1"))}
$root = ${quote(installed)}
$other = ${quote(other)}
Assert-FuFreshDirectory $root
[IO.File]::WriteAllText((Join-Path $root 'data/keep.txt'), 'retained')
$rejected = $false
try { Assert-FuFreshDirectory $root } catch { $rejected = $true }
if (-not $rejected) { throw 'Existing worlds accepted as fresh install' }
$script:task = [pscustomobject]@{TaskName='IsolatedFakeTask';TaskPath='\\';State='Ready';Actions=@([pscustomobject]@{Execute=${quote(process.execPath)};Arguments=('"' + (Join-Path $root 'launch.mjs') + '" --background');WorkingDirectory=$root})}
if ((Get-FuTaskRoot $script:task) -ne $root) { throw 'Cannot resolve valid task' }
$script:events = [Collections.Generic.List[string]]::new()
function Get-ScheduledTask { param($TaskName,$TaskPath); return $script:task }
function Disable-ScheduledTask { param($TaskName,$TaskPath); $script:events.Add('disable'); $script:task.State='Disabled' }
function Enable-ScheduledTask { param($TaskName,$TaskPath); $script:events.Add('enable'); $script:task.State='Ready' }
function Stop-ScheduledTask { param($TaskName,$TaskPath); $script:events.Add('stop') }
function Start-ScheduledTask { param($TaskName,$TaskPath); $script:events.Add('start'); Start-Process -FilePath ${quote(process.execPath)} -ArgumentList $script:task.Actions[0].Arguments -WorkingDirectory $root -WindowStyle Hidden; $script:task.State='Running' }
[IO.File]::WriteAllText((Join-Path $root '.env'), "FU_HOST=127.0.0.1\nFU_PORT=${port}\nFU_BASE_PATH=/fu\nFU_PUBLIC_URL=http://127.0.0.1:${port}\n")
try {
  Invoke-FuServiceControl $root Start
  Invoke-FuServiceControl $root Stop
  if (($script:events -join ',') -ne 'enable,start,disable,stop') { throw 'Incorrect service lifecycle' }
  if (@(Get-FuOwnedProcesses (Join-Path $root 'launch.mjs') (Join-Path $root 'app')).Count) { throw 'Owned process still running' }
  if (-not (Get-Process -Id ${unrelated.pid} -ErrorAction SilentlyContinue)) { throw 'Unrelated process terminated' }
  Invoke-FuServiceControl $root Stop
  $before = $script:events.Count
  $rejected = $false
  try { Invoke-FuServiceControl $other Stop } catch { $rejected = $true }
  if (-not $rejected -or $script:events.Count -ne $before) { throw 'Cross-directory control was not rejected' }
  $script:task.Actions[0].Arguments = '"C:\\not-fu.mjs" --background'
  $rejected = $false
  try { Get-FuTaskRoot $script:task } catch { $rejected = $true }
  if (-not $rejected) { throw 'Invalid existing task was accepted' }
  Write-Output 'service-control-ok'
} finally { Stop-FuDeployment $null (Join-Path $root 'launch.mjs') (Join-Path $root 'app') }
`,
    );
    try {
      const result = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
        { windowsHide: true, encoding: "utf8", timeout: 30000 },
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /service-control-ok/);
      assert.equal(
        await readFile(join(installed, "data/keep.txt"), "utf8"),
        "retained",
      );
      assert.equal(unrelated.exitCode, null);
    } finally {
      unrelated.kill();
    }
  },
);
