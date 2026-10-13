import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test(
  "Windows 文件可读但父目录元信息被拒绝时，最小权限修复可恢复访问且不改变子文件权限",
  { skip: process.platform !== "win32" },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "fu acl "));
    const profile = join(root, "private Profile");
    const desktop = join(profile, "private Desktop");
    const app = join(desktop, "FU");
    const launch = join(app, "launch.mjs");
    const fixture = "console.log('fixture-started');\n";
    const node = process.env.FU_TEST_NODE || process.execPath;
    await mkdir(app, { recursive: true });
    await writeFile(launch, fixture);
    const ps = join(
      process.env.SystemRoot!,
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => key.toLowerCase() !== "psmodulepath",
      ),
    );
    const script = join(root, "fixture.ps1");
    const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
    await writeFile(
      script,
      "\uFEFF" +
        `
param([string]$Mode)
$ErrorActionPreference='Stop'
$profile=${quote(profile)}; $desktop=${quote(desktop)}; $app=${quote(app)}; $launch=${quote(launch)}
$saved=Join-Path $PSScriptRoot 'original-acl.txt'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$section=[Security.AccessControl.AccessControlSections]::Access
if ($Mode -eq 'lock') {
  $original=[IO.Directory]::GetAccessControl($desktop)
  [IO.File]::WriteAllText($saved,$original.GetSecurityDescriptorSddlForm($section))
  [IO.File]::WriteAllText($saved+'.profile',[IO.Directory]::GetAccessControl($profile).GetSecurityDescriptorSddlForm($section))
  $acl=[IO.Directory]::GetAccessControl($app); $acl.SetAccessRuleProtection($true,$true); [IO.Directory]::SetAccessControl($app,$acl)
  $acl=[IO.File]::GetAccessControl($launch); $acl.SetAccessRuleProtection($true,$true); [IO.File]::SetAccessControl($launch,$acl)
  $limited=[Security.AccessControl.DirectorySecurity]::new()
  $limited.SetAccessRuleProtection($true,$false)
  $rights=[Security.AccessControl.FileSystemRights]'ReadPermissions, ChangePermissions, Traverse, Synchronize'
  $limited.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,$rights,'None','None','Allow'))
  [IO.Directory]::SetAccessControl($desktop,$limited)
  $limited=[Security.AccessControl.DirectorySecurity]::new()
  $limited.SetAccessRuleProtection($true,$false)
  $limited.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]'ReadAttributes, ReadPermissions, ChangePermissions, Traverse, Synchronize','None','None','Allow'))
  [IO.Directory]::SetAccessControl($profile,$limited)
} elseif ($Mode -eq 'restore') {
  $acl=[Security.AccessControl.DirectorySecurity]::new()
  $acl.SetSecurityDescriptorSddlForm([IO.File]::ReadAllText($saved),$section)
  [IO.Directory]::SetAccessControl($desktop,$acl)
  $acl=[Security.AccessControl.DirectorySecurity]::new()
  $acl.SetSecurityDescriptorSddlForm([IO.File]::ReadAllText($saved+'.profile'),$section)
  [IO.Directory]::SetAccessControl($profile,$acl)
} elseif ($Mode -eq 'metadata') {
  # Match libuv's older-Windows stat path (FILE_READ_ATTRIBUTES + backup/reparse flags).
  # Recent Windows GetFileInformationByName may bypass this handle-based path.
  Add-Type @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class DirectoryMetadataProbe {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  public static int Check(string path) {
    using (var handle = CreateFileW(path, 0x80, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero)) {
      return handle.IsInvalid ? Marshal.GetLastWin32Error() : 0;
    }
  }
}
'@
  Write-Output ([DirectoryMetadataProbe]::Check($desktop))
} else {
  . ${quote(resolve("deploy/windows-common.ps1"))}
  $fileBefore=[IO.File]::GetAccessControl($launch).GetSecurityDescriptorSddlForm($section)
  Grant-FuDirectoryMetadataAccess $desktop $sid.Value | Out-Null
  if ([IO.File]::GetAccessControl($launch).GetSecurityDescriptorSddlForm($section) -ne $fileBefore) { throw 'Child permissions changed' }
  Grant-FuDirectoryMetadataAccess $desktop 'S-1-5-19' | Out-Null
  $acl=[IO.Directory]::GetAccessControl($desktop)
  $rules=@($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]) | Where-Object { $_.IdentityReference.Value -eq 'S-1-5-19' })
  if ($rules.Count -ne 1) { throw 'Expected one service-account rule' }
  $expected=[Security.AccessControl.FileSystemRights]'ReadAttributes, Traverse, Synchronize'
  if ($rules[0].FileSystemRights -ne $expected -or $rules[0].InheritanceFlags -ne 'None' -or $rules[0].PropagationFlags -ne 'None') { throw 'Excess directory permission' }
  $before=$acl.GetSecurityDescriptorSddlForm($section)
  Grant-FuDirectoryMetadataAccess $desktop 'S-1-5-19' | Out-Null
  if ([IO.Directory]::GetAccessControl($desktop).GetSecurityDescriptorSddlForm($section) -ne $before) { throw 'Repeated repair changed permissions' }
  # Verify ancestor selection and snapshots without changing real ancestors.
  $script:visited=[Collections.Generic.List[string]]::new()
  function Grant-FuDirectoryMetadataAccess { param($Path); $script:visited.Add($Path) }
  $backup=Join-Path $PSScriptRoot 'path-acl-backup.json'
  Grant-FuServicePathAccess $app $backup
  $records=Get-Content -LiteralPath $backup -Encoding UTF8 -Raw | ConvertFrom-Json
  if ($records[0].path -ne $desktop -or $records.Count -ne $script:visited.Count -or $script:visited.Contains($app)) { throw 'Incorrect ancestor scope' }
  foreach ($entry in $records) { if (-not $entry.dacl) { throw 'Missing pre-change permission snapshot' } }
  $script:visited.Clear()
  $rejected=$false
  try { Grant-FuServicePathAccess $app $backup } catch { $rejected=$true }
  if (-not $rejected -or $script:visited.Count) { throw 'Existing backup overwritten or permissions modified before backup' }
}
`,
    );
    const run = (mode: string) =>
      spawnSync(
        ps,
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          script,
          "-Mode",
          mode,
        ],
        { env, windowsHide: true, encoding: "utf8" },
      );
    const locked = run("lock");
    assert.equal(locked.status, 0, locked.stdout + locked.stderr);
    try {
      assert.equal(
        await readFile(launch, "utf8"),
        fixture,
        "Direct file read must work, matching the server report",
      );
      const blocked = run("metadata");
      assert.equal(blocked.status, 0, blocked.stdout + blocked.stderr);
      assert.equal(
        blocked.stdout.trim(),
        "5",
        "Win32 FILE_READ_ATTRIBUTES must fail with access denied",
      );
      const blockedNode = spawnSync(node, [launch], {
        windowsHide: true,
        encoding: "utf8",
      });
      assert.equal(
        blockedNode.status,
        1,
        blockedNode.stdout + blockedNode.stderr,
      );
      assert.match(blockedNode.stderr, /EPERM[\s\S]*lstat/);
      const repaired = run("repair");
      assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
      const allowed = run("metadata");
      assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
      assert.equal(allowed.stdout.trim(), "0");
      const started = spawnSync(node, [launch], {
        windowsHide: true,
        encoding: "utf8",
      });
      assert.equal(started.status, 0, started.stderr);
      assert.match(started.stdout, /fixture-started/);
    } finally {
      const restored = run("restore");
      assert.equal(restored.status, 0, restored.stdout + restored.stderr);
    }
  },
);
