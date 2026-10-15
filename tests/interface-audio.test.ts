import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InterfaceAudio,
  soundPreferences,
  type AudioVoice,
} from "../src/lib/interface-audio";

function setup(pending = false) {
  let now = 1000;
  const voices: (AudioVoice & { file: string; finish?: () => void })[] = [];
  const timers = new Map<number, () => void>();
  let next = 0;
  const sound = new InterfaceAudio({
    audio: (file) => {
      const voice = {
        file,
        volume: 1,
        loop: false,
        currentTime: 0,
        paused: true,
        play() {
          this.paused = false;
          return pending && file.startsWith("lobby")
            ? new Promise<void>((resolve) => {
                voice.finish = resolve;
              })
            : Promise.resolve();
        },
        pause() {
          this.paused = true;
        },
        finish: undefined as (() => void) | undefined,
      };
      voices.push(voice);
      return voice;
    },
    now: () => now,
    later: (fn) => {
      timers.set(++next, fn);
      return next as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: (id) => {
      timers.delete(id as unknown as number);
    },
  });
  return {
    sound,
    voices,
    advance(ms: number) {
      now += ms;
      const fns = [...timers.values()];
      timers.clear();
      fns.forEach((fn) => fn());
    },
  };
}
test("lobby requires a gesture, fades in, and stops and rewinds on entering a world", async () => {
  const { sound, voices, advance } = setup();
  sound.setScene("lobby");
  assert.equal(voices.length, 0);
  sound.unlock();
  await Promise.resolve();
  advance(800);
  assert.equal(voices[0].volume, 0.28);
  assert.equal(voices[0].loop, true);
  voices[0].currentTime = 22;
  sound.setScene("world");
  assert.equal(voices[0].paused, true);
  assert.equal(voices[0].currentTime, 0);
  sound.unlock();
  assert.equal(voices.length, 1);
});
test("a late play promise cannot restart lobby music inside a world", async () => {
  const { sound, voices, advance } = setup(true);
  sound.setScene("lobby");
  sound.unlock();
  sound.setScene("world");
  voices[0].finish!();
  await Promise.resolve();
  advance(1000);
  assert.equal(voices[0].paused, true);
  assert.equal(sound.status, "stopped");
});
test("hidden pages pause all sounds; returning resumes only in the lobby", async () => {
  const { sound, voices } = setup();
  sound.setScene("lobby");
  sound.unlock();
  await Promise.resolve();
  sound.setVisible(false);
  sound.cue("press");
  assert.equal(voices.length, 1);
  assert.equal(voices[0].paused, true);
  sound.setVisible(true);
  await Promise.resolve();
  assert.equal(voices[0].paused, false);
  sound.setScene("world");
  sound.setVisible(false);
  sound.setVisible(true);
  assert.equal(voices[0].paused, true);
});
test("world effects are quiet, hover is throttled and at most two voices overlap", () => {
  const { sound, voices, advance } = setup();
  sound.setScene("world");
  sound.unlock();
  sound.cue("hover");
  sound.cue("hover");
  assert.equal(voices.length, 1);
  assert.ok(Math.abs(voices[0].volume - 0.06) < 0.001);
  sound.cue("press");
  sound.cue("press");
  assert.equal(voices.length, 2);
  assert.ok(Math.abs(voices[1].volume - 0.1) < 0.001);
  advance(200);
  sound.cue("press");
  assert.equal(voices.filter((v) => !v.paused).length, 2);
  sound.configure({ effects: false });
  sound.cue("press");
  assert.equal(voices.filter((v) => !v.paused).length, 0);
});
test("muting music is independent of effects, and invalid saved volume is constrained", async () => {
  const { sound, voices } = setup();
  sound.setScene("lobby");
  sound.configure({ music: false });
  sound.unlock();
  sound.cue("press");
  assert.equal(voices[0].file, "ui-press.ogg");
  assert.equal(
    soundPreferences({ musicVolume: 500, effectsVolume: NaN }).musicVolume,
    100,
  );
  assert.equal(soundPreferences({ effectsVolume: NaN }).effectsVolume, 30);
  sound.dispose();
  assert.ok(voices.every((v) => v.paused));
});
