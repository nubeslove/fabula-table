import type { KeyboardEvent } from "react";

export function sendsOnEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
  return (
    e.key === "Enter" &&
    !e.shiftKey &&
    !e.repeat &&
    !e.nativeEvent.isComposing &&
    e.nativeEvent.keyCode !== 229
  );
}
