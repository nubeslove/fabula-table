/* Isolated, offline UI prototype. No world API, account, or production storage. */
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const state = {
  mode: "story",
  sheet: "spells",
  spell: "gate",
  filter: "all",
  search: "",
  item: "starblade",
  preset: "custom",
  hands: ["starblade", "starblade"],
  armor: "robe",
  accessory: "pendant",
  channel: "ic",
  dice: 2,
  move: 4,
  limit: 4,
  turn: 1,
  position: [3, 7],
  round: 1,
  speaker: "lina",
  line: 0,
  notes: [],
  custom: {},
  unread: new Set(["ooc", "combat"]),
  partyCount: 4,
  enemyCount: 4,
  battlePages: { ally: 0, enemy: 0 },
  acted: new Set(),
  clockOpen: "",
  clockFilter: "all",
  clockSearch: "",
};
const people = {
  lina: {
    name: "莉娜 · 银岚",
    short: "莉娜",
    sign: "莉",
    hp: 46,
    mp: 38,
    z: 1280,
    role: "秘仪师",
    color: "#425a6c",
  },
  rein: {
    name: "雷恩 · 守卫",
    short: "雷恩",
    sign: "雷",
    hp: 72,
    mp: 30,
    z: 860,
    role: "守护者",
    color: "#3b5363",
  },
  io: {
    name: "伊芙 · 游侠",
    short: "伊芙",
    sign: "伊",
    hp: 50,
    mp: 45,
    z: 420,
    role: "游荡者",
    color: "#56506d",
  },
};
const spells = [
  {
    id: "gate",
    name: "门径奥灵",
    type: "magic",
    school: "秘仪师 · 奥灵契约",
    cost: "30",
    target: "任意可见生物",
    duration: "场景",
    glyph: "star",
    tag: "融合／遣散",
    source: "用户提供的角色卡样例",
    flavor: "门扉之后，是那些尚未抵达的远方。",
    body: '<p><b>融合</b>　你对<b>暗系伤害</b>获得抵抗相性；你的<b>魔防 +1</b>。</p><p><b>遣散</b>　遣散此奥灵时，选择触发下列一项效果：</p><div class="rule-block"><b>湮灭</b><p>选择任意数量的你所能看见的生物作为目标。你对每个目标造成 <span class="formula">30 点暗系伤害</span>，<b>无视抵抗相性</b>。</p><b>折跃</b><p>将你自己与你附近至多五个自愿接受传送的生物传送到一处你曾造访的地点；该地点必须位于一个旅行日的路程之内。</p></div>',
    note: "30 MP 与目标栏按用户样例；折跃的目标限制另见效果。",
  },
  {
    id: "haste",
    name: "加速术",
    type: "magic",
    school: "熵师 · 熵系魔法",
    cost: "20",
    target: "一个人物",
    duration: "场景",
    glyph: "moon",
    tag: "辅助",
    source: "用户提供的角色卡样例",
    flavor: "让一瞬变得悠长，让迟来的回应赶上命运。",
    body: '<p>在目标的<b>每个回合结束时</b>，他可以选择一项触发：</p><div class="rule-block"><p><b>顺势攻击</b>　使用他正装备的一件武器进行一次顺势攻击。</p><p><b>顺势行动</b>　执行一次类型为施法的顺势行动。所施放法术的精神值总消耗<b>不得高于 10 点</b>，且仍需如常支付消耗。</p></div><p>同一个人物从单次法术效果中<b>第一次获得增益后</b>，此法术效果结束。</p>',
    note: "按所提供样例排版；与旧核心译本“加速”区分版本。",
  },
  {
    id: "drain",
    name: "精神汲取",
    type: "magic",
    school: "熵师 · 熵系魔法",
    cost: "5",
    target: "一个人物",
    duration: "瞬发",
    glyph: "moon",
    tag: "攻击",
    source: "用户提供的角色卡样例",
    flavor: "吞噬一缕心力，补回自己的精神。",
    body: '<p>你吞噬了一个人物的心力。目标失去 <span class="formula">【高值 + 20】MP</span>。</p><p>然后，你恢复等同于 <span class="formula">【目标此次精神值损失量 ÷ 2】</span> 的精神值。</p><div class="rule-block"><b>没有造成精神值损失</b><p>若目标精神值归零，则不会恢复任何精神值；以本桌选用版本及 GM 裁定为准。</p></div>',
    note: "此条采用用户样例版本，不替换旧核心的“抽取精魂”。",
  },
  {
    id: "element",
    name: "元素武器",
    type: "magic",
    school: "元素师 · 元素魔法",
    cost: "10",
    target: "一把武器",
    duration: "场景",
    glyph: "sword",
    tag: "辅助",
    source: "核心规则书 · 印刷 188 页",
    flavor: "魔力沿着刃口流动，赋予钢铁另一种颜色。",
    body: '<p>选择一种伤害类型：<b>风、电、土、火或冰</b>。在此咒语结束之前，该武器造成的所有伤害都会变成所选类型。</p><p>如果施放时你装备了该武器，可以在同一动作中使用它进行一次<b>自由攻击</b>。</p><div class="rule-block"><b>目标限制</b><p>只能施放在自愿接受此效果的生物所装备的武器上。</p></div>',
    note: "条目用于展示不同规则来源，展示角色不代表合法建卡。",
  },
  {
    id: "shields",
    name: "双重盾牌",
    type: "ability",
    school: "守护者 · 职业技能",
    cost: "—",
    target: "自身",
    duration: "装备期间",
    glyph: "shield",
    tag: "被动",
    source: "核心规则书 · 印刷 197 页",
    flavor: "一面守护自己，一面守护重要的人。",
    body: '<p>你可以在<b>主手栏位装备盾牌</b>。</p><p>装备两面盾牌时，同时获得两件物品的好处；可将它们合并视为<b>格斗类别的双手近战武器</b>。</p><div class="rule-block"><p><b>命中</b>　<span class="formula">【MIG + MIG】</span></p><p><b>伤害</b>　<span class="formula">【HR + 5】物理</span>，并额外加上<b>防守掌握的 SL</b>。</p></div>',
    note: "双盾由此技能支持；也可在装备页登记 GM 私设。",
  },
  {
    id: "dual",
    name: "双武器战斗",
    type: "action",
    school: "基础动作 · 攻击",
    cost: "—",
    target: "一个或不同目标",
    duration: "本次攻击",
    glyph: "sword",
    tag: "双持",
    source: "核心规则书 · 印刷 69 页",
    flavor: "两把兵器，两次应答。",
    body: '<p>执行攻击动作且装备两件<b>相同类别</b>的武器时，可以声明同时使用两件武器攻击。两次攻击可按任意顺序，针对相同或不同目标。</p><div class="rule-block"><p><b>两次攻击均失去多重，且不能获得多重。</b></p><p>计算伤害时，两次攻击的 <span class="formula">HR 均视为 0</span>。</p></div><p><b>自由攻击不适用</b>。英雄技能“灵巧双手”可支持不同类别的双武器。</p>',
    note: "只提供规则速查与行动声明，掷骰和伤害由玩家／GM 处理。",
  },
];
const items = [
  {
    id: "starblade",
    name: "星轨刃",
    kind: "weapon",
    glyph: "sword",
    sub: "自定义 · 双手 · 职业剑",
    hands: 2,
    hit: "DEX + INS + 2",
    damage: "HR + 12 · 光",
    cost: "300 Z",
    source: "CHM · 自定义武器第 2、3 节",
    body: '<p>以 <b>300 泽尼特</b>的基础自定义武器为起点，采用 <b>DEX + INS</b> 命中与近战类型，分配三份定制名额。</p><div class="rule-block"><p><b>精准</b>　命中检定 +2。</p><p><b>元素 · 光</b>　改为光属性，伤害 +2。</p><p><b>强力</b>　伤害 +5，同时获得职业武器要求。</p></div><p>基础 HR+5，加上 2 与 5，合计 <b>HR+12 光</b>。<b>始终占用双手</b>；不能因“灵猴握”改成单手。</p>',
  },
  {
    id: "sword-a",
    name: "细剑 · 晨光",
    kind: "weapon",
    glyph: "sword",
    sub: "剑 · 单手 · 近战",
    hands: 1,
    hit: "DEX + INS + 1",
    damage: "HR + 6 · 物理",
    cost: "200 Z",
    source: "核心规则书 · 基础武器",
    body: "<p>单手职业剑，命中使用 <b>DEX + INS + 1</b>，伤害为 <b>HR+6 物理</b>。</p><p>“晨光”是这件示例武器的个人命名。可放入主手或副手，与另一把剑形成同类别双持。</p>",
  },
  {
    id: "sword-b",
    name: "细剑 · 暮色",
    kind: "weapon",
    glyph: "sword",
    sub: "剑 · 单手 · 近战",
    hands: 1,
    hit: "DEX + INS + 1",
    damage: "HR + 6 · 物理",
    cost: "200 Z",
    source: "核心规则书 · 基础武器",
    body: "<p>与“晨光”为两件独立物品。装备记录按<b>物品实例</b>区分，不会把同一件武器放进两只手。</p><p>双武器攻击请查看“能力与法术 → 双武器战斗”，由玩家分别掷骰与计算伤害。</p>",
  },
  {
    id: "bronze",
    name: "青铜盾牌",
    kind: "shield",
    glyph: "shield",
    sub: "盾牌 · 单手",
    hands: 1,
    hit: "物防 +2",
    damage: "魔防 —",
    cost: "100 Z",
    source: "核心规则书 · 印刷 133 页",
    body: "<p>装备时获得 <b>物防 +2</b>。</p><p>通常放在副手；<b>双重盾牌</b>技能允许在主手装备盾牌。双盾时两个物品各占一只手，均显示自己的防御增益。</p>",
  },
  {
    id: "rune",
    name: "符文盾牌",
    kind: "shield",
    glyph: "shield",
    sub: "职业盾牌 · 单手",
    hands: 1,
    hit: "物防 +2",
    damage: "魔防 +2",
    cost: "150 Z",
    source: "核心规则书 · 印刷 133 页",
    body: "<p>装备时获得 <b>物防 +2、魔防 +2</b>；属于职业盾牌。</p><p>主手持盾由“双重盾牌”技能或本桌私设支持。界面保留规则说明，不自动代算双盾攻击。</p>",
  },
  {
    id: "robe",
    name: "贤者长袍",
    kind: "armor",
    glyph: "armor",
    sub: "防具",
    hit: "DEX 骰尺寸 +1",
    damage: "INS 骰尺寸 +2",
    cost: "200 Z",
    source: "核心规则书 · 印刷 132 页",
    body: "<p><b>物防</b>为 DEX 骰尺寸 +1；<b>魔防</b>为 INS 骰尺寸 +2；<b>先攻修正 −2</b>。</p><p>仅穿戴中的防具生效。放在背包里的备用防具不计入当前装备。</p>",
  },
  {
    id: "pendant",
    name: "旧日罗盘",
    kind: "accessory",
    glyph: "ring",
    sub: "饰品 · GM 自定",
    hit: "叙事物品",
    damage: "无数值效果",
    cost: "纪念品",
    source: "Demo 私设示例",
    body: "<p>母亲留下的旧罗盘。指针在接近钟塔时会轻微颤动。</p><p><b>私设说明</b>：它目前不提供数值加成；具体用途由主持人决定。</p>",
  },
  {
    id: "letter",
    name: "未寄出的信",
    kind: "story",
    glyph: "book",
    sub: "线索 · 背包",
    hit: "剧情物品",
    damage: "不可装备",
    cost: "—",
    source: "Demo 手记示例",
    body: "<p>封蜡上的纹章，与你在钟塔门口见到的图案相同。</p><p><b>线索</b>：信封没有收件人的名字，只有一句“留给听见钟声的人”。</p>",
  },
];
const clocks = [
  { id: "search", name: "搜查队逼近", meaning: "街区封锁", value: 3, max: 6 },
  { id: "gate", name: "重启星门", meaning: "钟塔仪式", value: 2, max: 8 },
  { id: "dawn", name: "黎明将至", meaning: "夜晚的最后时刻", value: 1, max: 4 },
  {
    id: "enemy",
    name: "打断共鸣",
    meaning: "敌方仪式",
    value: 2,
    max: 6,
    area: "upper",
  },
  {
    id: "rescue",
    name: "护送研究员",
    meaning: "我方目标",
    value: 3,
    max: 8,
    area: "lower",
  },
  {
    id: "extra",
    name: "修复观星镜",
    meaning: "备用命刻",
    value: 0,
    max: 6,
    extra: true,
  },
];
clocks.push(
  ...[
    ["beacon", "点亮北岸的三座灯塔", "远行准备", 1, 6],
    ["alliance", "争取钟塔守卫的信任", "关系与承诺", 2, 8],
    ["flood", "湖水上涨", "环境危机", 2, 6],
    ["letter", "解开信中的暗号", "调查线索", 0, 4],
    ["ship", "修好渡船", "旅程目标", 3, 6],
    ["echo", "寻找失落的钟声", "主线线索", 1, 8],
    ["supplies", "准备越过迷雾森林的补给", "旅行准备", 2, 6],
    ["dawn", "与黎明的约定", "人物故事", 1, 4],
  ].map(([id, name, meaning, value, max]) => ({
    id,
    name,
    meaning,
    value,
    max,
    extra: true,
  })),
);
const channelNames = {
  ic: "场内",
  ooc: "场外",
  dice: "掷骰",
  combat: "战斗",
  system: "系统",
};
const messages = {
  ic: [
    {
      name: "GM",
      text: "石阶的尽头，停摆的钟塔仍透出一点温暖的光。你们听到门后传来脚步声。",
      at: "21:34",
    },
    {
      name: "雷恩",
      text: "我走在前面。莉娜，你还记得那段旋律吗？",
      at: "21:35",
    },
    {
      name: "莉娜",
      text: "记得。只是这一次，钟声少了最后一拍。",
      at: "21:36",
      mine: true,
    },
  ],
  ooc: [
    {
      name: "阿云 · 玩家",
      text: "随时可以在这里讨论规则和计划。",
      at: "21:32",
    },
  ],
  dice: [],
  combat: [
    {
      name: "GM",
      text: "冲突示例已准备。行动声明、掷骰和资源调整分别处理。",
      at: "21:34",
    },
  ],
  system: [
    {
      name: "系统",
      text: "这是独立交互 demo。所有操作仅在此页演示，刷新后恢复样例。",
      at: "21:30",
    },
  ],
};
let toastTimer;
function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3200);
}
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((b) => {
    if (b.tagName === "BUTTON")
      b.classList.toggle("active", b.dataset.mode === mode);
  });
  $("stage").dataset.mode = mode;
  ["story", "explore", "conflict"].forEach(
    (m) => ($(m + "-view").hidden = m !== mode),
  );
  $("scene-tag").textContent =
    `SCENE 04 · ${mode === "story" ? "演出" : mode === "explore" ? "探索" : "冲突"}`;
  $("scene-title").textContent = mode === "explore" ? "钟塔回廊" : "星落钟塔";
  if (mode === "explore") renderMap();
  $("sheet").hidden = true;
  toggleSceneClocks(state.clockOpen || "upper", false);
  if (mode === "conflict") requestAnimationFrame(renderCombat);
}
document
  .querySelectorAll("button[data-mode]")
  .forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
const lines = {
  lina: [
    "钟声停了。可我总觉得……那道门的另一边，还有人在等我们。",
    "如果这是回家的路，就让我再相信它一次。",
  ],
  rein: ["你们退后。我来推开这扇门。", "无论门后是什么，我会站在你们身边。"],
  io: ["看那边，石头上的纹路正在发光。", "这座钟塔，恐怕从来都没有真正睡着。"],
};
function renderCast() {
  $("cast").innerHTML = Object.entries(people)
    .map(
      ([id, p]) =>
        `<button class="cast-person ${state.speaker === id ? "speaking" : ""}" data-speaker="${id}" aria-label="由${p.short}演出">${id === "lina" ? '<img src="assets/silver-wayfarer.webp" alt="莉娜立绘">' : `<span class="cast-token token-${id}">${p.sign}</span>`}<span>${p.short}</span></button>`,
    )
    .join("");
  $("speaker-name").textContent = people[state.speaker].name;
  $("dialogue-text").textContent = lines[state.speaker][state.line % 2];
  document.querySelectorAll("[data-speaker]").forEach(
    (b) =>
      (b.onclick = () => {
        state.speaker = b.dataset.speaker;
        state.line = 0;
        renderCast();
      }),
  );
}
$("next-line").onclick = () => {
  state.line++;
  renderCast();
};
function blocked(x, y) {
  return (
    (y === 2 && x > 3 && x < 12 && x !== 8) ||
    (x === 11 && y > 2 && y < 8 && y !== 5) ||
    (x < 3 && y < 6)
  );
}
function renderMap() {
  const [px, py] = state.position;
  let html = "";
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 15; x++) {
      const wall = blocked(x, y),
        isPlayer = x === px && y === py,
        reachable = !wall && pathDistance([x, y]) <= state.move;
      html += `<button aria-label="第 ${x + 1} 列第 ${y + 1} 行${isPlayer ? "，莉娜所在格" : ""}" data-x="${x}" data-y="${y}" class="${wall ? (x < 3 ? "water" : "wall") : reachable ? "reachable" : ""} ${isPlayer ? "player" : ""} ${x === 12 && y === 3 ? "poi" : ""}" ${wall ? "disabled" : ""}>${isPlayer ? "莉" : x === 12 && y === 3 ? "✦" : ""}</button>`;
    }
  $("grid-map").innerHTML = html;
  $("moves").textContent = state.move;
  $("move-turn").textContent = `第 ${state.turn} 轮`;
  $("move-limit-display").textContent = state.limit;
}
// Demo movement uses a small orthogonal BFS so walls cannot be crossed by a distant click.
function pathDistance(to) {
  const queue = [[...state.position, 0]],
    seen = new Set([state.position.join(",")]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y, n] = queue[i];
    if (x === to[0] && y === to[1]) return n;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const xx = x + dx,
        yy = y + dy,
        k = xx + "," + yy;
      if (
        xx < 0 ||
        xx > 14 ||
        yy < 0 ||
        yy > 9 ||
        blocked(xx, yy) ||
        seen.has(k)
      )
        continue;
      seen.add(k);
      queue.push([xx, yy, n + 1]);
    }
  }
  return Infinity;
}
$("grid-map").onclick = (e) => {
  const b = e.target.closest("[data-x]");
  if (!b) return;
  const pos = [Number(b.dataset.x), Number(b.dataset.y)],
    cost = pathDistance(pos);
  if (cost > state.move) {
    toast("本回合剩余格数不足；也不能穿过墙壁。");
    return;
  }
  state.position = pos;
  state.move -= cost;
  renderMap();
};
$("end-turn").onclick = () => {
  state.turn++;
  state.move = state.limit;
  renderMap();
  toast("进入下一轮，移动格数已恢复。");
};
$("move-limit").onchange = (e) => {
  state.limit = Number(e.target.value);
  state.move = state.limit;
  renderMap();
  toast(`此场景每轮可移动 ${state.limit} 格`);
};
function openSheet(tab) {
  $("sheet").dataset.context = "character";
  state.sheet = tab;
  $("sheet").hidden = false;
  renderSheet();
}
function closeSheet() {
  $("sheet").hidden = true;
  $("open-sheet").focus();
}
$("sheet-close").onclick = closeSheet;
$("open-sheet").onclick = () => openSheet("overview");
$("open-actions").onclick = openActions;
document.querySelectorAll("[data-sheet]").forEach(
  (b) =>
    (b.onclick = () => {
      state.sheet = b.dataset.sheet;
      renderSheet();
    }),
);
function renderSheet() {
  $("sheet").dataset.tab = state.sheet;
  document
    .querySelectorAll("[data-sheet]")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.sheet === state.sheet),
    );
  if (state.sheet === "gear") renderGear();
  else if (state.sheet === "spells") renderSpells();
  else renderOverview();
}
function openActions() {
  if (!["gate", "haste", "drain"].includes(state.spell)) state.spell = "gate";
  $("sheet").dataset.context = "action";
  $("sheet").hidden = false;
  $("sheet-content").innerHTML =
    `<div class="quick-actions"><section><div class="section-label">本回合行动 <small>莉娜 · 手动声明</small></div><div class="basic-actions">${[
      ["攻击", "sword"],
      ["防御", "shield"],
      ["装备", "pack"],
      ["物品", "ring"],
    ]
      .map(
        ([name, glyph]) =>
          `<button data-basic="${name}">${icon(glyph)}<span>${name}</span></button>`,
      )
      .join(
        "",
      )}</div><button class="quiet" id="quick-full">打开完整角色卡 ↗</button></section><section><div class="section-label">常用法术 <small>点选后确认声明</small></div><div class="quick-spells">${spells
      .filter((s) => s.type === "magic")
      .slice(0, 3)
      .map(
        (s) =>
          `<button data-quick-spell="${s.id}" class="${state.spell === s.id ? "active" : ""}"><b>${s.name}</b><span>${s.cost} <small>MP</small></span></button>`,
      )
      .join(
        "",
      )}</div></section><section class="quick-preview" id="quick-preview"></section></div>`;
  $("quick-full").onclick = () => openSheet("spells");
  document.querySelectorAll("[data-basic]").forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.basic === "装备") {
          openSheet("gear");
          return;
        }
        addMessage(
          "combat",
          "莉娜",
          `声明「${b.dataset.basic}」行动，等待手动处理。`,
          true,
        );
        state.channel = "combat";
        renderMessages();
        toast(`已声明${b.dataset.basic}，未自动结算。`);
      }),
  );
  document.querySelectorAll("[data-quick-spell]").forEach(
    (b) =>
      (b.onclick = () => {
        state.spell = b.dataset.quickSpell;
        document
          .querySelectorAll("[data-quick-spell]")
          .forEach((x) => x.classList.toggle("active", x === b));
        renderQuickPreview();
      }),
  );
  renderQuickPreview();
}
function renderQuickPreview() {
  const s = spells.find((x) => x.id === state.spell);
  $("quick-preview").innerHTML =
    `<h3>${s.name}</h3><p>${s.cost} MP · ${s.target} · ${s.duration}</p><small>${s.tag === "攻击" ? "攻击法术 · 掷骰与伤害由玩家处理" : s.tag + " · 效果由 GM 裁定"}</small><div><button id="quick-read">阅读条目</button><button id="quick-declare" class="primary">声明使用</button></div>`;
  $("quick-read").onclick = () => openSheet("spells");
  $("quick-declare").onclick = () => {
    addMessage(
      "combat",
      "莉娜",
      `声明使用「${s.name}」 · 标示 ${s.cost} MP；未扣除资源。`,
      true,
    );
    state.channel = "combat";
    renderMessages();
    toast("行动已记入战斗日志");
  };
}
function renderOverview() {
  $("sheet-content").innerHTML =
    `<div class="overview"><section><h3>四项属性</h3><div class="attributes">${[
      ["灵巧", "DEX", "d8"],
      ["洞察", "INS", "d10"],
      ["力量", "MIG", "d6"],
      ["意志", "WLP", "d8"],
    ]
      .map(
        ([n, a, v]) => `<div><small>${n}</small><b>${v}</b><em>${a}</em></div>`,
      )
      .join(
        "",
      )}</div><h3>走在旅途中的人</h3><p>来自海雾之城的旅人。带着一柄星光缠绕的剑，寻找失踪的母亲留下的最后一封信。</p><div class="profile-line"><small>身份</small><b>追逐钟声的旅人</b></div><div class="profile-line"><small>主题</small><b>失去与重新相逢</b></div></section><section><h3>此刻的牵挂</h3><div class="profile-line"><small>雷恩</small><b>信任 · 不愿再失去的同伴</b></div><div class="profile-line"><small>伊芙</small><b>好奇 · 她似乎知道更多</b></div><div class="section-label">当前装备 <button class="quiet" id="overview-gear">查看装备 →</button></div><p>${currentEquipment()
      .map((i) => esc(i.name))
      .join(
        " · ",
      )}</p><h3>展示范围</h3><p>这个角色集合了不同类型的条目，用于检验排版。实际职业资格与本桌规则将在正式建卡接入时保留。</p><button class="primary" id="overview-spells">查看能力与法术</button></section></div>`;
  $("overview-gear").onclick = () => openSheet("gear");
  $("overview-spells").onclick = () => openSheet("spells");
}
function renderSpells() {
  const c = spells.find((x) => x.id === state.spell);
  $("sheet-content").innerHTML =
    `<div class="catalog-pane"><div class="catalog-toolbar"><input id="spell-search" type="search" placeholder="查找能力、法术或关键词" aria-label="搜索能力与法术" value="${esc(state.search)}"><div class="filter-row"><button data-filter="all" class="${state.filter === "all" ? "active" : ""}">全部</button><button data-filter="magic" class="${state.filter === "magic" ? "active" : ""}">法术</button><button data-filter="ability" class="${state.filter === "ability" ? "active" : ""}">能力</button></div></div><div class="catalog-list" id="spell-list"></div></div><article class="detail-pane" id="spell-detail">${spellDetail(c)}</article>`;
  renderSpellList();
  $("spell-search").oninput = (e) => {
    state.search = e.target.value;
    renderSpellList();
  };
  document.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        state.filter = b.dataset.filter;
        document
          .querySelectorAll("[data-filter]")
          .forEach((x) => x.classList.toggle("active", x === b));
        renderSpellList();
      }),
  );
  bindSpellDetail();
}
function renderSpellList() {
  const term = state.search.trim().toLowerCase();
  const list = spells.filter(
    (x) =>
      (state.filter === "all" ||
        (state.filter === "magic" ? x.type === "magic" : x.type !== "magic")) &&
      (!term ||
        (x.name + x.school + x.body.replace(/<[^>]*>/g, ""))
          .toLowerCase()
          .includes(term)),
  );
  $("spell-list").innerHTML = list.length
    ? list
        .map(
          (c) =>
            `<button class="entry-button ${c.id === state.spell ? "selected" : ""}" data-spell="${c.id}"><span class="entry-icon">${icon(c.glyph)}</span><span><b>${c.name}</b><small>${c.school.split(" · ")[0]} · ${c.tag}</small></span><span class="entry-cost">${c.cost}<small>${c.cost === "—" ? "被动／动作" : "MP"}</small></span></button>`,
        )
        .join("")
    : '<p class="gear-note">没有匹配的条目。试试“盾牌”或“精神”。</p>';
  document.querySelectorAll("[data-spell]").forEach(
    (b) =>
      (b.onclick = () => {
        state.spell = b.dataset.spell;
        renderSpellList();
        $("spell-detail").innerHTML = spellDetail(
          spells.find((x) => x.id === state.spell),
        );
        bindSpellDetail();
      }),
  );
}
function spellDetail(c) {
  return `<div class="detail-heading"><span class="entry-icon">${icon(c.glyph)}</span><div><h2>${c.name}${c.tag === "攻击" ? ' <small style="display:inline;color:#ef919b">攻</small>' : ""}</h2><small>${c.school}</small></div><div class="tags"><span class="tag gold">${c.tag}</span><span class="tag">${c.type === "magic" ? "已习得" : "速查"}</span></div></div><div class="facts"><span><small>精神值消耗</small><b class="gold">${c.cost}${c.cost === "—" ? "" : " MP"}</b></span><span><small>目标</small><b>${c.target}</b></span><span><small>持续时间</small><b>${c.duration}</b></span></div><div class="detail-text">${c.body}</div><footer class="detail-footer"><small>${c.source}<br>${c.note}</small><button class="primary" id="declare-action">声明行动 ↗</button></footer>`;
}
function bindSpellDetail() {
  $("declare-action").onclick = () => {
    const c = spells.find((x) => x.id === state.spell);
    addMessage(
      "combat",
      "莉娜",
      `声明使用「${c.name}」${c.cost === "—" ? "" : ` · 标示消耗 ${c.cost} MP`}。等待手动掷骰与 GM 裁定。`,
      true,
    );
    state.channel = "combat";
    renderMessages();
    toast("行动已写入战斗日志；未自动扣除资源。");
  };
}
function currentEquipment() {
  return [...new Set([...state.hands, state.armor, state.accessory])]
    .filter(Boolean)
    .map((id) => items.find((x) => x.id === id));
}
function equippedAt(id) {
  const h = state.hands;
  if (h[0] === id && h[1] === id) return "双手";
  if (h[0] === id) return "主手";
  if (h[1] === id) return "副手";
  if (state.armor === id) return "防具";
  if (state.accessory === id) return "饰品";
  return "";
}
function renderGear() {
  const c = items.find((x) => x.id === state.item),
    linked = state.hands[0] && state.hands[0] === state.hands[1];
  const slots = [
    ["主手", state.hands[0], "sword"],
    ["副手", state.hands[1], "shield"],
    ["防具", state.armor, "armor"],
    ["饰品", state.accessory, "ring"],
  ];
  $("sheet-content").innerHTML =
    `<section class="gear-slots"><div class="section-label">当前装备 <small>4 栏位</small></div><div class="slots">${slots
      .map(([name, id, glyph], i) => {
        const it = items.find((x) => x.id === id);
        return `<button class="slot ${i < 2 && linked ? "linked" : ""}" ${id ? `data-slot-item="${id}"` : ""}><small>${name}${i < 2 && linked ? " · 关联占用" : ""}</small>${icon(it?.glyph || glyph)}<b>${it ? it.name : "空置"}</b></button>`;
      })
      .join(
        "",
      )}</div><div class="section-label" style="margin:13px 0 4px">切换穿戴样例</div><div class="gear-presets"><button data-preset="dual" class="${state.preset === "dual" ? "active" : ""}">双武器</button><button data-preset="shields" class="${state.preset === "shields" ? "active" : ""}">双盾</button><button data-preset="custom" class="${state.preset === "custom" ? "active" : ""}">双手</button></div><p class="gear-note">${linked ? "<b>一件武器 · 占用双手</b><br>两个栏位关联同一个物品实例。" : state.hands.every((id) => items.find((x) => x.id === id)?.kind === "shield") ? "<b>双重盾牌</b><br>守护者技能支持主手持盾。两面盾分别保留各自增益。" : "<b>主手与副手分别记录</b><br>装备资格与换装时机由本桌规则及 GM 裁定。"}</p></section><section class="catalog-pane gear-inventory"><div class="catalog-toolbar">背包与持有物 <small>${items.length} 件</small></div><div class="catalog-list">${items.map((it) => `<button class="entry-button ${it.id === c.id ? "selected" : ""}" data-item="${it.id}"><span class="entry-icon">${icon(it.glyph)}</span><span><b>${it.name}</b><small class="${equippedAt(it.id) ? "gold" : ""}">${equippedAt(it.id) ? "已装备 · " + equippedAt(it.id) : "背包"}${it.id === "starblade" ? " · 自定义" : ""}</small></span></button>`).join("")}</div></section><article class="detail-pane"><div class="detail-heading"><span class="entry-icon">${icon(c.glyph)}</span><div><h2>${c.name}</h2><small>${c.sub}</small></div><div class="tags"><span class="tag gold">${equippedAt(c.id) || "在背包"}</span></div></div><div class="facts"><span><small>${c.kind === "weapon" ? "命中" : ["armor", "shield"].includes(c.kind) ? "物理防御" : "类型"}</small><b>${c.hit}</b></span><span><small>${c.kind === "weapon" ? "伤害" : ["armor", "shield"].includes(c.kind) ? "魔法防御" : "效果"}</small><b>${c.damage}</b></span><span><small>价值</small><b class="gold">${c.cost}</b></span></div><div class="detail-text">${c.body}${state.custom[c.id] ? `<div class="rule-block"><b>GM 私设</b><p>${esc(state.custom[c.id])}</p></div>` : ""}<div class="equip-actions">${c.kind === "weapon" || c.kind === "shield" ? (c.hands === 2 ? '<button data-equip="both">装备 · 双手</button>' : '<button data-equip="0">装备到主手</button><button data-equip="1">装备到副手</button>') : c.kind === "armor" ? '<button data-equip="armor">穿戴防具</button>' : c.kind === "accessory" ? '<button data-equip="accessory">佩戴饰品</button>' : ""}${equippedAt(c.id) ? '<button data-equip="remove">卸回背包</button>' : ""}</div><div id="custom-editor" class="custom-rule-editor" hidden><label for="custom-text">GM 私设说明</label><textarea id="custom-text" placeholder="例如：本桌允许此盾装备到主手。">${esc(state.custom[c.id] || "")}</textarea><button id="custom-save">保留此页私设</button></div></div><footer class="detail-footer"><small>${c.source}<br>穿戴记录与物品详情分开保存；此处为演示。</small><button id="custom-toggle">编辑私设</button></footer></article>`;
  document.querySelectorAll("[data-item],[data-slot-item]").forEach(
    (b) =>
      (b.onclick = () => {
        state.item = b.dataset.item || b.dataset.slotItem;
        renderGear();
      }),
  );
  document.querySelectorAll("[data-preset]").forEach(
    (b) =>
      (b.onclick = () => {
        state.preset = b.dataset.preset;
        state.hands = {
          dual: ["sword-a", "sword-b"],
          shields: ["bronze", "rune"],
          custom: ["starblade", "starblade"],
        }[state.preset].slice();
        state.item = state.hands[0];
        renderGear();
      }),
  );
  document
    .querySelectorAll("[data-equip]")
    .forEach((b) => (b.onclick = () => equip(c, b.dataset.equip)));
  $("custom-toggle").onclick = () => {
    $("custom-editor").hidden = !$("custom-editor").hidden;
    if (!$("custom-editor").hidden) $("custom-text").focus();
  };
  $("custom-save").onclick = () => {
    state.custom[c.id] = $("custom-text").value.trim();
    renderGear();
    toast("私设已记入此页演示；不会写入正式世界。");
  };
}
function equip(item, slot) {
  const id = item.id;
  state.preset = "manual";
  if (slot === "remove") {
    state.hands = state.hands.map((x) => (x === id ? "" : x));
    if (state.armor === id) state.armor = "";
    if (state.accessory === id) state.accessory = "";
  } else if (slot === "armor") state.armor = id;
  else if (slot === "accessory") state.accessory = id;
  else if (slot === "both") state.hands = [id, id];
  else {
    if (state.hands[0] && state.hands[0] === state.hands[1])
      state.hands = ["", ""];
    state.hands = state.hands.map((x) => (x === id ? "" : x));
    state.hands[Number(slot)] = id;
  }
  renderGear();
  toast(
    slot === "remove"
      ? "已卸回背包"
      : item.kind === "shield" && slot === "0"
        ? "主手盾牌已登记；请核对双重盾牌技能或私设。"
        : "已更新此页的装备栏位",
  );
}
function addMessage(channel, name, text, mine = false, roll = false) {
  messages[channel].push({
    name,
    text,
    mine,
    roll,
    at: new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  });
  if (
    !mine &&
    (channel !== state.channel || $("table").classList.contains("chat-hidden"))
  )
    state.unread.add(channel);
  renderMessages();
}
function renderMessages() {
  if (!$("table").classList.contains("chat-hidden"))
    state.unread.delete(state.channel);
  $("channels").innerHTML = Object.entries(channelNames)
    .map(
      ([id, name]) =>
        `<button class="${id === state.channel ? "active" : ""}" data-channel="${id}">${name}${state.unread.has(id) ? '<i class="unread" aria-label="有新消息">!</i>' : ""}</button>`,
    )
    .join("");
  $("top-unread").hidden = state.unread.size === 0;
  $("chat-messages").innerHTML =
    messages[state.channel]
      .map(
        (m) =>
          `<article class="message ${m.mine ? "mine" : ""} ${m.roll ? "roll-result" : ""}"><header><b>${esc(m.name)}</b><time>${esc(m.at)}</time></header><p>${esc(m.text)}</p></article>`,
      )
      .join("") || '<p class="gear-note">此频道还没有记录。</p>';
  $("chat-identity").textContent =
    state.channel === "ooc" ? "阿云 · 场外发言" : "莉娜 · 场内发言";
  document.querySelectorAll("[data-channel]").forEach(
    (b) =>
      (b.onclick = () => {
        state.channel = b.dataset.channel;
        renderMessages();
      }),
  );
  $("chat-messages").scrollTop = $("chat-messages").scrollHeight;
}
function sendChat() {
  const text = $("chat-text").value.trim();
  if (!text) return;
  const channel = state.channel === "ooc" ? "ooc" : "ic";
  state.channel = channel;
  addMessage(channel, channel === "ooc" ? "阿云" : "莉娜", text, true);
  $("chat-text").value = "";
}
$("chat-form").onsubmit = (e) => {
  e.preventDefault();
  sendChat();
};
$("chat-text").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    if (!e.repeat) sendChat();
  }
};
$("demo-options").onclick = () => {
  showUtility(
    "演示选项",
    `<article><h3>多人阵型</h3><p>冲突顶部可以分别选择双方人数。较多敌人排成两排；窗口过窄时按页查看。</p><button id="demo-large-battle" class="primary">查看 12 对 16</button></article><article><h3>频道新消息</h3><p>选择接收频道，模拟另一名玩家发言，查看黄色感叹号气泡。</p><label>接收频道 <select id="demo-message-channel">${Object.entries(
      channelNames,
    )
      .map(([id, n]) => `<option value="${id}">${n}</option>`)
      .join(
        "",
      )}</select></label><button id="simulate-message" class="primary">模拟一条新消息</button></article>`,
    "demo",
  );
  $("demo-message-channel").value = state.channel === "ooc" ? "ic" : "ooc";
  $("simulate-message").onclick = () => {
    const target = $("demo-message-channel").value;
    addMessage(
      target,
      "小岚 · 演示来信",
      "这是一条刚收到的消息。对应频道会显示黄色感叹号。",
    );
    toast("已模拟一条新消息");
  };
  $("demo-large-battle").onclick = () => {
    state.partyCount = 12;
    state.enemyCount = 16;
    $("party-count").value = "12";
    $("enemy-count").value = "16";
    state.battlePages = { ally: 0, enemy: 0 };
    setMode("conflict");
    $("utility").hidden = true;
  };
};
$("chat-toggle").onclick = () => {
  const closed = $("table").classList.toggle("chat-hidden");
  $("chat-toggle").setAttribute("aria-label", closed ? "展开聊天" : "收起聊天");
  renderMessages();
};
$("dice-toggle").onclick = () => {
  $("dice-drawer").hidden = !$("dice-drawer").hidden;
  $("dice-toggle").setAttribute(
    "aria-expanded",
    String(!$("dice-drawer").hidden),
  );
};
$("dice-close").onclick = () => {
  $("dice-drawer").hidden = true;
  $("dice-toggle").setAttribute("aria-expanded", "false");
  $("dice-toggle").focus();
};
document.querySelectorAll("[data-dice-count]").forEach(
  (b) =>
    (b.onclick = () => {
      state.dice = Number(b.dataset.diceCount);
      document
        .querySelectorAll("[data-dice-count]")
        .forEach((x) => x.classList.toggle("active", x === b));
      $("die-two-label").hidden = state.dice === 1;
    }),
);
$("roll").onclick = () => {
  const sides = [Number($("die-one").value), Number($("die-two").value)].slice(
      0,
      state.dice,
    ),
    mod = Number($("roll-mod").value);
  if (!Number.isInteger(mod) || Math.abs(mod) > 99) {
    toast("修正值请填写 −99 到 99 的整数。");
    return;
  }
  const values = sides.map((n) => Math.floor(Math.random() * n) + 1),
    total = values.reduce((a, b) => a + b, mod),
    text =
      sides.map((n, i) => `d${n} → ${values[i]}`).join(" ＋ ") +
      (mod ? ` ${mod > 0 ? "+" : ""}${mod}` : "") +
      ` ＝ ${total}`;
  $("roll-output").textContent = text;
  state.channel = "dice";
  addMessage("dice", "莉娜 · 演示掷骰", text, true, true);
};
function showUtility(title, html, kind) {
  $("utility-title").textContent = title;
  $("utility-body").innerHTML = html;
  $("utility").dataset.kind = kind;
  $("utility").hidden = false;
}
$("utility-close").onclick = () => {
  $("utility").hidden = true;
};
function showJournal() {
  showUtility(
    "冒险手记",
    `<div class="tag gold">星落钟塔 · 2 条线索</div><article><h3>未寄出的信</h3><p>封蜡上的纹章，与钟塔门口的图案相同。没有收件人，只有“留给听见钟声的人”。</p></article><article><h3>缺失的最后一拍</h3><p>熟悉的钟声缺少最后一拍。也许不是损坏，而是刻意留下的空白。</p></article>${state.notes.map((n, i) => `<article><h3>随手记 ${i + 1}</h3><p>${esc(n)}</p></article>`).join("")}<label><textarea id="new-note" placeholder="写下一条线索……" aria-label="新线索"></textarea></label><button class="primary" id="save-note">记入本页手记</button>`,
    "journal",
  );
  $("save-note").onclick = () => {
    const n = $("new-note").value.trim();
    if (n) {
      state.notes.push(n);
      showJournal();
      toast("已记入本页演示手记");
    }
  };
}
$("journal-toggle").onclick = showJournal;
document.querySelectorAll("[data-person]").forEach(
  (b) =>
    (b.onclick = () => {
      if (b.dataset.person === "lina") openSheet("overview");
      else {
        const p = people[b.dataset.person];
        showUtility(
          p.name,
          `<article><h3>${p.role} · 队伍角色</h3><p>HP <b>${p.hp}</b>　MP <b>${p.mp}</b></p><p class="gold">泽尼特 ${p.z} Z</p></article><article><h3>舞台演出</h3><p>切换到演出场景后，点击此角色即可让他发言。</p></article><button id="show-person" class="primary">切换为${p.short}发言</button>`,
          "actor",
        );
        $("show-person").onclick = () => {
          state.speaker = b.dataset.person;
          setMode("story");
          renderCast();
          $("utility").hidden = true;
        };
      }
    }),
);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (state.clockOpen) {
    toggleSceneClocks(state.clockOpen, false);
    return;
  }
  if (!$("utility").hidden) $("utility").hidden = true;
  else if (!$("dice-drawer").hidden) {
    $("dice-drawer").hidden = true;
    $("dice-toggle").setAttribute("aria-expanded", "false");
    $("dice-toggle").focus();
  } else if (!$("sheet").hidden) closeSheet();
});
if (innerWidth <= 650) {
  $("table").classList.add("chat-hidden");
  $("chat-toggle").setAttribute("aria-label", "展开聊天");
}
bindClocks();
bindBattle();
renderClocks();
renderCast();
renderCombat();
renderMap();
renderMessages();
if (location.hash === "#battle") {
  setMode("conflict");
} else if (location.hash === "#gear") {
  setMode("conflict");
  openSheet("gear");
} else if (location.hash === "#spells") {
  setMode("conflict");
  openSheet("spells");
}
