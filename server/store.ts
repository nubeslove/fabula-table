import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import { type Account, makePassword, matchesPassword } from "./accounts";
import { join, resolve } from "node:path";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { World, Identity } from "../src/shared/types";
import { newWorld } from "../src/shared/rules";
import { insist, UserError, id } from "./validation";
const scrypt = promisify(scryptCallback);
export interface Room {
  password?: { salt: string; hash: string };
  world: World;
  invite: string;
  preloadKey: string;
  users: (Identity & {
    salt: string;
    hash: string;
    accountId?: string;
    visited?: number;
  })[];
}
export const randomKey = () => randomBytes(24).toString("base64url");
async function passwordHash(password: string, salt: string) {
  return ((await scrypt(password, salt, 64)) as Buffer).toString("hex");
}
export class Store {
  readonly root: string;
  private rooms = new Map<string, Room>();
  private queues = new Map<string, Promise<unknown>>();
  constructor(root: string) {
    this.root = resolve(root);
  }
  async init() {
    await mkdir(join(this.root, "rooms"), { recursive: true });
    await mkdir(join(this.root, "assets"), { recursive: true });
  }
  async secret() {
    const p = join(this.root, "server-key");
    try {
      return await readFile(p, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      const key = randomKey();
      await writeFile(p, key, { mode: 0o600, flag: "wx" });
      return key;
    }
  }
  async get(roomId: string) {
    id(roomId);
    if (this.rooms.has(roomId)) return this.rooms.get(roomId)!;
    try {
      const room = JSON.parse(
        await readFile(join(this.root, "rooms", roomId + ".json"), "utf8"),
      ) as Room;
      room.world.journal ??= [];
      this.rooms.set(roomId, room);
      return room;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        throw new UserError("找不到这个房间", 404);
      throw e;
    }
  }
  private async save(room: Room) {
    const p = join(this.root, "rooms", room.world.id + ".json"),
      tmp = p + ".tmp";
    await writeFile(tmp, JSON.stringify(room), { mode: 0o600 });
    await rename(tmp, p);
    this.rooms.set(room.world.id, room);
  }
  async change<T>(
    roomId: string,
    fn: (room: Room) => T | Promise<T>,
  ): Promise<T> {
    const work = (this.queues.get(roomId) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const room = structuredClone(await this.get(roomId));
        const result = await fn(room);
        await this.save(room);
        return result;
      });
    this.queues.set(roomId, work);
    try {
      return await work;
    } finally {
      if (this.queues.get(roomId) === work) this.queues.delete(roomId);
    }
  }
  async create(title: string, name: string, password: string) {
    const roomId = randomBytes(6).toString("hex"),
      me: Identity = { id: randomBytes(12).toString("hex"), name, role: "gm" },
      salt = randomKey();
    const room: Room = {
      world: newWorld(roomId, title, me),
      invite: randomKey(),
      preloadKey: randomKey(),
      users: [{ ...me, salt, hash: await passwordHash(password, salt) }],
    };
    await this.save(room);
    return { room, me };
  }
  async login(roomId: string, name: string, password: string, invite: string) {
    return this.change(roomId, async (room) => {
      let user = room.users.find((u) => u.name === name);
      if (user) {
        const hash = await passwordHash(password, user.salt);
        insist(
          timingSafeEqual(
            Buffer.from(hash, "hex"),
            Buffer.from(user.hash, "hex"),
          ),
          "名字或口令不正确",
          401,
        );
      } else {
        throw new UserError("请用统一账号从大厅加入世界", 403);
      }
      return { id: user.id, name: user.name, role: user.role } as Identity;
    });
  }
  async list(accountId?: string) {
    const rooms = await Promise.all(
      (await readdir(join(this.root, "rooms")))
        .filter((f) => /^[a-zA-Z0-9_-]+\.json$/.test(f))
        .map((f) => this.get(f.slice(0, -5))),
    );
    return rooms
      .map((r) => {
        const member = accountId
          ? r.users.find((u) => u.accountId === accountId)
          : undefined;
        return {
          id: r.world.id,
          title: r.world.title,
          locked: !!r.password,
          members: r.users.length,
          legacy: r.users.some((u) => !u.accountId),
          role: member?.role,
          visited: member?.visited ?? 0,
          expansions: r.world.expansions ?? [],
        };
      })
      .sort(
        (a, b) =>
          b.visited - a.visited || a.title.localeCompare(b.title, "zh-CN"),
      );
  }
  async createForAccount(
    title: string,
    account: Account,
    password: string,
    expansions: string[],
  ) {
    const roomId = randomBytes(6).toString("hex"),
      me: Identity = {
        id: randomBytes(12).toString("hex"),
        name: account.name,
        role: "gm",
      };
    const room: Room = {
      world: { ...newWorld(roomId, title, me), expansions },
      invite: randomKey(),
      preloadKey: randomKey(),
      password: password ? makePassword(password) : undefined,
      users: [
        {
          ...me,
          ...makePassword(randomKey()),
          accountId: account.id,
          visited: Date.now(),
        },
      ],
    };
    await this.save(room);
    return { room, me };
  }
  async enter(roomId: string, account: Account, password: string) {
    return this.change(roomId, (r) => {
      let user = r.users.find((u) => u.accountId === account.id);
      if (!user) {
        insist(
          !r.password || matchesPassword(password, r.password),
          "世界密码不正确",
          403,
        );
        insist(r.users.length < 40, "房间人数已达 40 人");
        // A name is not proof of ownership. Legacy members are claimed explicitly.
        insist(
          !r.users.some((u) => u.name === account.name && !u.accountId),
          "世界中有同名旧身份，请先用原口令认领",
        );
        user = {
          id: randomBytes(12).toString("hex"),
          name: account.name,
          role: "player",
          accountId: account.id,
          ...makePassword(randomKey()),
        };
        r.users.push(user);
        r.world.members.push({ id: user.id, name: user.name, role: user.role });
      }
      user.visited = Date.now();
      this.presence(r, user, "进入了世界");
      return { id: user.id, name: user.name, role: user.role } as Identity;
    });
  }
  async claim(
    roomId: string,
    account: Account,
    name: string,
    password: string,
    provenId?: string,
  ) {
    return this.change(roomId, (r) => {
      const u = r.users.find((u) =>
        provenId ? u.id === provenId : u.name === name,
      );
      insist(
        u && (provenId || matchesPassword(password, u)),
        "原名字或口令不正确",
        401,
      );
      insist(
        !u.accountId || u.accountId === account.id,
        "这个身份已经绑定另一个账号",
        403,
      );
      const prior = r.users.find(
        (other) => other.accountId === account.id && other.id !== u.id,
      );
      if (prior) {
        // Recover an accidental first join without merging or discarding authored game data.
        insist(
          prior.role === "player" &&
            !r.world.characters.some((c) => c.owner === prior.id) &&
            !r.world.journal.some((entry) => entry.author === prior.id),
          "当前身份已有人物或日志，请先由 GM 整理归属，或使用尚未加入此世界的账号认领",
        );
        r.users = r.users.filter((other) => other.id !== prior.id);
        r.world.members = r.world.members.filter(
          (other) => other.id !== prior.id,
        );
      }
      u.accountId = account.id;
      u.visited = Date.now();
      this.presence(r, u, "绑定了统一账号");
      return { id: u.id, name: u.name, role: u.role } as Identity;
    });
  }
  presence(room: Room, me: Identity, text: string) {
    room.world.logs.push({
      id: randomKey(),
      at: Date.now(),
      kind: "system",
      channel: "system",
      author: me.id,
      actor: "",
      name: me.name,
      text: me.name + " " + text,
    });
    room.world.logs = room.world.logs.slice(-300);
    room.world.revision++;
  }
}
