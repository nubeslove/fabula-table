import type { IncomingMessage, ServerResponse } from "node:http";
import type { Store } from "./store";
import type { Accounts, Account } from "./accounts";
import { makePassword } from "./accounts";
import { checkedExpansions } from "../src/shared/expansions";
import { str, id, insist } from "./validation";

export function lobbyRoutes(ctx: {
  store: Store;
  accounts: Accounts;
  read: (req: IncomingMessage) => Promise<Record<string, unknown>>;
  send: (res: ServerResponse, data: unknown) => void;
  account: (req: IncomingMessage) => Account;
  cookie: (req: IncomingMessage) => { room: string; user: string };
  set: (res: ServerResponse, room: string, user: string, name?: string) => void;
  clear: (res: ServerResponse, name: string) => void;
  session: (res: ServerResponse, room: string, user: string) => Promise<void>;
  broadcast: (room: string) => Promise<void>;
  rate: (req: IncomingMessage) => void;
}) {
  const { store, accounts, read, send } = ctx;
  return async (path: string, req: IncomingMessage, res: ServerResponse) => {
    if (path === "/api/lobby" && req.method === "GET") {
      let account: Account | undefined, legacy;
      try {
        account = ctx.account(req);
      } catch {}
      try {
        const c = ctx.cookie(req),
          r = await store.get(c.room),
          u = r.users.find((u) => u.id === c.user);
        if (u && !u.accountId)
          legacy = { room: c.room, title: r.world.title, name: u.name };
      } catch {}
      send(res, {
        account: account ? { id: account.id, name: account.name } : null,
        rooms: await store.list(account?.id),
        legacy,
      });
      return true;
    }
    if (
      !path.startsWith("/api/account/") &&
      ![
        "/api/worlds",
        "/api/enter",
        "/api/claim",
        "/api/leave",
        "/api/settings",
      ].includes(path)
    )
      return false;
    insist(req.method === "POST", "请求方式不正确", 405);
    if (path === "/api/account/logout") {
      ctx.clear(res, "fu_account");
      ctx.clear(res, "fu_session");
      send(res, { ok: true });
      return true;
    }
    const a = await read(req);
    if (path === "/api/account/register" || path === "/api/account/login") {
      ctx.rate(req);
      const name = str(a.name, 60).trim(),
        password = str(a.password, 200);
      insist(name && password.length >= 8, "请填写账号名和至少 8 位的账号密码");
      const account = path.endsWith("register")
        ? await accounts.register(name, password)
        : accounts.login(name, password);
      ctx.set(res, "account", account.id, "fu_account");
      // Keep a verified old session available for the explicit migration flow only.
      try {
        const c = ctx.cookie(req),
          r = await store.get(c.room),
          u = r.users.find((u) => u.id === c.user);
        if (u?.accountId && u.accountId !== account.id)
          ctx.clear(res, "fu_session");
      } catch {}
      send(res, { id: account.id, name: account.name });
      return true;
    }
    if (path === "/api/leave") {
      const c = ctx.cookie(req);
      await store.change(c.room, (r) => {
        const u = r.users.find((u) => u.id === c.user);
        if (u) store.presence(r, u, "返回了大厅");
      });
      ctx.clear(res, "fu_session");
      send(res, { ok: true });
      await ctx.broadcast(c.room);
      return true;
    }
    const account = ctx.account(req);
    if (path === "/api/worlds") {
      ctx.rate(req);
      if (process.env.FU_CREATE_KEY)
        insist(
          a.creationKey === process.env.FU_CREATE_KEY,
          "建房钥匙不正确",
          403,
        );
      else
        insist(
          ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress ?? "",
          ) && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? ""),
          "部署者需要配置建房钥匙",
          403,
        );
      const title = str(a.title, 100).trim();
      insist(title, "请填写世界名称");
      const { room, me } = await store.createForAccount(
        title,
        account,
        str(a.password ?? "", 200),
        checkedExpansions(a.expansions),
      );
      await ctx.session(res, room.world.id, me.id);
      return true;
    }
    if (path === "/api/enter" || path === "/api/claim") {
      ctx.rate(req);
      const roomId = id(a.room);
      let me;
      if (path.endsWith("claim")) {
        let proven: string | undefined;
        try {
          const c = ctx.cookie(req);
          if (c.room === roomId) {
            const old = (await store.get(roomId)).users.find(
              (u) => u.id === c.user,
            );
            if (old && !old.accountId) proven = c.user;
          }
        } catch {}
        me = await store.claim(
          roomId,
          account,
          str(a.name ?? "", 60),
          str(a.password ?? "", 200),
          proven,
        );
      } else
        me = await store.enter(roomId, account, str(a.password ?? "", 200));
      await ctx.session(res, roomId, me.id);
      await ctx.broadcast(roomId);
      return true;
    }
    if (path === "/api/settings") {
      const c = ctx.cookie(req);
      await store.change(c.room, (r) => {
        const u = r.users.find(
          (u) => u.id === c.user && u.accountId === account.id,
        );
        insist(u?.role === "gm", "只有 GM 能设置世界", 403);
        if (a.title !== undefined) {
          const title = str(a.title, 100).trim();
          insist(title, "请填写世界名称");
          r.world.title = title;
        }
        if (a.password !== undefined) {
          const pwd = str(a.password, 200);
          r.password = pwd ? makePassword(pwd) : undefined;
        }
        if (a.expansions !== undefined)
          r.world.expansions = checkedExpansions(a.expansions);
        store.presence(r, u, "更新了世界设置");
      });
      await ctx.session(res, c.room, c.user);
      await ctx.broadcast(c.room);
      return true;
    }
    return false;
  };
}
