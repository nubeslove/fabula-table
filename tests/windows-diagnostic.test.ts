import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test(
  "Windows 后台诊断捕获早期错误、保留原文件且不输出密钥",
  { skip: process.platform !== "win32" },
  async () => {
    const ps = join(
      process.env.SystemRoot!,
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !key.startsWith("FU_") && key.toLowerCase() !== "psmodulepath",
      ),
    );
    const root = await mkdtemp(join(tmpdir(), "fu 诊断 "));
    const source = resolve("deploy/diagnostics");
    const parser = join(root, "parse.ps1");
    await writeFile(
      parser,
      "\uFEFF" +
        `
$ErrorActionPreference='Stop'
foreach ($file in Get-ChildItem -LiteralPath '${source.replaceAll("'", "''")}' -Filter '*.ps1') {
  $tokens=$null; $errors=$null
  [System.Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors) | Out-Null
  if ($errors.Count) { throw ($errors | Out-String) }
}
`,
    );
    const parsed = spawnSync(ps, ["-NoProfile", "-File", parser], {
      env,
      windowsHide: true,
      encoding: "utf8",
    });
    assert.equal(parsed.status, 0, parsed.stdout + parsed.stderr);
    for (const mode of ["healthy", "syntax-error", "missing-runtime"]) {
      const target = join(root, mode, "原 FU");
      const probe = join(root, mode, "检查目录");
      for (const dir of [
        target,
        probe,
        join(target, "app"),
        join(target, "data"),
        join(target, "logs"),
      ])
        await mkdir(dir, { recursive: true });
      const original = {
        ".env": "FU_CREATE_KEY=NEVER_PRINT_CREATION_KEY\nFU_DATA_DIR=data\n",
        "data/server-key": "NEVER_PRINT_SIGNING_KEY",
        "logs/server.log": "original server output\n",
        "launch.mjs": "throw new Error('APPLICATION_MUST_NOT_EXECUTE');\n",
        "app/server.mjs":
          mode === "syntax-error"
            ? "export const = 1;\n"
            : "throw new Error('APPLICATION_MUST_NOT_EXECUTE');\n",
      };
      for (const [file, content] of Object.entries(original))
        await writeFile(join(target, file), content);
      for (const file of ["service-probe.ps1", "service-probe.mjs"])
        await copyFile(join(source, file), join(probe, file));
      await writeFile(
        join(probe, "probe.json"),
        JSON.stringify({
          target,
          node:
            mode === "missing-runtime"
              ? join(root, "missing-node.exe")
              : process.execPath,
        }),
      );
      const checked = spawnSync(
        ps,
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          join(probe, "service-probe.ps1"),
          "-ProbeDirectory",
          probe,
        ],
        { env, windowsHide: true, encoding: "utf8", timeout: 40000 },
      );
      assert.equal(checked.status, 0, checked.stdout + checked.stderr);
      const report = await readFile(join(probe, "service-report.txt"), "utf8");
      assert.doesNotMatch(report, /NEVER_PRINT|APPLICATION_MUST_NOT_EXECUTE/);
      if (mode === "syntax-error") assert.match(report, /SyntaxError/);
      else if (mode === "missing-runtime")
        assert.match(report, /启动诊断进程失败/);
      else {
        assert.match(report, /诊断进程退出码：0/);
        assert.match(report, /上述启动前检查均通过/);
      }
      for (const [file, content] of Object.entries(original))
        assert.equal(await readFile(join(target, file), "utf8"), content);
      assert.deepEqual(await readdir(join(target, "logs")), ["server.log"]);
      assert.equal(
        await readFile(join(probe, "completed.txt"), "utf8"),
        "completed",
      );
    }
  },
);
