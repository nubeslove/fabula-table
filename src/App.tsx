import { Lobby } from "./components/Lobby";
import { useEffect, useState } from "react";
import type {
  Character,
  Scene,
  Session,
  Command,
  JournalEntry,
  Log,
} from "./shared/types";
import { newCharacter } from "./shared/rules";
import { api, apiUrl, uid } from "./lib/api";
import { useAssets } from "./lib/media";
import { Modal } from "./components/Common";
import { Stage } from "./components/Stage";
import { CharacterEditor } from "./components/CharacterEditor";
import { SceneEditor } from "./components/SceneEditor";
import { Preload } from "./components/Resources";
import { ClockManager } from "./components/Clocks";
import { ClockStrip } from "./components/ClockStrip";
import { JournalEditor } from "./components/Journal";
import { StoryLog } from "./components/StoryLog";
import { newJournalEntry } from "./shared/clocks";
import "./styles/table-records.css";
import {
  TableHeader,
  TableDrawer,
  FirstCharacterPrompt,
} from "./components/TableChrome";
import { TablePanels } from "./components/TablePanels";
const query = new URLSearchParams(location.search);
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    if (query.has("preload")) return;
    void api("session")
      .then((s) => {
        if (!query.get("room") || s.world.id === query.get("room"))
          setSession(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (query.has("preload"))
    return (
      <Preload
        world={query.get("preload")!}
        keyValue={query.get("key") ?? ""}
      />
    );
  if (loading) return <main className="loading">✦ 正在打开物语桌…</main>;
  return session ? (
    <Table
      key={session.world.id + session.me.id}
      initial={session}
      leave={() => {
        setSession(null);
        history.replaceState(null, "", location.pathname);
      }}
    />
  ) : (
    <Lobby
      enter={(s) => {
        setSession(s);
        history.replaceState(
          null,
          "",
          location.pathname + "?room=" + s.world.id,
        );
      }}
    />
  );
}
function Table({ initial, leave }: { initial: Session; leave: () => void }) {
  const [session, setSession] = useState(initial),
    [page, setPage] = useState("舞台"),
    [toolsTab, setToolsTab] = useState("角色行动"),
    [connected, setConnected] = useState(false),
    [unreadChat, setUnreadChat] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<{
      character: Character;
      isNew: boolean;
    } | null>(null),
    [scene, setScene] = useState<{ scene: Scene; isNew: boolean } | null>(null),
    [notes, setNotes] = useState<string | null>(null),
    [clockWindow, setClockWindow] = useState<{
      id?: string;
      scene?: string;
      placement?: "upper" | "lower";
    } | null>(null),
    [journalDraft, setJournalDraft] = useState<{
      value: JournalEntry;
      isNew: boolean;
    } | null>(null),
    [showLog, setShowLog] = useState(
      () => window.matchMedia("(min-width: 1000px)").matches,
    );
  const { world: w, me } = session,
    gm = me.role === "gm",
    assets = useAssets(w.id, w.assets);
  const receive = (s: Session) =>
    setSession((old) => (s.world.revision >= old.world.revision ? s : old));
  useEffect(() => {
    const events = new EventSource(apiUrl("events"));
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    events.onmessage = (e) => {
      try {
        receive(JSON.parse(e.data));
      } catch {
        setError("房间更新异常，请刷新重连");
      }
    };
    return () => events.close();
  }, [w.id]);
  async function act(value: Command) {
    setError("");
    try {
      receive(await api("command", value));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  function create(npc = false) {
    const c = newCharacter(uid(), npc ? "" : me.id);
    if (npc) {
      c.name = "新的 NPC";
      c.kind = "npc";
      c.side = "foes";
      c.custom = true;
    }
    setEditing({ character: c, isNew: true });
  }
  function record(log?: Log) {
    const value = newJournalEntry(uid());
    if (log) {
      value.title = log.text.split("\n")[0].slice(0, 60);
      value.text = `${log.name} · ${new Date(log.at).toLocaleString("zh-CN")}\n\n${log.text}`;
      value.public = !log.private;
    }
    setJournalDraft({ value, isNew: true });
  }
  const current = w.scenes.find((s) => s.id === w.activeScene);
  return (
    <div className="app-shell game-table">
      <TableHeader
        title={w.title}
        me={me}
        connected={connected}
        page={page}
        open={setPage}
        chat={showLog}
        unreadChat={unreadChat}
        toggleChat={() => setShowLog(!showLog)}
        leave={() =>
          void api("leave", {})
            .then(leave)
            .catch((e) => setError(e.message))
        }
      />
      {session.accountLinked === false && (
        <div className="notice">
          原世界与人物已保留。绑定统一账号后，可从大厅随时返回。
          <button onClick={leave}>去大厅绑定账号</button>
        </div>
      )}
      {!connected && (
        <div className="connection-warning">
          正在连接房间，连接恢复后会自动同步。操作失败时请确认后重试。
        </div>
      )}
      {error && (
        <div className="toast" role="alert">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      {assets.error && (
        <div className="notice" role="alert">
          部分素材未能下载：{assets.error}。
          <button onClick={assets.retry}>重试下载</button>
        </div>
      )}
      {assets.warning && (
        <div className="notice" role="status">
          素材仍可在本次跑团中显示，但未能全部保存到浏览器。{assets.warning}。
          再次进入可能需要重新下载；完成预下载时请先处理缓存问题。
        </div>
      )}
      <main className={`table-layout ${showLog ? "chat-open" : ""}`}>
        <div className="workspace">
          <Stage
            actionError={error}
            openClock={(id, placement) =>
              setClockWindow({ id, scene: current?.id, placement })
            }
            session={session}
            urls={assets.urls}
            act={act}
            hud={
              <ClockStrip
                clocks={w.clocks}
                act={act}
                gm={gm}
                open={(id) => setClockWindow({ id })}
              />
            }
            record={() => record()}
            tools={() => {
              setToolsTab("角色行动");
              setPage("工具");
            }}
            configureBattle={() => {
              setToolsTab("冲突回合");
              setPage("工具");
            }}
            prepare={() =>
              current && setScene({ scene: current, isNew: false })
            }
          />
          {page !== "舞台" && (
            <TableDrawer title={page} close={() => setPage("舞台")}>
              <TablePanels
                session={session}
                page={page}
                toolsTab={toolsTab}
                urls={assets.urls}
                act={act}
                create={create}
                setEditing={setEditing}
                setScene={setScene}
                setNotes={setNotes}
                setJournalDraft={setJournalDraft}
                record={record}
                receive={receive}
                setError={setError}
                setPage={setPage}
              />
            </TableDrawer>
          )}
        </div>
        <aside className={`table-sidebar ${showLog ? "is-open" : ""}`}>
          <StoryLog
            session={session}
            act={act}
            extract={record}
            onUnread={setUnreadChat}
            openJournal={() => setPage("日志")}
            expanded={showLog}
            toggle={() => setShowLog(!showLog)}
          />
        </aside>
      </main>
      <FirstCharacterPrompt
        session={session}
        create={() => create()}
        prepare={() => setPage("场景")}
      />
      {clockWindow && (
        <ClockManager
          session={session}
          act={act}
          error={error}
          initialId={clockWindow.id}
          initialScene={clockWindow.scene}
          initialPlacement={clockWindow.placement}
          close={() => setClockWindow(null)}
        />
      )}
      {journalDraft && (
        <JournalEditor
          key={journalDraft.value.id}
          initial={journalDraft.value}
          isNew={journalDraft.isNew}
          session={session}
          error={error}
          close={() => setJournalDraft(null)}
          save={(value, expected) =>
            act({ type: "journal.save", value, expected })
          }
        />
      )}
      {editing && (
        <CharacterEditor
          error={error}
          initial={editing.character}
          isNew={editing.isNew}
          session={session}
          onClose={() => setEditing(null)}
          onSave={(value) =>
            act({
              type: "character.save",
              value,
              expected: editing.isNew ? null : editing.character.revision,
            })
          }
        />
      )}{" "}
      {scene && (
        <SceneEditor
          error={error}
          initial={scene.scene}
          world={w}
          onClose={() => setScene(null)}
          onSave={(value) =>
            act({
              type: "scene.save",
              value,
              expected: scene.isNew ? null : scene.scene.revision,
            })
          }
        />
      )}
      {notes !== null && (
        <Modal error={error} title="GM 世界手记" onClose={() => setNotes(null)}>
          <textarea
            className="notes"
            aria-label="世界手记"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            className="primary"
            onClick={async () => {
              if (await act({ type: "notes", text: notes })) setNotes(null);
            }}
          >
            保存手记
          </button>
        </Modal>
      )}
    </div>
  );
}
