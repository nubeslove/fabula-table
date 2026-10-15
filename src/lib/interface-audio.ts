export type SoundScene = "silent" | "lobby" | "world";
export type SoundCue = "hover" | "press" | "open" | "back";
export interface SoundPreferences {
  music: boolean;
  effects: boolean;
  musicVolume: number;
  effectsVolume: number;
}
export const DEFAULT_SOUND: SoundPreferences = {
  music: true,
  effects: true,
  musicVolume: 28,
  effectsVolume: 30,
};
export function soundPreferences(value: unknown): SoundPreferences {
  const p = (
    value && typeof value === "object" ? value : {}
  ) as Partial<SoundPreferences>;
  const volume = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.max(0, Math.min(100, v))
      : fallback;
  return {
    music: typeof p.music === "boolean" ? p.music : true,
    effects: typeof p.effects === "boolean" ? p.effects : true,
    musicVolume: volume(p.musicVolume, 28),
    effectsVolume: volume(p.effectsVolume, 30),
  };
}
export interface AudioVoice {
  volume: number;
  loop: boolean;
  currentTime: number;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
}
interface SoundEnvironment {
  audio: (file: string) => AudioVoice;
  now: () => number;
  later: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
}

/** Owns only local interface sounds; never touches GM scene audio. */
export class InterfaceAudio {
  scene: SoundScene = "silent";
  visible = true;
  unlocked = false;
  status: "waiting" | "playing" | "stopped" | "unavailable" = "waiting";
  preferences: SoundPreferences;
  private music?: AudioVoice;
  private voices: AudioVoice[] = [];
  private effectPool = new Map<SoundCue, AudioVoice[]>();
  private fade?: ReturnType<typeof setTimeout>;
  private attempt = 0;
  private pending = false;
  private lastHover = -Infinity;
  private lastPress = -Infinity;
  private listeners = new Set<() => void>();
  constructor(
    private env: SoundEnvironment,
    prefs: unknown = DEFAULT_SOUND,
  ) {
    this.preferences = soundPreferences(prefs);
  }
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private changed() {
    for (const fn of this.listeners) fn();
  }
  private canPlayMusic() {
    return (
      this.scene === "lobby" &&
      this.visible &&
      this.unlocked &&
      this.preferences.music &&
      this.preferences.musicVolume > 0
    );
  }
  configure(prefs: Partial<SoundPreferences>) {
    this.preferences = soundPreferences({ ...this.preferences, ...prefs });
    this.stopEffects();
    if (this.music) this.music.volume = this.preferences.musicVolume / 100;
    this.syncMusic();
    this.changed();
  }
  setScene(scene: SoundScene) {
    if (this.scene === scene) return;
    this.scene = scene;
    this.stopEffects();
    this.syncMusic();
    this.changed();
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    if (!visible) this.stopEffects();
    this.syncMusic();
    this.changed();
  }
  unlock() {
    this.unlocked = true;
    this.syncMusic();
    this.changed();
  }
  private stopEffects() {
    this.voices.forEach((v) => v.pause());
    this.voices = [];
  }
  private syncMusic() {
    if (!this.canPlayMusic()) {
      this.attempt++;
      this.pending = false;
      if (this.fade) this.env.cancel(this.fade);
      this.music?.pause();
      if (this.music && this.scene !== "lobby") this.music.currentTime = 0;
      this.status =
        this.scene === "lobby" && !this.unlocked && this.preferences.music
          ? "waiting"
          : "stopped";
      return;
    }
    if (this.pending || (this.music && !this.music.paused)) return;
    const voice = (this.music ??= this.env.audio("lobby-harp.ogg"));
    voice.loop = true;
    voice.volume = 0;
    const attempt = ++this.attempt;
    this.pending = true;
    void voice
      .play()
      .then(() => {
        if (attempt !== this.attempt) {
          if (!this.canPlayMusic()) voice.pause();
          return;
        }
        this.pending = false;
        if (!this.canPlayMusic()) {
          voice.pause();
          return;
        }
        this.status = "playing";
        this.changed();
        const start = this.env.now();
        const tick = () => {
          if (attempt !== this.attempt || !this.canPlayMusic()) return;
          const progress = Math.min(1, (this.env.now() - start) / 800);
          voice.volume = (this.preferences.musicVolume / 100) * progress;
          if (progress < 1) this.fade = this.env.later(tick, 40);
        };
        tick();
      })
      .catch(() => {
        if (attempt !== this.attempt) return;
        this.pending = false;
        this.status = "unavailable";
        this.changed();
      });
  }
  cue(cue: SoundCue) {
    if (
      !this.visible ||
      !this.unlocked ||
      this.scene === "silent" ||
      !this.preferences.effects ||
      !this.preferences.effectsVolume
    )
      return;
    const now = this.env.now();
    if (cue === "hover") {
      if (now - Math.max(this.lastHover, this.lastPress) < 180) return;
      this.lastHover = now;
    } else {
      if (now - this.lastPress < 80) return;
      this.lastPress = now;
    }
    this.voices = this.voices.filter((v) => !v.paused);
    while (this.voices.length >= 2) this.voices.shift()!.pause();
    const pool = this.effectPool.get(cue) ?? [];
    let voice = pool.find((v) => v.paused);
    if (!voice) {
      voice = this.env.audio(`ui-${cue}.ogg`);
      pool.push(voice);
      this.effectPool.set(cue, pool);
    }
    voice.currentTime = 0;
    voice.volume =
      (this.preferences.effectsVolume / 100) *
      (this.scene === "world" ? 1 / 3 : 1) *
      (cue === "hover" ? 0.6 : 1);
    this.voices.push(voice);
    void voice.play().catch(() => {});
  }
  dispose() {
    this.setScene("silent");
    this.unlocked = false;
    this.stopEffects();
  }
}
