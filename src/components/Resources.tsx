import { useEffect, useRef, useState } from "react";
import type { Asset, Session, Command } from "../shared/types";
import { api, apiUrl, bytes, copy } from "../lib/api";
import { getAsset, upload } from "../lib/media";
import { ErrorText, Modal } from "./Common";
import { BaseArtBrowser } from "./BaseArtBrowser";
function shareUrl(params: Record<string, string>) {
  const url = new URL(document.baseURI);
  url.search = "";
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.href;
}
export function Resources({
  session,
  act,
  refresh,
  urls,
}: {
  session: Session;
  act: (c: Command) => Promise<boolean>;
  refresh: (s: Session) => void;
  urls: Record<string, string>;
}) {
  const { world: w, me } = session,
    gm = me.role === "gm";
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [info, setInfo] = useState(""),
    [keepDetail, setDetail] = useState(false),
    [tab, setTab] = useState("files"),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState(""),
    [preview, setPreview] = useState<Asset | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const invite = shareUrl({ room: w.id }),
    preload = shareUrl({ preload: w.id, key: session.preloadKey ?? "" }),
    chosen = w.assets.filter((a) => a.preload);
  const shown = w.assets.filter(
    (a) =>
      a.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
      (!kind || a.mime.startsWith(kind + "/")),
  );
  async function add(files: FileList | null) {
    if (!files) return;
    setError("");
    setInfo("");
    const reports: string[] = [];
    for (const file of Array.from(files)) {
      setBusy("正在准备 " + file.name + "…");
      try {
        const result = await upload(file, keepDetail);
        reports.push(
          `${file.name}：${bytes(result.before)} → ${bytes(result.after)}`,
        );
      } catch (e) {
        setError((e as Error).message);
        break;
      }
    }
    setInfo(reports.join("\n"));
    setBusy("");
  }
  function copyLink(value: string, message: string) {
    void copy(value)
      .then(() => setInfo(message))
      .catch((e) => setError(e.message));
  }
  return (
    <section className="bounded-panel asset-manager">
      <div className="workspace-tabs">
        <button
          className={tab === "files" ? "selected" : ""}
          aria-pressed={tab === "files"}
          onClick={() => setTab("files")}
        >
          世界素材 <small>{w.assets.length}</small>
        </button>
        {gm && (
          <button
            className={tab === "share" ? "selected" : ""}
            aria-pressed={tab === "share"}
            onClick={() => setTab("share")}
          >
            邀请与预下载
          </button>
        )}
        <span>{bytes(w.assets.reduce((n, a) => n + a.size, 0))}</span>
        <button
          className={tab === "base" ? "selected" : ""}
          onClick={() => setTab("base")}
        >
          基础资源库
        </button>
      </div>
      <ErrorText text={error} />
      {(info || busy) && (
        <div className="asset-notice" role="status">
          <span>{busy || info}</span>
          {!busy && (
            <button aria-label="关闭素材提示" onClick={() => setInfo("")}>
              ×
            </button>
          )}
        </div>
      )}
      {tab === "base" ? (
        <BaseArtBrowser />
      ) : tab === "files" ? (
        <>
          <div className="workspace-toolbar">
            <input
              type="search"
              aria-label="搜索世界素材"
              placeholder="搜索文件名…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="素材类型"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="">全部</option>
              <option value="image">图片</option>
              <option value="video">视频</option>
              <option value="audio">音频</option>
            </select>
            {gm && (
              <button
                className="primary"
                disabled={!!busy}
                onClick={() => input.current?.click()}
              >
                ＋ 上传素材
              </button>
            )}
            <input
              ref={input}
              className="asset-file-input"
              aria-label="上传世界素材"
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              disabled={!!busy}
              onChange={(e) => {
                void add(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {gm && (
            <div className="asset-upload-options">
              <label>
                <input
                  type="checkbox"
                  checked={keepDetail}
                  onChange={(e) => setDetail(e.target.checked)}
                />
                地图／文字图片保留清晰度
              </label>
              <small title="图片转 WebP；服务器具备转换器时压缩音视频。">
                自动压缩 · 每项 ≤100 MB
              </small>
            </div>
          )}
          <div className="asset-list" aria-label="世界素材条目" tabIndex={0}>
            {shown.map((a) => (
              <article className="asset-entry" key={a.id}>
                <button
                  className="asset-open"
                  title={`预览 ${a.name}`}
                  onClick={() => setPreview(a)}
                >
                  <span className="asset-thumbnail">
                    {a.mime.startsWith("image/") && urls[a.id] ? (
                      <img src={urls[a.id]} alt="" loading="lazy" />
                    ) : (
                      <span>
                        {a.mime.startsWith("video/")
                          ? "▶"
                          : a.mime.startsWith("audio/")
                            ? "♫"
                            : "◇"}
                      </span>
                    )}
                  </span>
                  <span className="entry-name">
                    <strong title={a.name}>{a.name}</strong>
                    <small>
                      {a.mime.split("/")[1].toUpperCase()} · {bytes(a.size)}
                    </small>
                  </span>
                </button>
                {gm && (
                  <label className="asset-preload-choice">
                    <input
                      type="checkbox"
                      checked={a.preload}
                      onChange={(e) =>
                        void act({
                          type: "asset.preload",
                          id: a.id,
                          value: e.target.checked,
                        })
                      }
                    />
                    <span>允许预下载</span>
                  </label>
                )}
              </article>
            ))}
            {!shown.length && (
              <div className="workspace-empty">
                <strong>
                  {w.assets.length ? "没有匹配的文件" : "还没有世界素材"}
                </strong>
                <p>
                  {w.assets.length
                    ? "换一个名称或类型再试试。"
                    : "上传背景、立绘或音乐，即可用于场景与角色。"}
                </p>
              </div>
            )}
          </div>
          <footer className="workspace-footer">
            <span>
              {shown.length} 项{gm && ` · 已选 ${chosen.length} 项供预下载`}
            </span>
            {gm && (
              <button onClick={() => setTab("share")}>分享预下载链接 →</button>
            )}
          </footer>
        </>
      ) : (
        <div className="asset-sharing">
          <section>
            <h3>分享世界</h3>
            <p>玩家进入后创建自己的身份，世界素材会自动补齐。</p>
            <div className="share-link">
              <input aria-label="玩家世界入口" readOnly value={invite} />
              <button onClick={() => copyLink(invite, "世界入口已复制")}>
                复制邀请
              </button>
            </div>
          </section>
          <section>
            <h3>开团前预下载</h3>
            <p>
              只分享你在素材列表中勾选的文件。GM
              手记、台本与存档不会包含在链接中。
            </p>
            <strong>
              {chosen.length} 项 ·{" "}
              {bytes(chosen.reduce((n, a) => n + a.size, 0))}
            </strong>
            <div className="share-link">
              <input aria-label="预下载链接" readOnly value={preload} />
              <button
                disabled={!chosen.length}
                onClick={() => copyLink(preload, "预下载链接已复制")}
              >
                复制预下载链接
              </button>
            </div>
            {!chosen.length && (
              <p className="muted">先在世界素材中勾选可提前公开的文件。</p>
            )}
            <button
              className="quiet"
              onClick={() =>
                void api("preload-key", {})
                  .then(refresh)
                  .then(() =>
                    setInfo(
                      "已更换链接。旧链接停止提供新下载，已下载的文件仍在玩家本地。",
                    ),
                  )
                  .catch((e) => setError(e.message))
              }
            >
              更换预下载链接
            </button>
          </section>
          <p className="muted">
            相同文件只保存一次；玩家只下载本地缺少的素材。官方规则文本在规则书内单独读取。
          </p>
        </div>
      )}
      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)} wide>
          <div className="asset-lightbox">
            {!urls[preview.id] ? (
              <p>素材正在同步，请稍后再试。</p>
            ) : preview.mime.startsWith("image/") ? (
              <img src={urls[preview.id]} alt={preview.name} />
            ) : preview.mime.startsWith("video/") ? (
              <video src={urls[preview.id]} controls />
            ) : (
              <audio src={urls[preview.id]} controls />
            )}
          </div>
          <p className="muted">
            {preview.mime} · {bytes(preview.size)}
          </p>
        </Modal>
      )}
    </section>
  );
}
export function Preload({
  world,
  keyValue,
}: {
  world: string;
  keyValue: string;
}) {
  const [title, setTitle] = useState("世界资源"),
    [assets, setAssets] = useState<Asset[]>([]),
    [done, setDone] = useState(0),
    [completedBytes, setBytes] = useState(0),
    [hits, setHits] = useState(0),
    [current, setCurrent] = useState(""),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false),
    [loaded, setLoaded] = useState(false),
    controller = useRef<AbortController>();
  useEffect(() => {
    void api<{ title: string; assets: Asset[] }>(
      `preload/${world}?key=${encodeURIComponent(keyValue)}`,
    )
      .then((data) => {
        setTitle(data.title);
        setAssets(data.assets);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
    return () => controller.current?.abort();
  }, [world, keyValue]);
  const total = assets.reduce((n, a) => n + a.size, 0);
  async function start() {
    setError("");
    setRunning(true);
    setDone(0);
    setBytes(0);
    setHits(0);
    controller.current = new AbortController();
    void navigator.storage?.persist?.().catch(() => false);
    try {
      for (const a of assets) {
        setCurrent(a.name);
        const result = await getAsset(world, a, {
          key: keyValue,
          signal: controller.current.signal,
        });
        setDone((n) => n + 1);
        setBytes((n) => n + a.size);
        if (result.hit) setHits((n) => n + 1);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setRunning(false);
      setCurrent("");
    }
  }
  return (
    <main className="preload-page">
      <div className="brand-symbol">✦</div>
      <span className="eyebrow">BEFORE THE ADVENTURE</span>
      <h1>{title}</h1>
      <p className="lead">先准备素材，开团时直接进入故事。</p>
      <section className="preload-card">
        <strong>
          {assets.length} 项素材 · {bytes(total)}
        </strong>
        <p>这里只下载 GM 选定的自定义素材。无需登录，也不会加入房间。</p>
        <progress value={completedBytes} max={total || 1} />
        <div className="row">
          <span>
            {done} / {assets.length} 项
          </span>
          <span>
            {bytes(completedBytes)} / {bytes(total)}
          </span>
          <span>{hits} 项复用缓存</span>
        </div>
        <p className="muted">
          {current ||
            (done === assets.length && assets.length > 0
              ? "准备完成。开团时使用同一浏览器和设备即可复用。"
              : "可随时暂停，重试会跳过已经完成的文件。")}
        </p>
        <ErrorText text={error} />
        {running ? (
          <button onClick={() => controller.current?.abort()}>暂停下载</button>
        ) : (
          <button
            className="primary"
            disabled={!loaded || !assets.length}
            onClick={() => void start()}
          >
            {done ? "检查并继续下载" : "开始预下载"}
          </button>
        )}
        <p className="muted">
          请在正式跑团时使用同一浏览器、同一站点地址。清理浏览器数据或更换设备后，需要重新下载。
        </p>
      </section>
      <a href={new URL(".", document.baseURI).href}>返回最终物语</a>
    </main>
  );
}
