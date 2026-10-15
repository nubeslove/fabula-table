import type { Character, Scene } from "../shared/types";
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
}) {
  // Normalize against available travel, so a boundary has no invisible dead zone.
  const offsetX = slot.offset?.x ?? 0;
  const x =
    offsetX < 0
      ? (offsetX / 80) * Math.max(0, left - 6)
      : (offsetX / 80) * Math.max(0, stageWidth - left - width - 6);
  const y = ((slot.offset?.y ?? 0) * areaHeight) / 100;
  return (
    <div className="theatre-cell" style={{ zIndex: active ? 3 : 1 }}>
      <div
        className="theatre-position"
        style={{ transform: `translate(${x}px, ${y}px)` }}
      >
        <div
          className={`theatre-actor ${active ? "is-speaking" : listening ? "is-listening" : ""}`}
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
