import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { Identity, Session } from "../src/shared/types";
import { Store, randomKey } from "./store";
import { Accounts } from "./accounts";
import { lobbyRoutes } from "./lobby";
import { adminRoutes } from "./admin";
import { apply, project, referencedAssets } from "./world";
import * as v from "./validation";
import { compress, converterAvailable } from "./media";
import packageInfo from "../package.json";

const entry = dirname(fileURLToPath(import.meta.url));
const root = process.env.FU_PUBLIC_DIR
  ? resolve(process.env.FU_PUBLIC_DIR)
  : join(entry, "public");
const store = new Store(process.env.FU_DATA_DIR || join(process.cwd(), "data"));
const base = (process.env.FU_BASE_PATH || "").replace(/\/$/, "");
v.insist(!base || /^\/[a-zA-Z0-9/_-]+$/.test(base), "FU_BASE_PATH 格式不正确");
const port = Number(process.env.FU_PORT || 3340),
  host = process.env.FU_HOST || "127.0.0.1";
await store.init();
const secret = await store.secret();
const accounts = new Accounts(store.root);
await accounts.init();
const clients = new Map<string, Set<{ res: ServerResponse; me: Identity }>>();
const authAttempts = new Map<string, { at: number; count: number }>();
function rate(req: IncomingMessage) {
  const key = req.socket.remoteAddress || "local",
    now = Date.now();
  if (authAttempts.size > 5000)
    for (const [key, value] of authAttempts)
      if (now - value.at > 600000) authAttempts.delete(key);
  const item = authAttempts.get(key);
  if (!item || now - item.at > 600000)
    authAttempts.set(key, { at: now, count: 1 });
  else v.insist(++item.count <= 30, "尝试次数较多，请稍后再试", 429);
}
function token(room: string, user: string, lifetime = 30 * 86400) {
  const body = Buffer.from(
    JSON.stringify({ room, user, exp: Date.now() + lifetime * 1000 }),
  ).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret).update(body).digest("base64url")
  );
}
function cookie(req: IncomingMessage, name = "fu_session") {
  const raw = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
  v.insist(raw, "请先进入房间", 401);
  const [body, sig] = raw.split(".");
  v.insist(body && sig, "登录已失效", 401);
  const expected = createHmac("sha256", secret).update(body).digest();
  let supplied = Buffer.from(sig, "base64url");
  v.insist(
    expected.length === supplied.length && timingSafeEqual(expected, supplied),
    "登录已失效",
    401,
  );
  let data;
  try {
    data = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    throw new v.UserError("登录已失效", 401);
  }
  v.insist(data.exp > Date.now(), "登录已过期", 401);
  return data as { room: string; user: string };
}
async function auth(req: IncomingMessage) {
  const { room: roomId, user } = cookie(req),
    room = await store.get(roomId),
    u = room.users.find((x) => x.id === user);
  v.insist(u, "登录已失效", 401);
  return { room, me: { id: u.id, name: u.name, role: u.role } as Identity };
}
function addCookie(res: ServerResponse, value: string) {
  const old = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [
    ...(Array.isArray(old) ? old.map(String) : old ? [String(old)] : []),
    value,
  ]);
}
function setCookie(
  res: ServerResponse,
  room: string,
  user: string,
  name = "fu_session",
  lifetime = 30 * 86400,
) {
  addCookie(
    res,
    `${name}=${token(room, user, lifetime)}; Path=${base || "/"}; HttpOnly; SameSite=Strict; Max-Age=${lifetime}${process.env.FU_PUBLIC_URL?.startsWith("https:") ? "; Secure" : ""}`,
  );
}
function clearCookie(res: ServerResponse, name: string) {
  addCookie(
    res,
    `${name}=; Path=${base || "/"}; HttpOnly; SameSite=Strict; Max-Age=0`,
  );
}
async function body(req: IncomingMessage, max = 2 * 1024 * 1024) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    v.insist(size <= max, "文件过大", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function jsonBody(req: IncomingMessage) {
  try {
    return v.obj(JSON.parse((await body(req)).toString("utf8")));
  } catch (e) {
    if (e instanceof v.UserError) throw e;
    throw new v.UserError("请求内容不是有效数据");
  }
}
function send(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
function snapshot(
  room: Awaited<ReturnType<Store["get"]>>,
  me: Identity,
): Session {
  return {
    world: project(room.world, me),
    serverTime: Date.now(),
    me,
    accountLinked: !!room.users.find((u) => u.id === me.id)?.accountId,
    ...(me.role === "gm" ? { preloadKey: room.preloadKey } : {}),
  };
}
async function broadcast(id: string) {
  const room = await store.get(id);
  for (const client of clients.get(id) ?? []) {
    if (client.res.writableLength > 2 * 1024 * 1024) {
      client.res.end();
      continue;
    }
    client.res.write(`data: ${JSON.stringify(snapshot(room, client.me))}\n\n`);
  }
}
const lobby = lobbyRoutes({
  store,
  accounts,
  read: jsonBody,
  send,
  account: (req) => accounts.get(cookie(req, "fu_account").user),
  cookie,
  set: setCookie,
  clear: clearCookie,
  broadcast,
  rate,
  session: async (res, roomId, userId) => {
    const room = await store.get(roomId),
      u = room.users.find((u) => u.id === userId)!;
    setCookie(res, roomId, userId);
    send(res, snapshot(room, { id: u.id, name: u.name, role: u.role }));
  },
});
const admin = adminRoutes({
  read: jsonBody,
  send,
  rate,
  cookie,
  set: setCookie,
  clear: clearCookie,
  online: () =>
    [...clients.values()].reduce((n, connections) => n + connections.size, 0),
});
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ogg": "audio/ogg",
};
function mediaType(buf: Buffer) {
  if (buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return "image/jpeg";
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (["GIF87a", "GIF89a"].includes(buf.toString("ascii", 0, 6)))
    return "image/gif";
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WAVE"
  )
    return "audio/wav";
  if (buf.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    return "video/webm";
  if (buf.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  if (
    buf.toString("ascii", 0, 3) === "ID3" ||
    (buf[0] === 255 && (buf[1] & 0xe0) === 0xe0)
  )
    return "audio/mpeg";
  return "";
}
async function serveAsset(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  roomId: string,
  assetId: string,
) {
  const room = await store.get(v.id(roomId));
  let allowed = false;
  if (url.searchParams.get("key") === room.preloadKey)
    allowed = room.world.assets.some((a) => a.id === assetId && a.preload);
  if (!allowed) {
    const current = await auth(req);
    v.insist(current.room.world.id === roomId, "无权读取此素材", 403);
    allowed =
      current.me.role === "gm" ||
      referencedAssets(room.world, current.me).has(assetId);
  }
  v.insist(allowed, "素材未开放", 403);
  const asset = room.world.assets.find((a) => a.id === assetId);
  v.insist(asset, "素材不存在", 404);
  const p = join(store.root, "assets", asset.hash);
  const info = await stat(p);
  const common = {
    "Content-Type": asset.mime,
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range) {
    const start = Number(range[1]),
      end = Math.min(Number(range[2] || info.size - 1), info.size - 1);
    v.insist(start <= end && start < info.size, "范围无效", 416);
    res.writeHead(206, {
      ...common,
      "Content-Range": `bytes ${start}-${end}/${info.size}`,
      "Content-Length": end - start + 1,
    });
    createReadStream(p, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...common, "Content-Length": info.size });
    createReadStream(p).pipe(res);
  }
}
const server = createServer(async (req, res) => {
  try {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );
    let path = url.pathname;
    if (base) {
      if (path === base) {
        res.writeHead(302, { Location: base + "/" });
        res.end();
        return;
      }
      v.insist(path.startsWith(base + "/"), "入口不存在", 404);
      path = path.slice(base.length);
    }
    if (req.method === "POST") {
      v.insist(req.headers["x-fu-request"] === "1", "请求来源不正确", 403);
      if (req.headers.origin) {
        const origin = new URL(req.headers.origin);
        v.insist(
          origin.host === req.headers.host ||
            origin.origin === process.env.FU_PUBLIC_URL,
          "请求来源不正确",
          403,
        );
      }
    }
    if (path === "/api/health") {
      send(res, {
        ok: true,
        product: "fabula-table",
        version: packageInfo.version,
      });
      return;
    }
    if (await admin.handle(path, req, res)) return;
    if (path.startsWith("/api/"))
      v.insist(
        !admin.maintenance(),
        "服务器正在更新，请稍候；原数据会保留",
        503,
      );
    if (path.startsWith("/api/")) admin.activity();
    if (await lobby(path, req, res)) return;
    if (path === "/api/session") {
      const { room, me } = await auth(req);
      send(res, snapshot(room, me));
      return;
    }
    if (path === "/api/logout" && req.method === "POST") {
      res.setHeader(
        "Set-Cookie",
        `fu_session=; Path=${base || "/"}; HttpOnly; SameSite=Strict; Max-Age=0`,
      );
      send(res, { ok: true });
      return;
    }
    const preload = path.match(/^\/api\/preload\/([a-zA-Z0-9_-]+)$/);
    if (preload) {
      const room = await store.get(preload[1]);
      v.insist(
        url.searchParams.get("key") === room.preloadKey,
        "预下载链接已失效",
        403,
      );
      send(res, {
        title: room.world.title,
        assets: room.world.assets.filter((a) => a.preload),
        world: room.world.id,
      });
      return;
    }
    const assetMatch = path.match(
      /^\/api\/assets\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/,
    );
    if (assetMatch) {
      await serveAsset(req, res, url, assetMatch[1], assetMatch[2]);
      return;
    }
    if (path === "/api/events") {
      const { room, me } = await auth(req);
      v.insist(!admin.maintenance(), "服务器正在更新，请稍候再进入世界", 503);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(`data: ${JSON.stringify(snapshot(room, me))}\n\n`);
      const set = clients.get(room.world.id) ?? new Set();
      clients.set(room.world.id, set);
      v.insist(set.size < 100, "房间连接过多", 429);
      const client = { res, me };
      set.add(client);
      const timer = setInterval(() => res.write(": alive\n\n"), 25000);
      req.on("close", () => {
        clearInterval(timer);
        set.delete(client);
        if (!set.size) clients.delete(room.world.id);
      });
      return;
    }
    if (path === "/api/command" && req.method === "POST") {
      const { room, me } = await auth(req),
        command = await jsonBody(req);
      await store.change(room.world.id, (r) => apply(r.world, me, command));
      send(res, snapshot(await store.get(room.world.id), me));
      await broadcast(room.world.id);
      return;
    }
    if (path === "/api/preload-key" && req.method === "POST") {
      const { room, me } = await auth(req);
      v.insist(me.role === "gm", "仅 GM 可以更换链接", 403);
      await store.change(room.world.id, (r) => {
        r.preloadKey = randomKey();
      });
      send(res, snapshot(await store.get(room.world.id), me));
      await broadcast(room.world.id);
      return;
    }
    if (path === "/api/media") {
      send(res, { converter: await converterAvailable() });
      return;
    }
    if (path === "/api/upload" && req.method === "POST") {
      const { room, me } = await auth(req);
      v.insist(me.role === "gm", "素材由 GM 上传", 403);
      const source = await body(req, 100 * 1024 * 1024),
        sourceMime = mediaType(source);
      v.insist(
        sourceMime,
        "请上传 WebP / GIF 图片、MP4 / WebM 视频或 MP3 / Ogg / WAV 音频",
      );
      const sourceHash = createHash("sha256").update(source).digest("hex");
      const existing = room.world.assets.find(
        (a) => a.sourceHash === sourceHash,
      );
      if (existing) {
        send(res, { asset: existing, converted: false });
        return;
      }
      const { data, mime, converted } = await compress(source, sourceMime);
      const hash = createHash("sha256").update(data).digest("hex");
      let name = decodeURIComponent(
        String(req.headers["x-file-name"] || "素材"),
      ).slice(0, 200);
      if (converted)
        name =
          name.replace(/\.[^.]+$/, "") +
          (mime === "video/webm" ? ".webm" : ".ogg");
      const asset = {
        id: hash,
        hash,
        name,
        mime,
        size: data.length,
        preload: false,
        sourceHash,
      };
      await writeFile(join(store.root, "assets", hash), data, {
        flag: "wx",
      }).catch((e) => {
        if (e.code !== "EEXIST") throw e;
      });
      await store.change(room.world.id, (r) => {
        if (!r.world.assets.some((a) => a.id === hash)) {
          v.insist(r.world.assets.length < 2000, "房间素材超过 2000 项");
          r.world.assets.push(asset);
          r.world.revision++;
        }
      });
      send(res, { asset, converted });
      await broadcast(room.world.id);
      return;
    }
    if (path === "/api/export") {
      const { room, me } = await auth(req);
      v.insist(me.role === "gm", "仅 GM 可以备份", 403);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="fu-${room.world.id}.json"`,
      );
      send(res, room.world);
      return;
    }
    if (path.startsWith("/api/")) throw new v.UserError("接口不存在", 404);
    v.insist(req.method === "GET" || req.method === "HEAD", "方法不支持", 405);
    const relative = decodeURIComponent(path).replace(/^\/+/, ""),
      file = resolve(root, relative || "index.html");
    v.insist(
      file.startsWith(resolve(root) + "/") ||
        file.startsWith(resolve(root) + "\\") ||
        file === join(root, "index.html"),
      "路径不正确",
      403,
    );
    let data: Buffer;
    try {
      data = await readFile(file);
    } catch {
      throw new v.UserError("页面不存在，请先构建网页或使用开发入口", 404);
    }
    const headers: Record<string, string> = {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control":
        relative.startsWith("assets/") ||
        /^official\/fu-[0-9]+\//.test(relative)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    };
    // Let the browser read Ogg end metadata and seek the small lobby loop.
    if (extname(file) === ".ogg") {
      headers["Accept-Ranges"] = "bytes";
      const range =
        req.method === "GET" && req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
      if (range && (range[1] || range[2])) {
        const size = data.length;
        const start = range[1]
          ? Number(range[1])
          : Math.max(0, size - Number(range[2]));
        const end =
          range[1] && range[2]
            ? Math.min(Number(range[2]), size - 1)
            : size - 1;
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          start >= size
        ) {
          res.writeHead(416, {
            ...headers,
            "Content-Range": `bytes */${size}`,
          });
          res.end();
          return;
        }
        res.writeHead(206, {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        });
        res.end(data.subarray(start, end + 1));
        return;
      }
    }
    if (
      req.headers["accept-encoding"]?.includes("gzip") &&
      data.length > 1024 &&
      [".js", ".css", ".json", ".html", ".svg"].includes(extname(file))
    ) {
      data = gzipSync(data);
      headers["Content-Encoding"] = "gzip";
      headers.Vary = "Accept-Encoding";
    }
    headers["Content-Length"] = String(data.length);
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (e) {
    const error =
      e instanceof v.UserError
        ? e
        : new v.UserError("服务暂时无法完成操作，请稍后重试", 500);
    if (!(e instanceof v.UserError))
      console.error(
        "request failed",
        e instanceof Error ? e.message : "unknown",
      );
    if (!res.headersSent) send(res, { error: error.message }, error.status);
    else res.end();
  }
});
process.on("message", (message) => {
  if (
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "fu:shutdown"
  ) {
    for (const connections of clients.values())
      for (const client of connections) client.res.end();
    server.close(() => process.exit(0));
  }
});
server.listen(port, host, () =>
  console.log(`最终物语已启动：http://${host}:${port}${base}/`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const set of clients.values()) for (const c of set) c.res.end();
    server.close(() => process.exit(0));
  });
