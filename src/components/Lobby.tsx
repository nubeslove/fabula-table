import { useEffect, useState } from "react";
import type { Session } from "../shared/types";
import { api } from "../lib/api";
import { Field, ErrorText, Modal } from "./Common";
import { ExpansionPicker } from "./ExpansionPicker";
import { ServerAdmin } from "./ServerAdmin";
import { SoundSettings } from "./InterfaceSound";
interface RoomCard {
  legacy: boolean;
  id: string;
  title: string;
  locked: boolean;
  members: number;
  role?: string;
  visited: number;
  expansions: string[];
}
interface LobbyData {
  account: { id: string; name: string } | null;
  rooms: RoomCard[];
  legacy?: { room: string; title: string; name: string };
}
export function Lobby({ enter }: { enter: (s: Session) => void }) {
  const [data, setData] = useState<LobbyData>(),
    [error, setError] = useState(""),
    [adminOpen, setAdminOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [auth, setAuth] = useState("login"),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [dialog, setDialog] = useState<{
      mode: "create" | "join" | "claim";
      room?: RoomCard;
    }>(),
    [worldName, setWorldName] = useState(""),
    [worldPassword, setWorldPassword] = useState(""),
    [oldName, setOldName] = useState(""),
    [key, setKey] = useState(""),
    [expansions, setExpansions] = useState<string[]>([]);
  const load = () =>
    api<LobbyData>("lobby")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(mode: "create" | "join" | "claim", room?: RoomCard) {
    setError("");
    setWorldPassword("");
    setOldName(
      data?.legacy?.room === room?.id
        ? (data?.legacy?.name ?? "")
        : (data?.account?.name ?? ""),
    );
    setDialog({ mode, room });
  }
  const rooms =
    data?.rooms.filter(
      (r) =>
        (filter === "all" ||
          (filter === "mine" && r.role === "gm") ||
          (filter === "recent" && r.role)) &&
        r.title.includes(search),
    ) ?? [];
  return (
    <main className="fu-lobby">
      <header className="lobby-header">
        <div>
          <span className="eyebrow">FABULA ULTIMA</span>
          <h1>物语大厅</h1>
        </div>
        <button onClick={() => setAdminOpen(true)}>服务器管理</button>
        <SoundSettings />
        {data?.account && (
          <div className="button-row">
            <span>{data.account.name}</span>
            <button
              onClick={() =>
                void run(async () => {
                  await api("account/logout", {});
                  await load();
                })
              }
            >
              退出账号
            </button>
          </div>
        )}
      </header>
      {adminOpen && <ServerAdmin close={() => setAdminOpen(false)} />}
      {!data ? (
        <div className="loading">
          正在寻找故事…
          <ErrorText text={error} />
        </div>
      ) : !data.account ? (
        <section className="lobby-auth">
          <div>
            <span className="brand-symbol">✦</span>
            <h2>回到我们的故事</h2>
            <p>登录一次，在不同世界间自由往来。角色与手记会在这里等你。</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api("account/" + auth, { name, password });
                setPassword("");
                await load();
              });
            }}
          >
            <div className="tabs">
              <button
                type="button"
                className={auth === "login" ? "selected" : ""}
                onClick={() => setAuth("login")}
              >
                登录
              </button>
              <button
                type="button"
                className={auth === "register" ? "selected" : ""}
                onClick={() => setAuth("register")}
              >
                注册账号
              </button>
            </div>
            <Field label="账号名">
              <input
                required
                maxLength={60}
                autoComplete="username"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="账号密码" hint="至少 8 位；世界密码由 GM 单独设置。">
              <input
                required
                minLength={8}
                maxLength={200}
                type="password"
                autoComplete={
                  auth === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <ErrorText text={error} />
            <button className="primary full" disabled={busy}>
              {busy ? "请稍候…" : auth === "login" ? "进入大厅" : "建立账号"}
            </button>
            <p className="muted">
              从旧版本升级？先注册统一账号，随后在世界条目中选择“认领旧身份”。
            </p>
          </form>
        </section>
      ) : (
        <>
          <div className="lobby-toolbar">
            <div className="tabs">
              {[
                ["all", "所有世界"],
                ["recent", "我加入的"],
                ["mine", "我主持的"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={filter === id ? "selected" : ""}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              aria-label="搜索世界"
              placeholder="寻找一个故事…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button onClick={() => void load()}>刷新</button>
            <button className="primary" onClick={() => open("create")}>
              ＋ 创建世界
            </button>
          </div>
          <ErrorText text={dialog ? "" : error} />
          {data.legacy && (
            <div className="notice">
              已找到原来的身份：{data.legacy.title} · {data.legacy.name}
              <button
                onClick={() =>
                  open(
                    "claim",
                    data.rooms.find((r) => r.id === data.legacy!.room),
                  )
                }
              >
                绑定到当前账号
              </button>
            </div>
          )}
          <section className="lobby-rooms" aria-label="世界列表">
            {rooms.length ? (
              rooms.map((r) => (
                <article className="lobby-room" key={r.id}>
                  <div className="lobby-world-mark">✦</div>
                  <div>
                    <small>
                      {r.role === "gm"
                        ? "由你主持"
                        : r.role
                          ? "继续旅程"
                          : r.locked
                            ? "密码世界"
                            : "开放世界"}
                    </small>
                    <h2>{r.title}</h2>
                    <p>
                      {r.members} 位成员 ·{" "}
                      {r.expansions.length
                        ? `${r.expansions.length} 个扩展`
                        : "核心规则"}
                    </p>
                  </div>
                  <div className="lobby-room-actions">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        r.role || !r.locked
                          ? void run(async () =>
                              enter(await api("enter", { room: r.id })),
                            )
                          : open("join", r)
                      }
                    >
                      {r.role ? "返回世界" : "进入世界"}
                    </button>
                    {r.legacy && r.role !== "gm" && (
                      <button onClick={() => open("claim", r)}>
                        认领旧身份
                      </button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="empty">
                这里还没有匹配的世界。创建世界，为故事点亮第一盏灯。
              </div>
            )}
          </section>
        </>
      )}
      {dialog && (
        <Modal
          title={
            dialog.mode === "create"
              ? "创建世界"
              : dialog.mode === "claim"
                ? "接续旧世界身份"
                : dialog.room!.title
          }
          onClose={() => setDialog(undefined)}
          error={error}
        >
          <form
            className="lobby-world-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const s =
                  dialog.mode === "create"
                    ? await api("worlds", {
                        title: worldName,
                        password: worldPassword,
                        creationKey: key,
                        expansions,
                      })
                    : await api(dialog.mode === "claim" ? "claim" : "enter", {
                        room: dialog.room!.id,
                        password: worldPassword,
                        name: oldName,
                      });
                enter(s);
              });
            }}
          >
            {dialog.mode === "create" && (
              <Field label="世界名称">
                <input
                  required
                  value={worldName}
                  onChange={(e) => setWorldName(e.target.value)}
                  maxLength={100}
                />
              </Field>
            )}
            {dialog.mode === "claim" && (
              <>
                <p>
                  验证这个世界原来的身份后，保留 GM
                  权限、人物与原来的名字。以后使用统一账号进入。
                </p>
                <Field label="原来的名字">
                  <input
                    required
                    value={oldName}
                    onChange={(e) => setOldName(e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field
              label={dialog.mode === "claim" ? "原来的登录口令" : "世界密码"}
              hint={
                dialog.mode === "create"
                  ? "留空即开放，玩家直接点击世界即可加入。"
                  : dialog.mode === "claim" &&
                      data?.legacy?.room === dialog.room?.id
                    ? "当前浏览器已验证原身份，可留空。"
                    : undefined
              }
            >
              <input
                type="password"
                autoComplete="off"
                value={worldPassword}
                onChange={(e) => setWorldPassword(e.target.value)}
                maxLength={200}
              />
            </Field>
            {dialog.mode === "create" && (
              <>
                <ExpansionPicker value={expansions} onChange={setExpansions} />
                <Field
                  label="建房钥匙"
                  hint="由服务器部署者提供；本机使用可留空。"
                >
                  <input
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  />
                </Field>
              </>
            )}
            <button className="primary full" disabled={busy}>
              {busy
                ? "正在准备…"
                : dialog.mode === "create"
                  ? "开启这个世界"
                  : dialog.mode === "claim"
                    ? "绑定身份并进入"
                    : "进入世界"}
            </button>
          </form>
        </Modal>
      )}
    </main>
  );
}
