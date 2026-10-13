import {
  existsSync,
  mkdirSync,
  createWriteStream,
  appendFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Console } from "node:console";

const root = dirname(fileURLToPath(import.meta.url));
process.chdir(root);
if (process.argv.includes("--background")) {
  mkdirSync(join(root, "logs"), { recursive: true });
  const path = join(root, "logs/server.log");
  const log = createWriteStream(path, { flags: "a" });
  globalThis.console = new Console(log, log);
  process.on("uncaughtExceptionMonitor", (error) => {
    appendFileSync(
      path,
      `${new Date().toISOString()} ${error.stack ?? error}\n`,
    );
  });
}
try {
  console.log(
    `${new Date().toISOString()} FU 启动（${process.version}；PID ${process.pid}）`,
  );
  const config = join(root, ".env");
  if (existsSync(config)) process.loadEnvFile(config);
  process.env.FU_DATA_DIR ||= join(root, "data");
  process.env.FU_PUBLIC_DIR ||= join(root, "app/public");
  process.env.FU_HOST ||= "127.0.0.1";
  process.env.FU_PORT ||= "3340";
  const address =
    process.env.FU_PUBLIC_URL || `http://127.0.0.1:${process.env.FU_PORT}`;
  console.log(`访问地址：${address}${process.env.FU_BASE_PATH || ""}/`);
  if (process.env.FU_UPDATE_REPO) {
    const { runSupervisor } = await import(pathToFileURL(join(root, "update-runner.mjs")).href);
    await runSupervisor(root);
  } else {
    await import(pathToFileURL(join(root, "app/server.mjs")).href);
  }
} catch (error) {
  console.error("FU 启动失败：", error);
  process.exitCode = 1;
}
