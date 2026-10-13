import { useEffect, useRef, useState } from "react";
import type { Asset } from "../shared/types";
import { apiUrl } from "./api";
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("fabula-table-assets", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("blobs");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(new Error("浏览器未允许本地资源缓存"));
    };
    request.onblocked = () => {
      database = undefined;
      reject(new Error("本地缓存正被其他页面占用，请关闭旧页面后重试"));
    };
  }).catch((error) => {
    database = undefined;
    throw error;
  }));
}
async function cached(hash: string) {
  const database = await db();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const req = database.transaction("blobs").objectStore("blobs").get(hash);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function save(hash: string, blob: Blob) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put(blob, hash);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(
        new Error("素材未能保存到浏览器；请释放缓存空间或允许站点存储后重试"),
      );
  });
}
export async function getAsset(
  world: string,
  asset: Asset,
  {
    key,
    signal,
    cacheRequired = true,
  }: { key?: string; signal?: AbortSignal; cacheRequired?: boolean } = {},
) {
  signal?.throwIfAborted();
  let warning = "";
  try {
    const hit = await cached(asset.hash);
    signal?.throwIfAborted();
    if (hit instanceof Blob && hit.size === asset.size)
      return { blob: hit, hit: true, warning };
  } catch (e) {
    if (signal?.aborted || cacheRequired) throw e;
    warning = "浏览器未允许保存素材缓存";
  }
  const response = await fetch(
    apiUrl(
      `assets/${world}/${asset.id}${key ? "?key=" + encodeURIComponent(key) : ""}`,
    ),
    { signal },
  );
  if (!response.ok) throw new Error(`${asset.name} 下载失败`);
  const blob = await response.blob();
  if (blob.size !== asset.size) throw new Error(`${asset.name} 不完整，请重试`);
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await blob.arrayBuffer(),
    );
    if (
      [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("") !== asset.hash
    )
      throw new Error(`${asset.name} 校验失败，请重试`);
  }
  signal?.throwIfAborted();
  if (!warning) {
    try {
      await save(asset.hash, blob);
    } catch (e) {
      if (cacheRequired) throw e;
      warning = (e as Error).message;
    }
  }
  return { blob, hit: false, warning };
}
export function useAssets(world: string, assets: Asset[]) {
  const urls = useRef<Record<string, string>>({}),
    pending = useRef(new Set<string>()),
    alive = useRef(true),
    [version, setVersion] = useState(0),
    [attempt, setAttempt] = useState(0),
    [error, setError] = useState(""),
    [warning, setWarning] = useState(""),
    [progress, setProgress] = useState(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      Object.values(urls.current).forEach(URL.revokeObjectURL);
      urls.current = {};
    };
  }, [world]);
  useEffect(() => {
    let cursor = 0;
    const wanted = assets.filter(
      (a) => !urls.current[a.id] && !pending.current.has(a.id),
    );
    async function worker() {
      while (cursor < wanted.length && alive.current) {
        const a = wanted[cursor++];
        pending.current.add(a.id);
        try {
          const { blob, warning } = await getAsset(world, a, {
            cacheRequired: false,
          });
          if (alive.current) {
            if (warning) setWarning(warning);
            urls.current[a.id] = URL.createObjectURL(blob);
            setVersion((n) => n + 1);
            setProgress(Object.keys(urls.current).length);
          }
        } catch (e) {
          if (alive.current) setError((e as Error).message);
        } finally {
          pending.current.delete(a.id);
        }
      }
    }
    void Promise.all([worker(), worker(), worker()]);
  }, [world, assets.map((a) => a.id).join(","), attempt]);
  return {
    urls: urls.current,
    version,
    error,
    warning,
    progress,
    retry: () => {
      setError("");
      setAttempt((n) => n + 1);
    },
  };
}
export async function prepareImage(
  file: File,
  keepDetail = false,
): Promise<Blob> {
  if (file.size > 100 * 1024 * 1024) throw new Error("单个素材最大 100 MB");
  if (!file.type.startsWith("image/")) return file;
  if (
    keepDetail &&
    ["image/png", "image/jpeg", "image/webp"].includes(file.type)
  )
    return file;
  if (file.type === "image/gif") return file;
  if (file.type === "image/webp") {
    const head = new TextDecoder("latin1").decode(
      await file.slice(0, 256).arrayBuffer(),
    );
    if (head.includes("ANIM")) return file;
  }
  if (file.type === "image/png") {
    const head = new TextDecoder("latin1").decode(
      await file.slice(0, 1024).arrayBuffer(),
    );
    if (head.includes("acTL"))
      throw new Error(
        "这是一张动态图，请先转为动画 WebP 或 WebM，避免丢失动画",
      );
  }
  let source: ImageBitmap | HTMLImageElement,
    objectUrl = "";
  try {
    source = await createImageBitmap(file);
  } catch {
    objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objectUrl;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(objectUrl);
      throw new Error("无法读取这张图片，请使用 PNG、JPEG、WebP 或有效的 SVG");
    }
    source = img;
  }
  const width =
      source instanceof HTMLImageElement ? source.naturalWidth : source.width,
    height =
      source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const factor = Math.min(1, 2560 / Math.max(width, height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.round(width * factor);
  canvas.height = Math.round(height * factor);
  const context = canvas.getContext("2d")!;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (source instanceof ImageBitmap) source.close();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => {
        if (!b) {
          reject(new Error("图片转换失败"));
          return;
        }
        resolve(
          b.size >= file.size &&
            ["image/png", "image/jpeg", "image/webp"].includes(file.type)
            ? file
            : b,
        );
      },
      "image/webp",
      0.86,
    ),
  );
}
export async function upload(file: File, keepDetail = false) {
  const blob = await prepareImage(file, keepDetail);
  const name =
    blob.type === "image/webp"
      ? file.name.replace(/\.(png|jpe?g|svg|avif)$/i, ".webp")
      : file.name;
  const response = await fetch(apiUrl("upload"), {
    method: "POST",
    headers: { "X-FU-Request": "1", "X-File-Name": encodeURIComponent(name) },
    body: blob,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return {
    asset: result.asset as Asset,
    before: file.size,
    after: result.asset.size as number,
  };
}
