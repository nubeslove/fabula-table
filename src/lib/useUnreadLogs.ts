import { useEffect, useRef, useState } from "react";
import type { Log } from "../shared/types";
import { logChannel, LOG_CHANNELS } from "../shared/logs";

type Channel = keyof typeof LOG_CHANNELS;
export function useUnreadLogs(
  logs: Log[],
  user: string,
  expanded: boolean,
  channel: Channel,
  atBottom: boolean,
) {
  const seen = useRef(new Set(logs.map((log) => log.id)));
  const [unread, setUnread] = useState<Partial<Record<Channel, boolean>>>({});
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    const arrived = logs.filter(
      (log) => !seen.current.has(log.id) && log.author !== user,
    );
    seen.current = new Set(logs.map((log) => log.id));
    setUnread((old) => {
      const next = { ...old };
      for (const log of arrived) next[logChannel(log)] = true;
      if (expanded && visible && atBottom) delete next[channel];
      return Object.keys(LOG_CHANNELS).every(
        (key) => old[key as Channel] === next[key as Channel],
      )
        ? old
        : next;
    });
  }, [logs, user, expanded, channel, atBottom, visible]);
  return unread;
}
