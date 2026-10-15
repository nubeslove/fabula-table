"use strict";
var FuSound = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/lib/interface-audio.ts
  var interface_audio_exports = {};
  __export(interface_audio_exports, {
    DEFAULT_SOUND: () => DEFAULT_SOUND,
    InterfaceAudio: () => InterfaceAudio,
    soundPreferences: () => soundPreferences
  });
  var DEFAULT_SOUND = {
    music: true,
    effects: true,
    musicVolume: 28,
    effectsVolume: 30
  };
  function soundPreferences(value) {
    const p = value && typeof value === "object" ? value : {};
    const volume = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : fallback;
    return {
      music: typeof p.music === "boolean" ? p.music : true,
      effects: typeof p.effects === "boolean" ? p.effects : true,
      musicVolume: volume(p.musicVolume, 28),
      effectsVolume: volume(p.effectsVolume, 30)
    };
  }
  var InterfaceAudio = class {
    constructor(env, prefs = DEFAULT_SOUND) {
      this.env = env;
      this.preferences = soundPreferences(prefs);
    }
    scene = "silent";
    visible = true;
    unlocked = false;
    status = "waiting";
    preferences;
    music;
    voices = [];
    effectPool = /* @__PURE__ */ new Map();
    fade;
    attempt = 0;
    pending = false;
    lastHover = -Infinity;
    lastPress = -Infinity;
    listeners = /* @__PURE__ */ new Set();
    subscribe(fn) {
      this.listeners.add(fn);
      return () => {
        this.listeners.delete(fn);
      };
    }
    changed() {
      for (const fn of this.listeners) fn();
    }
    canPlayMusic() {
      return this.scene === "lobby" && this.visible && this.unlocked && this.preferences.music && this.preferences.musicVolume > 0;
    }
    configure(prefs) {
      this.preferences = soundPreferences({ ...this.preferences, ...prefs });
      this.stopEffects();
      if (this.music) this.music.volume = this.preferences.musicVolume / 100;
      this.syncMusic();
      this.changed();
    }
    setScene(scene) {
      if (this.scene === scene) return;
      this.scene = scene;
      this.stopEffects();
      this.syncMusic();
      this.changed();
    }
    setVisible(visible) {
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
    stopEffects() {
      this.voices.forEach((v) => v.pause());
      this.voices = [];
    }
    syncMusic() {
      if (!this.canPlayMusic()) {
        this.attempt++;
        this.pending = false;
        if (this.fade) this.env.cancel(this.fade);
        this.music?.pause();
        if (this.music && this.scene !== "lobby") this.music.currentTime = 0;
        this.status = this.scene === "lobby" && !this.unlocked && this.preferences.music ? "waiting" : "stopped";
        return;
      }
      if (this.pending || this.music && !this.music.paused) return;
      const voice = this.music ??= this.env.audio("lobby-harp.ogg");
      voice.loop = true;
      voice.volume = 0;
      const attempt = ++this.attempt;
      this.pending = true;
      void voice.play().then(() => {
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
          voice.volume = this.preferences.musicVolume / 100 * progress;
          if (progress < 1) this.fade = this.env.later(tick, 40);
        };
        tick();
      }).catch(() => {
        if (attempt !== this.attempt) return;
        this.pending = false;
        this.status = "unavailable";
        this.changed();
      });
    }
    cue(cue) {
      if (!this.visible || !this.unlocked || this.scene === "silent" || !this.preferences.effects || !this.preferences.effectsVolume)
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
      while (this.voices.length >= 2) this.voices.shift().pause();
      const pool = this.effectPool.get(cue) ?? [];
      let voice = pool.find((v) => v.paused);
      if (!voice) {
        voice = this.env.audio(`ui-${cue}.ogg`);
        pool.push(voice);
        this.effectPool.set(cue, pool);
      }
      voice.currentTime = 0;
      voice.volume = this.preferences.effectsVolume / 100 * (this.scene === "world" ? 1 / 3 : 1) * (cue === "hover" ? 0.6 : 1);
      this.voices.push(voice);
      void voice.play().catch(() => {
      });
    }
    dispose() {
      this.setScene("silent");
      this.unlocked = false;
      this.stopEffects();
    }
  };
  return __toCommonJS(interface_audio_exports);
})();
