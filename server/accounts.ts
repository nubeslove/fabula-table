import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { insist } from "./validation";
export interface Account {
  id: string;
  name: string;
  salt: string;
  hash: string;
}
export const makePassword = (password: string) => {
  const salt = randomBytes(24).toString("hex");
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
};
export const matchesPassword = (
  password: string,
  saved: { salt: string; hash: string },
) => {
  const hash = Buffer.from(saved.hash, "hex");
  return (
    hash.length === 64 &&
    timingSafeEqual(scryptSync(password, saved.salt, 64), hash)
  );
};
export class Accounts {
  private values: Account[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private root: string) {}
  async init() {
    try {
      this.values = JSON.parse(
        await readFile(join(this.root, "accounts.json"), "utf8"),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  get(id: string) {
    const a = this.values.find((a) => a.id === id);
    insist(a, "请登录账号", 401);
    return a;
  }
  async register(name: string, password: string) {
    const job = this.queue
      .catch(() => {})
      .then(async () => {
        insist(
          !this.values.some(
            (a) => a.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
          ),
          "这个账号名已被使用",
        );
        const a = {
          id: randomBytes(12).toString("hex"),
          name,
          ...makePassword(password),
        };
        const next = [...this.values, a],
          path = join(this.root, "accounts.json");
        await writeFile(path + ".tmp", JSON.stringify(next), { mode: 0o600 });
        await rename(path + ".tmp", path);
        this.values = next;
        return a;
      });
    this.queue = job;
    return job;
  }
  login(name: string, password: string) {
    const a = this.values.find(
      (a) => a.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    insist(a && matchesPassword(password, a), "账号或密码不正确", 401);
    return a;
  }
}
