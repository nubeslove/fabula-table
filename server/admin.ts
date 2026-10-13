import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { insist, str } from "./validation";
import {
  getProgramRelease,
  newerVersion,
  type ProgramRelease,
} from "./update-release";
import packageInfo from "../package.json";

export function adminRoutes(ctx: {
  read: (req: IncomingMessage) => Promise<Record<string, unknown>>;
  send: (res: ServerResponse, value: unknown) => void;
  rate: (req: IncomingMessage) => void;
  cookie: (
    req: IncomingMessage,
    name: string,
  ) => { room: string; user: string };
  set: (
    res: ServerResponse,
    room: string,
    user: string,
    name: string,
    lifetime: number,
  ) => void;
  clear: (res: ServerResponse, name: string) => void;
  online: () => number;
}) {
  const root = process.env.FU_UPDATE_ROOT;
  const repo = process.env.FU_UPDATE_REPO;
  const key = process.env.FU_ADMIN_KEY;
  const keyHash = createHash("sha256")
    .update(key || "disabled")
    .digest("hex");
  let latest: ProgramRelease | null = null;
  let checking = false;
  let lastCheck = 0;
  const automatic = process.env.FU_AUTO_UPDATE === "1";
  let idleSince = Date.now(),
    lastAutoCheck = 0,
    autoBusy = false,
    autoError = "";
  const autoRecord = root ? join(root, "auto-check.json") : "";
  const autoReady = root
    ? readFile(autoRecord, "utf8")
        .then((text) => {
          lastAutoCheck = Number(JSON.parse(text).at) || 0;
        })
        .catch((e) => {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT")
            autoError = "自动更新记录无法读取，请手动检查更新";
        })
    : Promise.resolve();
  let reserving = false;
  const maintenance = () =>
    reserving || (!!root && existsSync(join(root, "maintenance")));
  async function status() {
    let update;
    if (root) {
      try {
        update = JSON.parse(await readFile(join(root, "state.json"), "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    return {
      version: packageInfo.version,
      enabled: !!root && !!repo && !!key,
      repository: repo ? `https://github.com/${repo}` : null,
      online: ctx.online(),
      maintenance: maintenance(),
      automatic,
      autoError,
      lastAutoCheck,
      latest: latest
        ? {
            version: latest.version,
            notes: latest.notes,
            page: latest.page,
            size: latest.size,
            available: newerVersion(latest.version, packageInfo.version),
          }
        : null,
      update,
    };
  }
  async function enqueue(version: string) {
    insist(root && repo, "在线更新未启用", 503);
    insist(
      ctx.online() === 0,
      "还有玩家在世界中，请让大家返回大厅后再更新",
      409,
    );
    insist(!maintenance(), "更新正在进行", 409);
    reserving = true;
    try {
      await mkdir(root, { recursive: true });
      insist(ctx.online() === 0, "有玩家刚进入世界，请稍后再更新", 409);
      await writeFile(join(root, "maintenance"), "updating", { flag: "wx" });
      const request = { version, id: randomUUID() };
      await writeFile(join(root, "request.tmp"), JSON.stringify(request));
      await rename(join(root, "request.tmp"), join(root, "request.json"));
    } catch (e) {
      await rm(join(root, "maintenance"), { force: true });
      throw e;
    } finally {
      reserving = false;
    }
  }
  async function autoTick(now = Date.now()) {
    await autoReady;
    if (ctx.online() > 0) {
      idleSince = now;
      return;
    }
    if (
      !automatic ||
      !root ||
      !repo ||
      !key ||
      autoBusy ||
      maintenance() ||
      now - idleSince < 600000 ||
      now - lastAutoCheck < 86400000
    )
      return;
    autoBusy = true;
    try {
      const found = await getProgramRelease(repo);
      latest = found;
      // A player may have re-entered while GitHub was responding.
      if (ctx.online() > 0 || Date.now() - idleSince < 600000) return;
      await mkdir(root, { recursive: true });
      await writeFile(autoRecord, JSON.stringify({ at: now }));
      lastAutoCheck = now;
      autoError = "";
      if (found && newerVersion(found.version, packageInfo.version))
        await enqueue(found.version);
    } catch (e) {
      autoError = (e as Error).message;
      lastAutoCheck = now - 23 * 3600000; // Network failures wait an hour before retrying.
    } finally {
      autoBusy = false;
    }
  }
  if (automatic && root && repo && key) {
    const timer = setInterval(() => {
      void autoTick();
    }, 60000);
    timer.unref();
  }
  return {
    maintenance,
    activity: () => {
      idleSince = Date.now();
    },
    autoTick,
    async handle(path: string, req: IncomingMessage, res: ServerResponse) {
      if (!path.startsWith("/api/admin/")) return false;
      insist(key, "此部署尚未设置服务器管理密码", 503);
      if (path === "/api/admin/login" && req.method === "POST") {
        ctx.rate(req);
        const a = await ctx.read(req);
        const supplied = createHash("sha256").update(str(a.key, 200)).digest();
        insist(
          timingSafeEqual(supplied, Buffer.from(keyHash, "hex")),
          "服务器管理密码不正确",
          403,
        );
        ctx.set(res, "server-admin", keyHash, "fu_admin", 1800);
        ctx.send(res, await status());
        return true;
      }
      const identity = ctx.cookie(req, "fu_admin");
      insist(
        identity.room === "server-admin" && identity.user === keyHash,
        "请先验证服务器管理密码",
        401,
      );
      if (path === "/api/admin/status" && req.method === "GET")
        ctx.send(res, await status());
      else if (path === "/api/admin/logout" && req.method === "POST") {
        ctx.clear(res, "fu_admin");
        ctx.send(res, { ok: true });
      } else if (path === "/api/admin/check" && req.method === "POST") {
        insist(repo && root, "请使用新版 Windows 安装入口启用在线更新", 503);
        insist(
          !checking && Date.now() - lastCheck >= 10000,
          "请稍候再检查更新",
          429,
        );
        checking = true;
        try {
          latest = await getProgramRelease(repo);
          lastCheck = Date.now();
        } finally {
          checking = false;
        }
        ctx.send(res, await status());
      } else if (path === "/api/admin/update" && req.method === "POST") {
        const a = await ctx.read(req);
        insist(
          latest &&
            a.version === latest.version &&
            newerVersion(latest.version, packageInfo.version),
          "请先检查并选择可用的新版本",
          409,
        );
        await enqueue(latest.version);
        ctx.send(res, { ...(await status()), maintenance: true });
      } else insist(false, "管理入口不存在", 404);
      return true;
    },
  };
}
