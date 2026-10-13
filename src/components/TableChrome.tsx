import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Identity, Session } from "../shared/types";
import { Modal } from "./Common";

const PAGES = [
  ["世界设置", "M12 3v18 M3 12h18 M5 5l14 14 M5 19L19 5"],
  [
    "人物",
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M19 8v6 M16 11h6",
  ],
  ["场景", "M3 3l6 3 6-3 6 3v15l-6-3-6 3-6-3z M9 6v15 M15 3v15"],
  ["工具", "M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10 M7 5l10 5"],
  [
    "日志",
    "M5 3h13a2 2 0 0 1 2 2v16H6a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2z M3 17h17 M8 7h7 M8 11h5",
  ],
  [
    "规则书",
    "M12 5c-3-2-7-2-10 0v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-2-10 0z M12 5v15",
  ],
  ["素材与分享", "M4 4h16v16H4z M4 16l5-5 4 4 3-3 4 4 M15 7h.01"],
] as const;

export function UiIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export function TableHeader({
  title,
  me,
  connected,
  page,
  open,
  chat,
  toggleChat,
  leave,
}: {
  title: string;
  me: Identity;
  connected: boolean;
  page: string;
  open: (page: string) => void;
  chat: boolean;
  toggleChat: () => void;
  leave: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const pages = PAGES.filter(
    ([name]) => me.role === "gm" || (name !== "场景" && name !== "世界设置"),
  );
  const choose = (name: string) => {
    open(name);
    setMenu(false);
  };
  return (
    <>
      <header className="table-header">
        <button
          className="table-brand"
          onClick={() => choose("舞台")}
          title="回到舞台"
          aria-label="回到舞台"
        >
          <span aria-hidden="true">✦</span>
          <div>
            <strong>最终物语</strong>
            <small>{title}</small>
          </div>
        </button>
        <nav className="table-navigation" aria-label="跑团面板">
          {pages.map(([name, path]) => (
            <button
              key={name}
              title={name}
              aria-label={name}
              aria-pressed={page === name}
              className={page === name ? "selected" : ""}
              onClick={() => open(page === name ? "舞台" : name)}
            >
              <UiIcon path={path} />
              <span>{name === "素材与分享" ? "素材" : name}</span>
            </button>
          ))}
        </nav>
        <div className="table-header-actions">
          <span
            className={`table-presence ${connected ? "online" : ""}`}
            title={`${me.name} · ${me.role === "gm" ? "GM" : "玩家"} · ${connected ? "已连接" : "重连中"}`}
          >
            <i />
            <span>{me.name}</span>
            <b>{me.role === "gm" ? "GM" : "玩家"}</b>
          </span>
          <button
            className="table-menu-button"
            onClick={() => setMenu(true)}
            aria-label="打开功能菜单"
            title="功能菜单"
          >
            <UiIcon path="M4 6h16 M4 12h16 M4 18h16" />
          </button>
          <button
            className={chat ? "selected" : ""}
            onClick={toggleChat}
            aria-label={chat ? "收起聊天栏" : "打开聊天栏"}
            aria-expanded={chat}
            title={chat ? "收起聊天栏" : "打开聊天栏"}
          >
            <UiIcon path="M21 11a8 8 0 0 1-8 8H8l-6 3 2-6a8 8 0 0 1-2-5 8 8 0 0 1 8-8h3a8 8 0 0 1 8 8z M7 9h9 M7 13h6" />
          </button>
          <button onClick={leave} aria-label="返回大厅" title="返回大厅">
            <UiIcon path="M9 3H4v18h5 M14 8l5 4-5 4 M8 12h11" />
          </button>
        </div>
      </header>
      {menu && (
        <Modal title="跑团工具" onClose={() => setMenu(false)}>
          <nav className="table-menu-grid" aria-label="跑团功能">
            {pages.map(([name, path]) => (
              <button key={name} onClick={() => choose(name)}>
                <UiIcon path={path} />
                <span>{name}</span>
              </button>
            ))}
          </nav>
        </Modal>
      )}
    </>
  );
}

export function TableDrawer({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    button.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [title]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [close]);
  return (
    <aside
      className="table-drawer"
      data-panel={title}
      aria-label={`${title}面板`}
      role="dialog"
      aria-modal="false"
    >
      <header>
        <h2>{title === "工具" ? "行动与冲突" : title}</h2>
        <button
          ref={button}
          onClick={close}
          aria-label="关闭面板"
          title="返回舞台"
        >
          <span>返回舞台</span> ×
        </button>
      </header>
      <div
        className={`table-drawer-body ${["人物", "场景", "规则书", "素材与分享", "工具"].includes(title) ? "bounded-drawer-body" : ""}`}
      >
        {children}
      </div>
    </aside>
  );
}

export function FirstCharacterPrompt({
  session: { world, me },
  create,
  prepare,
}: {
  session: Session;
  create: () => void;
  prepare: () => void;
}) {
  const key = `fu-first-character:${world.id}:${me.id}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const needsCharacter =
    me.role === "gm"
      ? !world.characters.length
      : !world.characters.some((c) => c.owner === me.id);
  const close = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* This session can still dismiss the prompt in memory. */
    }
  };
  if (dismissed || !needsCharacter) return null;
  return (
    <Modal
      title={me.role === "gm" ? "准备你们的第一幕" : "让你的旅人加入故事"}
      onClose={close}
    >
      <div className="first-character-prompt">
        <span aria-hidden="true">✦</span>
        <p>
          舞台已经准备好了。先创建人物，属性与职业会帮助你完成建卡，也可以随时加入自己的设定。
        </p>
        <button
          className="primary"
          onClick={() => {
            close();
            create();
          }}
        >
          创建第一位旅人
        </button>
        {me.role === "gm" && (
          <button
            onClick={() => {
              close();
              prepare();
            }}
          >
            先准备场景
          </button>
        )}
        <button className="quiet" onClick={close}>
          稍后创建，先看舞台
        </button>
        <small>之后可从顶部“人物”再次打开建卡。</small>
      </div>
    </Modal>
  );
}
