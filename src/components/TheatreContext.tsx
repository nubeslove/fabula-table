import { createContext, useContext, useState, type ReactNode } from "react";

const TheatreContext = createContext({
  speaker: null as string | null,
  selection: 0,
  chooseSpeaker: (_id: string) => {},
});
/** Local speaking identity only. The scene and dialogue remain server-authoritative. */
export function TheatreProvider({
  children,
  onChoose,
}: {
  children: ReactNode;
  onChoose: () => void;
}) {
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [selection, setSelection] = useState(0);
  return (
    <TheatreContext.Provider
      value={{
        speaker,
        selection,
        chooseSpeaker: (id) => {
          setSpeaker(id);
          setSelection((n) => n + 1);
          onChoose();
        },
      }}
    >
      {children}
    </TheatreContext.Provider>
  );
}
export const useTheatreSpeaker = () => useContext(TheatreContext);
