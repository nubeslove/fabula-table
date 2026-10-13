import { useEffect, useState } from "react";
import { api, bytes } from "../lib/api";
import { Modal, Field, ErrorText } from "./Common";
interface Status {
  version: string;
  enabled: boolean;
  repository: string | null;
  online: number;
  maintenance: boolean;
  automatic: boolean;
  autoError: string;
  lastAutoCheck: number;
  latest: {
    version: string;
    notes: string;
    page: string;
    size: number;
    available: boolean;
  } | null;
  update?: { phase: string; message: string; version?: string; at: string };
}
export function ServerAdmin({ close }: { close: () => void }) {
  const [status, setStatus] = useState<Status>(),
    [key, setKey] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [checked, setChecked] = useState(false),
    [reconnecting, setReconnecting] = useState(false);
  useEffect(() => {
    api<Status>("admin/status")
      .then(setStatus)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!status) return;
    const timer = setInterval(
      () => {
        api<Status>("admin/status")
          .then((value) => {
            setStatus((old) => ({
              ...value,
              latest: value.latest || old?.latest || null,
            }));
            setReconnecting(false);
          })
          .catch((e) => {
            if (status.maintenance) setReconnecting(true);
            else {
              setError(e.message);
              setStatus(undefined);
            }
          });
      },
      status.maintenance ? 2000 : 15000,
    );
    return () => clearInterval(timer);
  }, [!!status, status?.maintenance]);
  async function run(path: string, value: unknown) {
    setBusy(true);
    setError("");
    try {
      const data = await api<Status>("admin/" + path, value);
      setStatus(data);
      if (path === "login") setKey("");
      if (path === "check") setChecked(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const available =
    status?.latest?.available && status.latest.version !== status.version;
  return (
    <Modal title="服务器管理" onClose={close} className="server-admin">
      {!status ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run("login", { key });
          }}
        >
          <p className="muted">
            管理整个服务器的程序更新。进入世界仍使用原来的账号和世界密码。
          </p>
          <Field
            label="服务器管理密码"
            hint="首次安装后，从服务器 .env 中复制 FU_ADMIN_KEY 的值；以后可让浏览器记住。"
          >
            <input
              type="password"
              name="server-admin-key"
              autoComplete="current-password"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
          <ErrorText text={error} />
          <button className="primary full" disabled={busy}>
            {busy ? "正在验证…" : "进入管理"}
          </button>
        </form>
      ) : (
        <>
          <div className="admin-version">
            <div>
              <small>当前版本</small>
              <strong>{status.version}</strong>
            </div>
            <span>
              {status.online ? `${status.online} 个世界连接` : "世界当前无人"}
            </span>
          </div>
          <p className="notice">
            {status.automatic
              ? "自动更新已启用：每天检查一次，所有世界无人且持续空闲 10 分钟后更新。"
              : "自动更新未启用，可手动检查与更新。"}
          </p>
          {status.repository && (
            <a href={status.repository} target="_blank" rel="noreferrer">
              查看 GitHub 项目与发行记录
            </a>
          )}
          {status.update && (
            <div
              className={`admin-progress ${status.update.phase === "failed" ? "failed" : ""}`}
              role="status"
            >
              <strong>
                {status.maintenance
                  ? "更新进行中"
                  : status.update.phase === "failed"
                    ? "上次更新未完成"
                    : "更新记录"}
              </strong>
              <p>
                {reconnecting
                  ? "正在重启，页面会自动重新连接…"
                  : status.update.message}
              </p>
            </div>
          )}
          {status.maintenance && !status.update && (
            <p role="status">
              更新已提交，正在准备。重启期间页面会自动重新连接。
            </p>
          )}
          {status.latest && (
            <section className="admin-release">
              <h3>
                {available
                  ? `可更新至 ${status.latest.version}`
                  : "当前已是最新版本"}
              </h3>
              <small>
                下载大小 {bytes(status.latest.size)} · 包含程序和规则资源
              </small>
              <p className="admin-notes">
                {status.latest.notes || "此版本未填写更新说明。"}
              </p>
            </section>
          )}
          {checked && !status.latest && <p>仓库目前还没有可安装的正式新版。</p>}
          <ErrorText text={error || status.autoError} />
          <div className="button-row admin-actions">
            <button
              disabled={busy || status.maintenance || !status.enabled}
              onClick={() => void run("check", {})}
            >
              {busy ? "请稍候…" : "检查更新"}
            </button>
            <button
              className="primary"
              disabled={
                busy || status.maintenance || !available || status.online > 0
              }
              onClick={() =>
                void run("update", { version: status.latest!.version })
              }
            >
              更新并重启
            </button>
            <button
              onClick={() => {
                void api("admin/logout", {})
                  .then(() => {
                    setStatus(undefined);
                    setChecked(false);
                  })
                  .catch((e) => setError(e.message));
              }}
            >
              退出管理
            </button>
          </div>
          <small className="muted">
            更新保留账号、世界和上传素材；启动失败会恢复上一版。手动更新前，请让玩家返回大厅。
          </small>
        </>
      )}
    </Modal>
  );
}
