import type { Character, Scene } from "../shared/types";
import { useEffect, useRef, useState } from "react";
import { THEATRE_ACTIONS, newTheatreAction } from "../shared/theatre";
import { Portrait } from "./Common";
import { TheatreEmote } from "./TheatreEmote";

export function TheatrePortrait({
  slot,
  character: c,
  urls,
  active,
  listening,
  owned,
  busy,
  select,
  stageWidth,
  areaHeight,
  left,
  width,
  height,
  layer,
  serverTime,
}: {
  slot: Scene["cast"][number];
  character: Character;
  urls: Record<string, string>;
  active: boolean;
  listening: boolean;
  owned: boolean;
  busy: boolean;
  select: () => void;
  stageWidth: number;
  areaHeight: number;
  left: number;
  width: number;
  height: number;
  layer: number;
  serverTime?: number;
}) {
  const x = Math.max(
    24,
    Math.min(stageWidth - width - 24, left + (slot.offset?.x ?? 0) * 0.4),
  );
  const y =
    (Math.max(-10, Math.min(0, slot.offset?.y ?? 0)) * areaHeight) / 100;
  const seen = useRef(slot.action?.id);
  const [playing, setPlaying] = useState<Scene["cast"][number]["action"]>();
  useEffect(() => {
    if (seen.current === slot.action?.id) return;
    const next = newTheatreAction(seen.current, slot.action, serverTime);
    seen.current = slot.action?.id;
    // Restored snapshots stay still; only a newly received action plays.
    setPlaying(next);
    if (next) {
      const timer = setTimeout(
        () => setPlaying(undefined),
        THEATRE_ACTIONS[next.kind].ms,
      );
      return () => clearTimeout(timer);
    }
  }, [slot.action?.id]);
  return (
    <div
      className="theatre-cell"
      style={{
        zIndex: active ? 20 : layer,
        width,
        height,
        transform: `translateX(${x}px)`,
      }}
    >
      <div
        className="theatre-position"
        style={{ transform: `translateY(${y}px)` }}
      >
        <div
          className={`theatre-actor ${active ? "is-speaking" : listening ? "is-listening" : ""}`}
        >
          <div
            key={slot.action?.id ?? "rest"}
            className={`theatre-motion ${playing ? `theatre-action-${playing.kind}` : ""}`}
            style={{
              animationDuration: playing
                ? `${THEATRE_ACTIONS[playing.kind].ms}ms`
                : undefined,
            }}
          >
            <div className="theatre-art">
              <div
                className="theatre-image"
                style={{ transform: slot.mirrored ? "scaleX(-1)" : undefined }}
              >
                <Portrait
                  name={c.name}
                  color={c.color}
                  src={
                    urls[
                      c.expressions.find((e) => e.id === slot.expression)
                        ?.asset || c.portrait
                    ]
                  }
                />
              </div>
            </div>
            {slot.emote && (
              <div
                key={slot.emoteId || slot.emote}
                className={`theatre-emote emote-${slot.emote}`}
              >
                <TheatreEmote emote={slot.emote} badge />
              </div>
            )}
          </div>
          <button
            className="theatre-name"
            disabled={!owned || busy}
            onClick={select}
            title={owned ? `切换发言：${c.name}` : c.name}
          >
            <span>{active ? "◆" : "◇"}</span> {c.name}
          </button>
        </div>
      </div>
    </div>
  );
}
