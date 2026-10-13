import { createHash } from "node:crypto";
export interface ProgramRelease {
  version: string;
  notes: string;
  page: string;
  url: string;
  sha256: string;
  size: number;
}
export function newerVersion(next: string, current: string) {
  if (![next, current].every((v) => /^\d+\.\d+\.\d+$/.test(v))) return false;
  const a = next.split(".").map(Number),
    b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
export function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "FabulaTable-Updater",
    "X-GitHub-Api-Version": "2026-03-10",
    ...(process.env.FU_GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.FU_GITHUB_TOKEN}` }
      : {}),
  };
}
export async function getProgramRelease(
  repo: string,
  version?: string,
): Promise<ProgramRelease | null> {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo))
    throw new Error("更新仓库配置不正确");
  if (version && !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error("版本号不正确");
  const response = await fetch(
    `https://api.github.com/repos/${repo}/releases/${version ? "tags/v" + version : "latest"}`,
    {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (response.status === 404 && !version) return null;
  if (!response.ok)
    throw new Error(
      `暂时无法读取 GitHub 更新（${response.status}），请稍后重试`,
    );
  const value = await response.json();
  const v = String(value.tag_name).replace(/^v/, "");
  if (
    value.draft ||
    value.prerelease ||
    !/^\d+\.\d+\.\d+$/.test(v) ||
    (version && v !== version)
  )
    throw new Error("更新版本不是正式发行版");
  const name = `fabula-table-${v}.zip`;
  const asset = value.assets?.find((a: { name: string }) => a.name === name);
  if (
    !asset ||
    !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? "") ||
    asset.size > 100 * 1024 * 1024
  )
    throw new Error("正式版本尚未提供完整、可校验的程序包");
  if (
    asset.browser_download_url !==
    `https://github.com/${repo}/releases/download/v${v}/${name}`
  )
    throw new Error("更新下载地址与仓库不一致");
  return {
    version: v,
    notes: String(value.body ?? "").slice(0, 6000),
    page: `https://github.com/${repo}/releases/tag/v${v}`,
    url: process.env.FU_GITHUB_TOKEN
      ? `https://api.github.com/repos/${repo}/releases/assets/${asset.id}`
      : asset.browser_download_url,
    sha256: asset.digest.slice(7),
    size: asset.size,
  };
}
export async function downloadProgram(release: ProgramRelease) {
  const response = await fetch(release.url, {
    headers: { ...githubHeaders(), Accept: "application/octet-stream" },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok || !response.body)
    throw new Error(`下载更新失败（${response.status}）`);
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > release.size || length > 100 * 1024 * 1024)
        throw new Error("更新包大小与发行记录不一致");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  if (
    bytes.length !== release.size ||
    createHash("sha256").update(bytes).digest("hex") !== release.sha256
  )
    throw new Error("更新包校验失败，原程序保持不变");
  return bytes;
}
