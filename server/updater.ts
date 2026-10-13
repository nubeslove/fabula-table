import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import {
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  getProgramRelease,
  downloadProgram,
  newerVersion,
} from "./update-release";

interface Entry {
  file: string;
  bytes: number;
  sha256: string;
}
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
export async function writeUpdateJson(path: string, value: unknown) {
  await writeFile(path + ".tmp", JSON.stringify(value));
  await rename(path + ".tmp", path);
}
export function programPath(file: string) {
  if (
    !/^app\/[a-zA-Z0-9_./-]+$/.test(file) ||
    file.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error("更新包包含不允许替换的路径");
  return file;
}
export async function verifyProgram(
  stage: string,
  version: string,
): Promise<Entry[]> {
  const manifest = JSON.parse(
    await readFile(join(stage, "manifest.json"), "utf8"),
  );
  if (!Array.isArray(manifest) || manifest.length > 5000)
    throw new Error("更新清单不正确");
  const entries: Entry[] = manifest.filter(
    (e) => typeof e.file === "string" && e.file.startsWith("app/"),
  );
  const seen = new Set<string>();
  for (const entry of entries) {
    const file = programPath(entry.file);
    if (seen.has(file.toLowerCase())) throw new Error("更新清单存在重复文件");
    seen.add(file.toLowerCase());
    const bytes = await readFile(join(stage, file));
    if (
      bytes.length !== entry.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== entry.sha256
    )
      throw new Error(`更新文件校验失败：${file}`);
  }
  if (
    ![
      "app/server.mjs",
      "app/updater.mjs",
      "app/build-info.json",
      "app/public/index.html",
    ].every((file) => seen.has(file))
  )
    throw new Error("程序包缺少启动文件");
  const info = JSON.parse(
    await readFile(join(stage, "app/build-info.json"), "utf8"),
  );
  if (
    info.product !== "fabula-table" ||
    info.version !== version ||
    info.updateProtocol !== 1
  )
    throw new Error("此版本需要新的安装器，未替换当前程序");
  return entries;
}
async function extractProgram(zip: string, stage: string) {
  if (process.platform !== "win32")
    throw new Error("当前在线更新器适用于 Windows 服务器");
  // Extract only program content and its manifest. No downloaded shell scripts are run.
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($env:FU_EXTRACT_ZIP)
try {
  $size = 0L
  foreach ($entry in $archive.Entries) {
    $name = $entry.FullName.Replace('\\', '/')
    if ($name -ne 'manifest.json' -and -not $name.StartsWith('app/')) { continue }
    if ($name -match '(^|/)\\.\\.?(/|$)' -or $name -match '[^a-zA-Z0-9_./-]') { throw 'Invalid update path' }
    $size += $entry.Length
    if ($size -gt 268435456) { throw 'Update archive exceeds size limit' }
    $target = Join-Path $env:FU_EXTRACT_DIR $name
    if ($name.EndsWith('/')) { [IO.Directory]::CreateDirectory($target) | Out-Null; continue }
    [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
  }
} finally { $archive.Dispose() }
`;
  await new Promise<void>((done, fail) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        env: { ...process.env, FU_EXTRACT_ZIP: zip, FU_EXTRACT_DIR: stage },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let error = "";
    child.stderr.on("data", (part) => {
      error = (error + part).slice(-2000);
    });
    child.on("error", fail);
    child.on("exit", (code) =>
      code === 0 ? done() : fail(new Error("更新包解压失败：" + error)),
    );
  });
}
export async function applyProgram(
  stage: string,
  root: string,
  entries: Entry[],
) {
  for (const entry of entries) {
    const target = join(root, programPath(entry.file));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(stage, entry.file), target);
  }
}
export async function runSupervisor(root: string) {
  root = resolve(root);
  const app = join(root, "app"),
    data = join(root, "data"),
    updates = join(root, "updates");
  if (resolve(process.env.FU_DATA_DIR || data) !== data)
    throw new Error("在线更新要求使用本安装目录的 data 文件夹");
  process.env.FU_UPDATE_ROOT = updates;
  await mkdir(updates, { recursive: true });
  const state = (phase: string, message: string, version?: string) =>
    writeUpdateJson(join(updates, "state.json"), {
      phase,
      message,
      version,
      at: new Date().toISOString(),
    });
  const read = async (file: string) => JSON.parse(await readFile(file, "utf8"));
  const currentVersion = async () =>
    (await read(join(app, "build-info.json"))).version as string;
  const transactionFile = join(updates, "transaction.json");
  const maintenance = join(updates, "maintenance"),
    requestFile = join(updates, "request.json");
  let child: ChildProcess | undefined,
    changing = true;
  function start() {
    child = spawn(process.execPath, [join(app, "server.mjs")], {
      cwd: root,
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    child.stdout?.on("data", (part) => console.log(part.toString().trimEnd()));
    child.stderr?.on("data", (part) =>
      console.error(part.toString().trimEnd()),
    );
    child.on("error", (e) => console.error("FU 服务启动失败", e));
    child.on("exit", (code) => {
      if (!changing) process.exit(code || 1);
    });
  }
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const active = child;
    const exited = new Promise<void>((done) =>
      active.once("exit", () => done()),
    );
    if (active.connected) active.send({ type: "fu:shutdown" });
    else active.kill();
    const timer = setTimeout(() => active.kill(), 15000);
    try {
      await exited;
    } finally {
      clearTimeout(timer);
    }
  }
  async function health(version: string) {
    let host = process.env.FU_HOST || "127.0.0.1";
    if (host === "0.0.0.0") host = "127.0.0.1";
    if (host === "::") host = "[::1]";
    const url = `http://${host}:${process.env.FU_PORT || "3340"}${process.env.FU_BASE_PATH || ""}/api/health`;
    const until = Date.now() + 60000;
    while (Date.now() < until) {
      if (child?.exitCode !== null && child?.exitCode !== undefined)
        throw new Error("服务进程提前退出，请查看 server.log");
      try {
        const result = await (
          await fetch(url, { signal: AbortSignal.timeout(1500) })
        ).json();
        if (
          result.ok &&
          result.product === "fabula-table" &&
          result.version === version
        )
          return;
      } catch {
        /* The child may still be opening its listening port. */
      }
      await delay(500);
    }
    throw new Error("新版服务未在一分钟内通过启动检查");
  }
  async function restore() {
    const transaction = await read(transactionFile);
    if (!/^backup-\d+-[a-f0-9-]{36}$/.test(transaction.backup))
      throw new Error("恢复目录记录不正确");
    const backup = join(updates, transaction.backup);
    await cp(join(backup, "app"), app, { recursive: true });
    // These paths are fixed children of this installation. The backup is complete before the journal is written.
    if (resolve(data) !== resolve(root, "data"))
      throw new Error("恢复路径不正确");
    for (const name of await readdir(data))
      await rm(join(data, name), { recursive: true, force: true });
    await cp(join(backup, "data"), data, { recursive: true });
    start();
    await health(transaction.previousVersion);
    await rm(transactionFile);
  }
  if (existsSync(transactionFile)) {
    await restore();
    await state(
      "failed",
      "上次更新被中断，已恢复更新前的程序和数据。",
      await currentVersion(),
    );
    await rm(requestFile, { force: true });
    await rm(maintenance, { force: true });
  } else {
    if (!existsSync(requestFile)) await rm(maintenance, { force: true });
    start();
    await health(await currentVersion());
  }
  changing = false;
  async function update() {
    if (changing || !existsSync(requestFile)) return;
    changing = true;
    let replacing = false;
    try {
      const request = await read(requestFile);
      const previousVersion = await currentVersion();
      if (!newerVersion(request.version, previousVersion))
        throw new Error("更新版本不高于当前版本");
      await state(
        "downloading",
        "正在下载并校验程序，世界数据保留。",
        request.version,
      );
      const release = await getProgramRelease(
        process.env.FU_UPDATE_REPO!,
        request.version,
      );
      if (!release) throw new Error("找不到指定正式版本");
      const stage = join(updates, "stage-" + randomUUID());
      await mkdir(stage);
      const zip = join(stage, "program.zip");
      await writeFile(zip, await downloadProgram(release));
      await extractProgram(zip, stage);
      const entries = await verifyProgram(stage, request.version);
      await state(
        "preparing",
        "正在备份程序、账号和世界素材。",
        request.version,
      );
      await stop();
      const backupName = "backup-" + Date.now() + "-" + randomUUID();
      const backup = join(updates, backupName);
      await mkdir(backup);
      await cp(app, join(backup, "app"), { recursive: true });
      await cp(data, join(backup, "data"), { recursive: true });
      await copyFile(join(root, ".env"), join(backup, ".env"));
      await writeUpdateJson(transactionFile, {
        backup: backupName,
        previousVersion,
        version: request.version,
      });
      replacing = true;
      await applyProgram(stage, root, entries);
      await state(
        "restarting",
        "程序已替换，正在检查新版是否可以正常启动。",
        request.version,
      );
      start();
      await health(request.version);
      await rm(transactionFile);
      replacing = false;
      await state(
        "complete",
        "更新完成，原来的世界、账号和素材已保留。",
        request.version,
      );
    } catch (error) {
      let message = (error as Error).message;
      if (replacing) {
        await stop();
        try {
          await restore();
          message += "；已恢复上一版程序和数据。";
        } catch (restoreError) {
          await state(
            "failed",
            message + "；恢复未完成：" + (restoreError as Error).message,
          );
          throw restoreError;
        }
      } else if (
        !child ||
        child.exitCode !== null ||
        child.signalCode !== null
      ) {
        start();
        await health(await currentVersion());
      }
      await state("failed", message);
    } finally {
      if (!existsSync(transactionFile)) {
        await rm(requestFile, { force: true });
        await rm(maintenance, { force: true });
      }
      changing = false;
    }
  }
  const poll = setInterval(() => {
    void update().catch((e) => {
      console.error("FU 更新失败", e);
      process.exit(1);
    });
  }, 1500);
  poll.unref();
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      changing = true;
      clearInterval(poll);
      void stop().finally(() => process.exit(0));
    });
}
