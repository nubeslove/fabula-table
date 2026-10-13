import type { Command, Session } from "../shared/types";
export const apiUrl = (path: string) =>
  new URL("api/" + path, document.baseURI).href;
export async function api<T = Session>(
  path: string,
  value?: unknown,
): Promise<T> {
  const response = await fetch(
    apiUrl(path),
    value === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-FU-Request": "1" },
          body: JSON.stringify(value),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "连接失败");
  return result;
}
export const command = (value: Command) => api("command", value);
export const uid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  // IP + HTTP deployments still have getRandomValues, but not randomUUID.
  const value = crypto.getRandomValues(new Uint8Array(16));
  value[6] = (value[6] & 0x0f) | 0x40;
  value[8] = (value[8] & 0x3f) | 0x80;
  const hex = [...value].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const bytes = (n: number) =>
  n < 1024
    ? n + " B"
    : n < 1048576
      ? (n / 1024).toFixed(1) + " KB"
      : (n / 1048576).toFixed(1) + " MB";
export function download(name: string, data: Blob | string) {
  const url = URL.createObjectURL(
      typeof data === "string"
        ? new Blob([data], { type: "application/json" })
        : data,
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copy(text: string) {
  if (navigator.clipboard) await navigator.clipboard.writeText(text);
  else throw new Error("复制需要 HTTPS；请直接选择链接文字复制");
}
