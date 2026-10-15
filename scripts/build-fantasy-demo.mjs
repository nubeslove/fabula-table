import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite/package.json"))(
  "esbuild",
);
const root = new URL("../", import.meta.url);
const dir = new URL("demos/fantasy-ui/", root);
await mkdir(dir, { recursive: true });
for (const f of [
  "style.css",
  "battle.css",
  "clocks.css",
  "demo.js",
  "battle.js",
  "clocks.js",
  "assets",
])
  await cp(new URL(`demos/jrpg/${f}`, root), new URL(f, dir), {
    recursive: true,
  });
await cp(new URL("public/audio/", root), new URL("audio/", dir), {
  recursive: true,
});
await build({
  entryPoints: [
    new URL("src/lib/interface-audio.ts", root).pathname.replace(
      /^\/(\w:)/,
      "$1",
    ),
  ],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "FuSound",
  outfile: new URL("audio-engine.js", dir).pathname.replace(/^\/(\w:)/, "$1"),
});
let html = await readFile(new URL("demos/jrpg/index.html", root), "utf8");
html = html.replace(
  "最终物语 · 浅绿物语桌 / Demo 2",
  "最终物语 · 幻想边饰与声音 / 三套对比",
);
html = html.replace(
  "</head>",
  '<link rel="stylesheet" href="fantasy.css" /></head>',
);
html = html.replace(
  "<body>",
  `<body data-theme="manuscript" data-preview="lobby">
  <header class="preview-bar">
    <div class="preview-label"><b>幻想边饰</b><small>三套交互样板</small></div>
    <nav aria-label="选择边饰方案" class="theme-picker">
      <button data-theme-choice="manuscript" aria-pressed="true"><span>Ⅰ</span> 精灵手稿</button>
      <button data-theme-choice="astrolabe" aria-pressed="false"><span>Ⅱ</span> 星仪魔法</button>
      <button data-theme-choice="court" aria-pressed="false"><span>Ⅲ</span> 古典王庭</button>
    </nav>
    <div class="preview-actions"><button id="preview-lobby" aria-pressed="true">大厅</button><button id="preview-world" aria-pressed="false">游玩</button><button id="preview-sheet">角色卡</button><button id="preview-sound" aria-expanded="false">♫ 声音</button></div>
  </header>
  <section class="demo-sound" id="demo-sound" hidden aria-label="试听设置">
    <header><strong>宁静启程</strong><button id="close-sound" aria-label="关闭试听设置">×</button></header>
    <p id="music-status">点击播放，听见故事的开端。</p>
    <label><input type="checkbox" id="music-enabled" checked> 大厅音乐 <button id="play-music">播放</button></label>
    <label>音乐音量 <input id="music-volume" aria-label="音乐音量" type="range" min="0" max="100" value="28"><output id="music-volume-label">28%</output></label>
    <label><input type="checkbox" id="effects-enabled" checked> 轻触音效 <button id="test-sound">试听</button></label>
    <label>音效音量 <input id="effects-volume" aria-label="音效音量" type="range" min="0" max="100" value="30"><output id="effects-volume-label">30%</output></label>
    <small>进入世界后音乐停止，音效降为三分之一。<br>Style of Harp · Umplix · CC0</small>
  </section>
  <main class="fantasy-lobby" id="fantasy-lobby">
    <section class="lobby-hero ornamental">
      <div class="hero-sky"></div><div class="hero-sigil" aria-hidden="true"></div>
      <div class="hero-copy"><span class="overline">FABULA ULTIMA</span><h1>每一次相遇，<br>都是故事的开端。</h1><div class="flourish" aria-hidden="true"></div><p>收拾行囊，翻开新的一页。<br>你的伙伴与未完的冒险，正在这里等你。</p><button class="primary hero-enter" id="hero-enter">回到星落之庭 <span>→</span></button><small>第四章 · 钟塔以北</small></div>
      <div class="hero-footer"><span>✦ 最终物语</span><span id="theme-caption">叶蔓 · 金线 · 温润纸纹</span></div>
    </section>
    <section class="lobby-collection">
      <header class="collection-heading"><div><span class="overline">THE STORY CONTINUES</span><h2>物语大厅</h2></div><span class="demo-user">阿云 <i>旅人</i></span></header>
      <div class="lobby-tabs"><button class="active">最近的旅途</button><button id="all-rooms">全部世界</button><span>03</span></div>
      <div class="room-list">
        <article class="lobby-card ornamental featured"><div class="room-art clocktower"></div><div class="room-copy"><span class="chapter-tag">CHAPTER IV <i>进行中</i></span><h3>星落之庭</h3><p>钟声停了，可那个约定仍在等待。</p><footer><span>4 位旅人 · 自由加入</span><button class="primary enter-demo">继续旅程 →</button></footer></div></article>
        <article class="lobby-card ornamental"><div class="room-symbol" aria-hidden="true">❧</div><div class="room-copy"><span class="chapter-tag">CHAPTER I</span><h3>森林的回声</h3><p>沿着苔痕，寻找失落的春日。</p><footer><span>3 位旅人 · 需要密码</span><button class="enter-demo">进入 →</button></footer></div></article>
        <article class="lobby-card ornamental"><div class="room-symbol moon-symbol" aria-hidden="true">☽</div><div class="room-copy"><span class="chapter-tag">PROLOGUE</span><h3>白塔来信</h3><p>一封没有署名的信，一次尚未启程的冒险。</p><footer><span>2 位旅人 · 自由加入</span><button class="enter-demo">进入 →</button></footer></div></article>
      </div>
      <footer class="collection-footer"><span>边饰样板 · 示例世界</span><button id="lobby-listen">♫ 试听大厅音乐</button></footer>
    </section>
  </main>`,
);
html = html.replace("DEMO 2 · 演示选项", "演示选项");
html = html.replace(
  "</body>",
  '<script src="audio-engine.js"></script><script src="fantasy.js"></script></body>',
);
await writeFile(new URL("index.html", dir), html);

// Original vector ornaments. Their outer lines stay crisp at every viewport size.
const ornaments = {
  manuscript: `<g fill="none" stroke="#a98e51" stroke-width="1"><path d="M5 104V20Q5 5 20 5h84M11 77V24Q11 11 24 11h53M13 65C41 66 8 22 60 18M18 58C37 43 24 22 61 20"/><path fill="#819573" fill-opacity=".45" d="M18 51Q11 33 25 28Q34 41 18 51M29 33Q30 16 45 18Q45 30 29 33M46 22Q52 10 66 15Q64 26 46 22M18 53Q35 50 36 65Q20 66 18 53M24 36Q43 31 48 42Q34 49 24 36"/><path d="M17 70Q28 79 23 89Q17 83 17 70M69 17Q79 25 90 21M34 13l4-4 4 4-4 4z"/><circle cx="10" cy="10" r="3" fill="#b69b5d"/><circle cx="64" cy="18" r="2"/></g>`,
  astrolabe: `<g fill="none" stroke="#9d915f" stroke-width=".8"><path d="M5 105V29L29 5h76M11 83V34L34 11h49"/><circle cx="29" cy="29" r="22"/><circle cx="29" cy="29" r="17"/><circle cx="29" cy="29" r="11"/><path d="M29 2v8M29 48v8M2 29h8M48 29h8M10 10l6 6M42 42l6 6M10 48l6-6M42 16l6-6M15 7l3 6M40 45l3 6M7 43l6-3M45 18l6-3"/><path fill="#71978a" fill-opacity=".35" d="m29 13 4 12 12 4-12 4-4 12-4-12-12-4 12-4z"/><path d="M57 8h28m-20-3v6m10-6v6M8 57v28m-3-20h6m-6 10h6M60 18l7 7-7 7-7-7z"/><circle cx="29" cy="29" r="3" fill="#ac955d"/></g>`,
  court: `<g fill="none" stroke="#9d7d42" stroke-width="1.2"><path d="M4 112V25Q4 4 25 4h87M10 97V31Q10 10 31 10h66M15 80V33Q15 15 33 15h47"/><path fill="#cab477" fill-opacity=".45" d="M17 55C37 67 48 42 34 33C17 24 17 46 29 45C34 44 32 38 28 39C45 46 29 60 17 55M55 17C67 37 42 48 33 34C24 17 46 17 45 29C44 34 38 32 39 28C46 45 60 29 55 17"/><path d="M21 61C41 78 10 81 19 97M61 21C78 41 81 10 97 19M22 67C36 57 43 68 34 72M67 22C57 36 68 43 72 34M20 23l3-11 3 11 11 3-11 3-3 11-3-11-11-3z"/><path fill="#e7d5a3" d="M39 50q14-10 19 8-18-5-8-19M9 9l7 2-5 5z"/><circle cx="23" cy="26" r="2.5" fill="#698166"/><path d="M32 8h5m5 0h5m5 0h5M8 32v5m0 5v5m0 5v5"/></g>`,
};
for (const [theme, content] of Object.entries(ornaments)) {
  for (const [corner, transform] of Object.entries({
    tl: "",
    tr: "translate(120 0) scale(-1 1)",
    bl: "translate(0 120) scale(1 -1)",
    br: "translate(120 120) scale(-1 -1)",
  }))
    await writeFile(
      new URL(`assets/${theme}-${corner}.svg`, dir),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g transform="${transform}">${content}</g></svg>`,
    );
}
console.log("Fantasy demo built: demos/fantasy-ui/index.html");
