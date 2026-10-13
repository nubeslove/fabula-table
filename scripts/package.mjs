import {
  mkdir,
  copyFile,
  cp,
  readdir,
  stat,
  writeFile,
  rm,
  readFile,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(projectRoot);
const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw new Error("Invalid release version");
const built = JSON.parse(await readFile("dist/build-info.json", "utf8"));
if (built.version !== version)
  throw new Error("Please build the current version before packaging");
const deployFiles = [
  "install.bat",
  "start.bat",
  "stop.bat",
  "manage-windows.ps1",
  "upgrade-support.ps1",
  "update-runner.mjs",
  "start.cmd",
  "start-windows.ps1",
  "windows-common.ps1",
  "deploy-windows.cmd",
  "deploy-windows.ps1",
  "launch.mjs",
  "start.sh",
  "deploy.sh",
  "nginx-fu.conf",
  "使用说明.md",
];

async function archive(name, kind) {
  const destination = resolve(projectRoot, "release", name);
  const packagedApp = resolve(destination, "app");
  if (packagedApp !== resolve(projectRoot, "release", name, "app"))
    throw new Error("Unexpected package output directory");
  await mkdir(destination, { recursive: true });
  // Only replace generated application output. Adjacent data and .env stay intact.
  await rm(packagedApp, { recursive: true, force: true });
  if (kind === "rules") {
    await cp("dist/public/official", join(packagedApp, "public/official"), {
      recursive: true,
    });
  } else {
    const official = resolve("dist/public/official");
    await cp("dist", packagedApp, {
      recursive: true,
      filter: (source) => kind !== "program" || resolve(source) !== official,
    });
  }
  const files =
    kind === "rules"
      ? ["资源包说明.md"]
      : kind === "upgrade"
        ? [
            ...deployFiles,
            "upgrade-windows.cmd",
            "upgrade-windows.ps1",
            "升级说明.md",
          ]
        : deployFiles;
  if (kind === "rules") {
    await writeFile(
      join(destination, files[0]),
      "# 最终物语 · 官方规则文本包\n\n将 app 目录合并复制到已有 FU 部署目录中；保留已有程序文件、data 与 .env。此包只包含可搜索规则文本与校验清单，不包含 GM 世界素材或原始规则附件。\n\n首次部署请使用完整包；程序更新包不重复携带此处的官方资源。\n",
    );
  } else {
    for (const file of files)
      await copyFile(file === "update-runner.mjs" ? "dist/updater.mjs" : join("deploy", file), join(destination, file));
  }
  const manifest = [];
  async function scan(dir, relative) {
    for (const file of await readdir(dir, { withFileTypes: true })) {
      const rel = relative + "/" + file.name;
      const path = join(dir, file.name);
      if (file.isDirectory()) await scan(path, rel);
      else await record(path, rel);
    }
  }
  async function record(path, file) {
    const data = await readFile(path);
    manifest.push({
      file,
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  }
  await scan(packagedApp, "app");
  for (const file of files) await record(join(destination, file), file);
  await writeFile(
    join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  // Explicit allowlist: never include a deployment's data, credentials, or unrelated files.
  const entries = ["app", ...files, "manifest.json"];
  const output = resolve(
    "release",
    name + (process.platform === "win32" ? ".zip" : ".tar.gz"),
  );
  let result;
  if (process.platform === "win32") {
    const quote = (p) => "'" + p.replaceAll("'", "''") + "'";
    result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -LiteralPath ${entries.map((file) => quote(join(destination, file))).join(",")} -DestinationPath ${quote(output)} -Force`,
      ],
      { stdio: "inherit", windowsHide: true },
    );
  } else {
    result = spawnSync("tar", ["-czf", output, "-C", destination, ...entries], {
      stdio: "inherit",
    });
  }
  if (result.status !== 0) throw new Error(`Failed to archive ${name}`);
  const info = {
    kind,
    file: output,
    bytes: (await stat(output)).size,
    files: manifest.length,
  };
  console.log(JSON.stringify(info));
  return info;
}

const releases = [];
releases.push(await archive(`fabula-table-upgrade-${version}`, "upgrade"));
releases.push(await archive(`fabula-table-${version}`, "full"));
releases.push(await archive(`fabula-table-program-${version}`, "program"));
releases.push(await archive(`fabula-table-rules-${version}`, "rules"));
await writeFile(
  "release/发行清单.json",
  JSON.stringify({ version, releases }, null, 2),
);
