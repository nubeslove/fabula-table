import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  unlink,
  rmdir,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { UserError } from "./validation";
const ffmpeg = process.env.FU_FFMPEG || "ffmpeg";
let busy = false;
function run(args: string[], timeout = 600000) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(ffmpeg, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let error = "";
    const timer = setTimeout(() => {
      p.kill();
      reject(new UserError("音视频转换超时，请缩短视频或降低分辨率后再试"));
    }, timeout);
    p.stderr.on("data", (b) => {
      error = (error + b.toString()).slice(-4000);
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new UserError("音视频转换失败，请确认文件可正常播放"));
    });
  });
}
export async function converterAvailable() {
  try {
    await run(["-version"], 5000);
    return true;
  } catch {
    return false;
  }
}
export async function compress(
  data: Buffer,
  mime: string,
): Promise<{ data: Buffer; mime: string; converted: boolean }> {
  if (!mime.startsWith("video/") && !mime.startsWith("audio/"))
    return { data, mime, converted: false };
  const available = await converterAvailable();
  if (!available) {
    if (["video/mp4", "video/webm", "audio/ogg", "audio/mpeg"].includes(mime))
      return { data, mime, converted: false };
    throw new UserError(
      "服务器未安装音视频转换器，请上传 WebM / MP4 或 MP3 / Ogg，或由部署者安装 FFmpeg",
    );
  }
  if (busy) throw new UserError("正在压缩上一份音视频，请稍后重试", 429);
  busy = true;
  const folder = await mkdtemp(join(tmpdir(), "fu-media-"));
  try {
    const input = join(folder, "source"),
      video = mime.startsWith("video/"),
      output = join(folder, video ? "optimized.webm" : "optimized.ogg");
    await writeFile(input, data);
    const args = [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      input,
      "-map_metadata",
      "-1",
    ];
    if (video)
      args.push(
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-map",
        "0:s?",
        "-vf",
        "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v",
        "libvpx-vp9",
        "-crf",
        "34",
        "-b:v",
        "0",
        "-deadline",
        "good",
        "-cpu-used",
        "4",
        "-row-mt",
        "1",
        "-threads",
        "2",
        "-c:a",
        "libopus",
        "-b:a",
        "96k",
        "-c:s",
        "webvtt",
      );
    else args.push("-vn", "-c:a", "libopus", "-b:a", "96k");
    args.push(output);
    await run(args);
    const optimized = await readFile(output);
    if (
      optimized.length >= data.length &&
      ["video/mp4", "video/webm", "audio/mpeg", "audio/ogg"].includes(mime)
    )
      return { data, mime, converted: false };
    return {
      data: optimized,
      mime: video ? "video/webm" : "audio/ogg",
      converted: true,
    };
  } finally {
    for (const file of await readdir(folder)) await unlink(join(folder, file));
    await rmdir(folder);
    busy = false;
  }
}
