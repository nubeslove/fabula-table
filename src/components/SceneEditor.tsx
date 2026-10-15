import { useState } from "react";
import type { Scene, World } from "../shared/types";
import { Modal, Field } from "./Common";
import { uid } from "../lib/api";
import { ExplorationSettings } from "./ExplorationSettings";
import { BaseArtBrowser } from "./BaseArtBrowser";
import { baseArtById } from "../shared/base-library";
export function SceneEditor({
  initial,
  world,
  onSave,
  onClose,
  error = "",
}: {
  initial: Scene;
  world: World;
  onSave: (s: Scene) => Promise<boolean>;
  onClose: () => void;
  error?: string;
}) {
  const [s, set] = useState(() => structuredClone(initial));
  const [library, setLibrary] = useState(false);
  const edit = <K extends keyof Scene>(k: K, value: Scene[K]) =>
    set({ ...s, [k]: value });
  return (
    <Modal title="准备场景" onClose={onClose} error={error} wide>
      <div className="form-grid">
        <Field label="场景名">
          <input
            value={s.name}
            onChange={(e) => edit("name", e.target.value)}
          />
        </Field>
        <Field label="场景形式">
          <select
            value={s.mode}
            disabled={!!s.exploration?.active}
            onChange={(e) => edit("mode", e.target.value as Scene["mode"])}
          >
            <option value="stage">贴图场景</option>
            <option value="map">探索地图</option>
            <option value="battle">冲突舞台</option>
          </select>
        </Field>
        <Field
          label="目录分类"
          hint="可填写新的分类名称；留空放入未分类。仅 GM 可见。"
        >
          <input
            value={s.folder ?? ""}
            maxLength={60}
            list="scene-folders"
            placeholder="例如：第一章 · 雾港"
            onChange={(e) => edit("folder", e.target.value)}
          />
          <datalist id="scene-folders">
            {[
              ...new Set(world.scenes.map((x) => x.folder).filter(Boolean)),
            ].map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
        <Field label="背景图片／视频">
          <select
            value={s.background}
            onChange={(e) => edit("background", e.target.value)}
          >
            <option value="">默认舞台</option>
            {baseArtById.has(s.background) && (
              <option value={s.background}>
                {baseArtById.get(s.background)!.name} · 基础资源
              </option>
            )}
            {world.assets
              .filter(
                (a) =>
                  a.mime.startsWith("image/") || a.mime.startsWith("video/"),
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          <button type="button" onClick={() => setLibrary(true)}>
            从基础场景库选择
          </button>
        </Field>
        <Field label="背景音乐">
          <select
            value={s.audio}
            onChange={(e) => edit("audio", e.target.value)}
          >
            <option value="">无音乐</option>
            {world.assets
              .filter((a) => a.mime.startsWith("audio/"))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {library && (
        <Modal
          title="选择基础场景"
          onClose={() => setLibrary(false)}
          wide
          className="library-dialog"
        >
          <BaseArtBrowser
            kind="场景"
            choose={(a) => {
              edit("background", a.id);
              setLibrary(false);
            }}
          />
        </Modal>
      )}
      {s.mode === "map" && (
        <ExplorationSettings scene={s} world={world} change={set} />
      )}
      <p className="muted">
        未打开的场景、准备好的台词和 GM
        备注只对你可见。正式打开场景时才向玩家展示。
      </p>
      <Field label="GM 场景备注">
        <textarea
          value={s.notes}
          onChange={(e) => edit("notes", e.target.value)}
        />
      </Field>
      <div hidden={s.mode === "map"}>
        <h3>舞台演员 · 最多 6 人</h3>
        <div className="row wrap">
          {world.characters
            .filter((c) => c.public)
            .map((c) => (
              <label className="check" key={c.id}>
                <input
                  type="checkbox"
                  checked={s.cast.some((x) => x.actor === c.id)}
                  disabled={
                    !s.cast.some((x) => x.actor === c.id) && s.cast.length >= 6
                  }
                  onChange={(e) =>
                    edit(
                      "cast",
                      e.target.checked
                        ? [
                            ...s.cast,
                            {
                              actor: c.id,
                              expression: "",
                              position: [0, 1, 2, 3, 4, 5].find(
                                (i) => !s.cast.some((x) => x.position === i),
                              )!,
                            },
                          ]
                        : s.cast.filter((x) => x.actor !== c.id),
                    )
                  }
                />
                {c.name}
              </label>
            ))}
        </div>
        <h3>预制台词</h3>
        <p className="muted">
          按顺序写好台词；演出时点击“下一句”。请把有台词的角色加入本幕演员。
        </p>
        {s.cues.map((q, i) => (
          <div className="class-block" key={q.id}>
            <div className="row">
              <span>{i + 1}</span>
              <select
                aria-label="台词角色"
                value={q.actor}
                onChange={(e) =>
                  edit(
                    "cues",
                    s.cues.map((x, j) =>
                      i === j
                        ? { ...x, actor: e.target.value, expression: "" }
                        : x,
                    ),
                  )
                }
              >
                <option value="">旁白</option>
                {s.cast.map((c) => (
                  <option key={c.actor} value={c.actor}>
                    {world.characters.find((x) => x.id === c.actor)?.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="台词表情"
                value={q.expression}
                onChange={(e) =>
                  edit(
                    "cues",
                    s.cues.map((x, j) =>
                      i === j ? { ...x, expression: e.target.value } : x,
                    ),
                  )
                }
              >
                <option value="">沿用表情</option>
                {world.characters
                  .find((c) => c.id === q.actor)
                  ?.expressions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
              <button
                onClick={() =>
                  edit(
                    "cues",
                    s.cues.filter((_, j) => j !== i),
                  )
                }
              >
                移除
              </button>
            </div>
            <textarea
              aria-label="预制台词内容"
              value={q.text}
              onChange={(e) =>
                edit(
                  "cues",
                  s.cues.map((x, j) =>
                    i === j ? { ...x, text: e.target.value } : x,
                  ),
                )
              }
            />
          </div>
        ))}
        <button
          onClick={() =>
            edit("cues", [
              ...s.cues,
              { id: uid(), actor: "", expression: "", text: "" },
            ])
          }
        >
          ＋ 一句台词
        </button>
      </div>
      <footer className="modal-footer">
        <small>保存后，在场景列表中点击“打开”开始演出。</small>
        <button
          className="primary"
          onClick={async () => {
            if (await onSave(s)) onClose();
          }}
        >
          保存场景
        </button>
      </footer>
    </Modal>
  );
}
