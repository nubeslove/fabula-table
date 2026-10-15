import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { InterfaceAudio, type SoundScene } from "../lib/interface-audio";
import "../styles/interface-sound.css";

const SoundContext = createContext<InterfaceAudio | null>(null);
const STORAGE_KEY = "fu-interface-sound-v1";
export function InterfaceSoundProvider({ children }: { children: ReactNode }) {
  const ref = useRef<InterfaceAudio>();
  if (!ref.current) {
    let prefs: unknown;
    try {
      prefs = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    } catch {
      /* local preference only */
    }
    ref.current = new InterfaceAudio(
      {
        audio: (file) => {
          const audio = new Audio(
            new URL(`audio/${file}`, document.baseURI).href,
          );
          audio.preload = "auto";
          return audio;
        },
        now: () => performance.now(),
        later: (fn, ms) => setTimeout(fn, ms),
        cancel: (timer) => clearTimeout(timer),
      },
      prefs,
    );
  }
  const sound = ref.current;
  useEffect(() => {
    const unlock = (e: Event) => {
      if (e.isTrusted) sound.unlock();
    };
    const target = (e: Event) => {
      const element =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>(
              'button, a[href], summary, [role="button"]',
            )
          : null;
      return element &&
        !element.matches(
          ':disabled, [aria-disabled="true"], [data-sound="none"]',
        )
        ? element
        : null;
    };
    const click = (e: MouseEvent) => {
      const el = target(e);
      if (e.isTrusted && el)
        sound.cue(
          el.dataset.sound === "back"
            ? "back"
            : el.dataset.sound === "open"
              ? "open"
              : "press",
        );
    };
    const hover = (e: PointerEvent) => {
      const el = target(e);
      if (
        e.isTrusted &&
        e.pointerType !== "touch" &&
        el &&
        !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))
      )
        sound.cue("hover");
    };
    const visibility = () =>
      sound.setVisible(document.visibilityState === "visible");
    visibility();
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("click", click, true);
    document.addEventListener("pointerover", hover, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("pointerover", hover, true);
      document.removeEventListener("visibilitychange", visibility);
      sound.dispose();
    };
  }, [sound]);
  return (
    <SoundContext.Provider value={sound}>{children}</SoundContext.Provider>
  );
}
export function useSoundScene(scene: SoundScene) {
  const sound = useContext(SoundContext);
  useLayoutEffect(() => {
    sound?.setScene(scene);
    return () => sound?.setScene("silent");
  }, [sound, scene]);
}
export function SoundSettings() {
  const sound = useContext(SoundContext)!;
  const [, render] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => sound.subscribe(() => render((n) => n + 1)), [sound]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const p = sound.preferences;
  const update = (value: Partial<typeof p>) => {
    sound.configure(value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sound.preferences));
    } catch {
      /* works without persistence */
    }
  };
  const world = sound.scene === "world";
  return (
    <div className="sound-settings" ref={box}>
      <button
        ref={button}
        type="button"
        aria-label="声音设置"
        title="声音设置"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-sound="open"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M3 9h4l5-4v14l-5-4H3zM16 8c3 2 3 6 0 8M19 5c5 4 5 10 0 14" />
          {!p.music && !p.effects && <path d="m3 3 18 18" />}
        </svg>
      </button>
      {open && (
        <section className="sound-popover" aria-label="本机声音设置">
          <header>
            <strong>声音</strong>
            <button
              type="button"
              aria-label="关闭声音设置"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>
          <label className="sound-switch">
            <input
              type="checkbox"
              checked={p.music}
              onChange={(e) => update({ music: e.target.checked })}
            />
            <b>大厅音乐</b>
            <small>
              {world
                ? "世界内已停止"
                : sound.status === "playing"
                  ? "正在播放"
                  : "宁静启程"}
            </small>
          </label>
          <label className="sound-range">
            <span>音乐音量</span>
            <input
              aria-label="大厅音乐音量"
              type="range"
              min="0"
              max="100"
              value={p.musicVolume}
              onChange={(e) => update({ musicVolume: +e.target.value })}
            />
            <output>{p.musicVolume}%</output>
          </label>
          {!world && p.music && sound.status !== "playing" && (
            <button className="sound-play" onClick={() => sound.unlock()}>
              播放大厅音乐
            </button>
          )}
          <label className="sound-switch">
            <input
              type="checkbox"
              checked={p.effects}
              onChange={(e) => update({ effects: e.target.checked })}
            />
            <b>交互音效</b>
            <small>{world ? "轻声 · 大厅的 ⅓" : "轻触与点击"}</small>
          </label>
          <label className="sound-range">
            <span>音效音量</span>
            <input
              aria-label="交互音效音量"
              type="range"
              min="0"
              max="100"
              value={p.effectsVolume}
              onChange={(e) => update({ effectsVolume: +e.target.value })}
            />
            <output>{p.effectsVolume}%</output>
          </label>
          <footer>
            <button
              data-sound="none"
              onClick={() => {
                sound.unlock();
                sound.cue("press");
              }}
            >
              试听轻触
            </button>
            <small>仅本机生效 · 不影响场景音乐</small>
          </footer>
        </section>
      )}
    </div>
  );
}
