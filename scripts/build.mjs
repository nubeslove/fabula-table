import { createRequire } from "node:module";
import { mkdir, writeFile, readdir, stat, readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";
const require = createRequire(import.meta.url),
  viteRequire = createRequire(require.resolve("vite/package.json"));
const { build } = viteRequire("esbuild");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(projectRoot);
const publicOutput = resolve(projectRoot, "dist/public");
if (
  !publicOutput.startsWith(
    projectRoot + (process.platform === "win32" ? "\\" : "/"),
  )
)
  throw new Error("Build output must remain inside this project.");
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["server/main.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.mjs",
  sourcemap: false,
});
await viteBuild();
await build({ entryPoints: ["server/updater.ts"], bundle: true, platform: "node", target: "node22", format: "esm", outfile: "dist/updater.mjs", sourcemap: false });
let size = 0,
  count = 0;
async function measure(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await measure(file);
    else {
      size += (await stat(file)).size;
      count++;
    }
  }
}
await measure("dist");
await writeFile(
  "dist/build-info.json",
  JSON.stringify(
    {
      product: "fabula-table",
      updateProtocol: 1,
      version: JSON.parse(await readFile("package.json", "utf8")).version,
      builtAt: new Date().toISOString(),
      files: count,
      bytes: size,
    },
    null,
    2,
  ),
);
console.log(
  `Built ${count} files, ${(size / 1024 / 1024).toFixed(2)} MB. No original rule attachments included.`,
);
