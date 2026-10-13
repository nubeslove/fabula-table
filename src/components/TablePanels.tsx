import type {
  Character,
  Command,
  JournalEntry,
  Scene,
  Session,
} from "../shared/types";
import { SceneDirectory } from "./SceneDirectory";
import { CharacterDirectory } from "./CharacterDirectory";
import { ToolsPanel } from "./ToolsPanel";
import { Journal } from "./Journal";
import { RulesReader } from "./RulesReader";
import { WorldSettings } from "./WorldSettings";
import { Resources } from "./Resources";

type Props = {
  session: Session;
  page: string;
  toolsTab: string;
  urls: Record<string, string>;
  act: (command: Command) => Promise<boolean>;
  create: (npc?: boolean) => void;
  setEditing: (value: { character: Character; isNew: boolean }) => void;
  setScene: (value: { scene: Scene; isNew: boolean }) => void;
  setNotes: (value: string) => void;
  setJournalDraft: (value: { value: JournalEntry; isNew: boolean }) => void;
  record: () => void;
  receive: (session: Session) => void;
  setError: (error: string) => void;
  setPage: (page: string) => void;
};
export function TablePanels({
  session,
  page,
  toolsTab,
  urls,
  act,
  create,
  setEditing,
  setScene,
  setNotes,
  setJournalDraft,
  record,
  receive,
  setError,
  setPage,
}: Props) {
  const { world: w, me } = session,
    gm = me.role === "gm",
    assets = { urls };
  return (
    <>
      {page === "人物" && (
        <CharacterDirectory
          session={session}
          urls={urls}
          act={act}
          create={create}
          edit={setEditing}
        />
      )}
      {page === "场景" && gm && (
        <SceneDirectory
          world={w}
          urls={urls}
          act={act}
          edit={setScene}
          notes={() => setNotes(w.gmNotes)}
          opened={() => setPage("舞台")}
          error={setError}
        />
      )}
      {page === "工具" && (
        <ToolsPanel
          initialTab={toolsTab}
          battleStarted={() => setPage("舞台")}
          session={session}
          act={act}
          urls={assets.urls}
          edit={(character) => setEditing({ character, isNew: false })}
        />
      )}
      {page === "日志" && (
        <Journal
          session={session}
          act={act}
          create={() => record()}
          edit={(value) => setJournalDraft({ value, isNew: false })}
        />
      )}
      {page === "世界设置" && gm && (
        <WorldSettings session={session} receive={receive} />
      )}
      {page === "规则书" && <RulesReader enabled={w.expansions} />}
      {page === "素材与分享" && (
        <Resources
          session={session}
          act={act}
          refresh={receive}
          urls={assets.urls}
        />
      )}
    </>
  );
}
