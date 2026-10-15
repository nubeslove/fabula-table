import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { Command } from "../shared/types";
import { Modal } from "./Common";

type Target = {
  id: string;
  name: string;
  type: "character.delete" | "scene.delete" | "asset.delete";
  detail: string;
};
export function useEntryDeleteMenu(
  act: (command: Command) => Promise<boolean>,
) {
  const [menu, setMenu] = useState<{
    target: Target;
    x: number;
    y: number;
  } | null>(null);
  const [pending, setPending] = useState<Target | null>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        e.stopPropagation();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [menu]);
  const show = (e: MouseEvent, target: Target) => {
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({
      target,
      x: Math.max(8, Math.min(e.clientX || r.left, window.innerWidth - 232)),
      y: Math.max(8, Math.min(e.clientY || r.bottom, window.innerHeight - 100)),
    });
  };
  return {
    bind: (target: Target, allowed = true) =>
      allowed ? { onContextMenu: (e: MouseEvent) => show(e, target) } : {},
    button: (target: Target, allowed = true) =>
      allowed && (
        <button
          className="entry-more"
          aria-label={`更多操作：${target.name}`}
          title="更多操作（也可右键条目）"
          onClick={(e) => show(e, target)}
        >
          ⋯
        </button>
      ),
    view: (
      <>
        {menu &&
          createPortal(
            <div
              ref={ref}
              className="entry-context-menu"
              role="menu"
              aria-label={`${menu.target.name}的操作`}
              style={{ left: menu.x, top: menu.y }}
            >
              <strong title={menu.target.name}>{menu.target.name}</strong>
              <button
                role="menuitem"
                className="danger"
                onClick={() => {
                  setFailure("");
                  setPending(menu.target);
                  setMenu(null);
                }}
              >
                删除…
              </button>
            </div>,
            document.body,
          )}
        {pending && (
          <Modal
            title={`删除「${pending.name}」？`}
            error={failure}
            onClose={() => !busy && setPending(null)}
          >
            <p>{pending.detail}</p>
            <p>历史聊天与日志会保留。确认后从本世界删除此条目。</p>
            <div className="delete-actions">
              <button disabled={busy} onClick={() => setPending(null)}>
                取消
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (await act({ type: pending.type, id: pending.id }))
                      setPending(null);
                    else
                      setFailure("删除未完成。请核对条目与权限，刷新后重试。");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "正在删除…" : "确认删除"}
              </button>
            </div>
          </Modal>
        )}
      </>
    ),
  };
}
