import { EMOTE_NAMES, type TheatreEmote } from "../shared/theatre";

/** Original lightweight comic marks, independent of any uploaded portrait. */
export function TheatreEmote({
  emote,
  badge = false,
}: {
  emote: TheatreEmote;
  badge?: boolean;
}) {
  return (
    <svg
      className={`theatre-emote-symbol ${badge ? "badge" : ""} emote-${emote}`}
      viewBox="0 0 64 64"
      role="img"
      aria-label={EMOTE_NAMES[emote]}
    >
      {badge && (
        <path
          className="emote-cloud"
          d="M13 9Q5 9 5 20v21q0 10 12 10h13l-5 9 17-9h9q9 0 9-11V20Q60 8 49 8Z"
        />
      )}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {emote === "happy" && (
          <>
            <path
              d="m22 16 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z"
              fill="currentColor"
              stroke="none"
            />
            <path d="m45 10 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" />
            <path
              d="m44 40 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"
              fill="currentColor"
              stroke="none"
            />
          </>
        )}
        {emote === "surprise" && (
          <>
            <path d="M32 15v22M16 18l6 8m26-8-6 8" />
            <circle cx="32" cy="46" r="2.4" fill="currentColor" />
          </>
        )}
        {emote === "question" && (
          <>
            <path d="M23 23c0-11 19-11 19 0 0 7-10 7-10 15" />
            <circle cx="32" cy="46" r="2.4" fill="currentColor" />
          </>
        )}
        {emote === "angry" && (
          <>
            <path d="M16 18h8v-8m16 0v8h8M16 42h8v10m16 0V42h8M10 26h13q9 0 9-9m22 9H41q-9 0-9-9M10 34h13q9 0 9 9m22-9H41q-9 0-9 9" />
          </>
        )}
        {emote === "sad" && (
          <>
            <path
              d="M24 15q-18 22 0 26 18-4 0-26Z"
              fill="currentColor"
              opacity=".7"
            />
            <path d="M45 27q-14 17 0 21 14-4 0-21Z" />
            <path d="m18 46-4 4m19 2-3 4" />
          </>
        )}
        {emote === "heart" && (
          <path
            d="M32 49C3 31 14 9 29 20l3 3 3-3C50 9 61 31 32 49Z"
            fill="currentColor"
          />
        )}
        {emote === "thinking" && (
          <>
            <circle cx="18" cy="29" r="3" fill="currentColor" />
            <circle cx="32" cy="29" r="3" fill="currentColor" />
            <circle cx="46" cy="29" r="3" fill="currentColor" />
            <circle cx="25" cy="46" r="3" />
            <circle cx="17" cy="54" r="2" />
          </>
        )}
        {emote === "nervous" && (
          <>
            <path
              d="M43 12q-17 23 0 27 17-4 0-27Z"
              fill="currentColor"
              opacity=".75"
            />
            <path d="M14 22v17m8-20v17m-8 11 8 3 8-3" />
          </>
        )}
        {emote === "music" && (
          <>
            <path d="M26 42V19l21-5v24M26 25l21-5" />
            <ellipse cx="20" cy="43" rx="6" ry="4" fill="currentColor" />
            <ellipse cx="41" cy="39" rx="6" ry="4" fill="currentColor" />
          </>
        )}
        {emote === "sleepy" && (
          <>
            <path d="M13 35h14L13 49h14M32 13h20L32 33h20" />
          </>
        )}
      </g>
    </svg>
  );
}
