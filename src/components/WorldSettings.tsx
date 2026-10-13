import { useState } from "react";
import type { Session } from "../shared/types";
import { api } from "../lib/api";
import { Field, ErrorText } from "./Common";
import { ExpansionPicker } from "./ExpansionPicker";
export function WorldSettings({
  session,
  receive,
}: {
  session: Session;
  receive: (s: Session) => void;
}) {
  const [title, setTitle] = useState(session.world.title),
    [expansions, setExpansions] = useState(session.world.expansions ?? []),
    [changePassword, setChangePassword] = useState(false),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  return (
    <form
      className="world-settings"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          receive(
            await api("settings", {
              title,
              expansions,
              ...(changePassword ? { password } : {}),
            }),
          );
          setPassword("");
          setChangePassword(false);
          setMessage("世界设置已保存");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>世界设置</h2>
      {!session.accountLinked && (
        <p className="notice">
          请先返回大厅，将原身份绑定到统一账号，再修改世界设置。
        </p>
      )}
      <Field label="世界名称">
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <ExpansionPicker value={expansions} onChange={setExpansions} />
      <p className="muted">
        关闭扩展会隐藏新的建卡选项，已有职业与能力继续保留。
      </p>
      <label>
        <input
          type="checkbox"
          checked={changePassword}
          onChange={(e) => setChangePassword(e.target.checked)}
        />{" "}
        修改世界密码
      </label>
      {changePassword && (
        <Field
          label="新世界密码"
          hint="留空将世界设为开放。已加入的成员仍可直接返回。"
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      )}
      <ErrorText text={error} />
      <p role="status">{message}</p>
      <button className="primary" disabled={busy || !session.accountLinked}>
        保存设置
      </button>
    </form>
  );
}
