// Runs as the deployment's service account. Never import or start the application.
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  lstatSync,
  openSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const target = resolve(process.argv[2]);
const launchEnv = { ...process.env };
let failed = false;
const result = (label, action) => {
  try {
    const detail = action();
    console.log(`[通过] ${label}${detail ? `：${detail}` : ""}`);
  } catch (error) {
    failed = true;
    // Configuration contents and environment values are deliberately excluded.
    console.log(`[失败] ${label}：${error.code || error.name}`);
    if (error.path) console.log(`文件：${error.path}`);
  }
};
console.log(`Node：${process.version}`);
console.log(`部署目录：${target}`);
result("进入部署目录", () => process.chdir(target));
for (const file of ["launch.mjs", "app/server.mjs", ".env"]) {
  result(`路径解析 ${file}`, () => realpathSync(join(target, file)));
  result(`读取 ${file}`, () => {
    const fd = openSync(join(target, file), "r");
    closeSync(fd);
  });
}
result("解析配置（不输出内容）", () => {
  if (existsSync(join(target, ".env")))
    process.loadEnvFile(join(target, ".env"));
});
for (const file of ["launch.mjs", "app/server.mjs"]) {
  console.log(`--- Node 检查 ${file}（仅检查，不执行） ---`);
  const checked = spawnSync(process.execPath, ["--check", join(target, file)], {
    cwd: target,
    env: launchEnv,
    windowsHide: true,
    encoding: "utf8",
    timeout: 10000,
  });
  console.log(`退出码：${checked.status}`);
  if (checked.error) console.log(`运行错误：${checked.error.code}`);
  // These are distributed program sources, never .env or user data.
  const text = [checked.stdout, checked.stderr].filter(Boolean).join("\n");
  if (text) console.log(text.slice(-12000));
  if (checked.status !== 0) failed = true;
}
const logDir = join(target, "logs");
result("日志目录与写入权限", () => {
  const stat = lstatSync(logDir);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Object.assign(new Error(), { code: "NOT_A_REGULAR_LOG_DIRECTORY" });
  const file = join(logDir, `.fu-diagnostic-${randomUUID()}.tmp`);
  let created = false;
  try {
    const fd = openSync(file, "wx");
    created = true;
    closeSync(fd);
    writeFileSync(file, "FU diagnostic write check\n");
  } finally {
    if (created) unlinkSync(file);
  }
  return "可写；临时测试文件已删除";
});
if (existsSync(join(logDir, "server.log"))) {
  result("打开现有 server.log 追加句柄（不写入内容）", () => {
    const fd = openSync(join(logDir, "server.log"), "a");
    closeSync(fd);
  });
}
const data = resolve(target, process.env.FU_DATA_DIR || "data");
result("读取数据目录", () => accessSync(data, constants.R_OK));
result("读取原服务器密钥（不输出内容）", () => {
  const fd = openSync(join(data, "server-key"), "r");
  closeSync(fd);
});
console.log(
  failed
    ? "检查发现失败项，见上方具体步骤。"
    : "上述启动前检查均通过。需要结合升级时的原始启动错误继续定位。",
);
process.exitCode = failed ? 1 : 0;
