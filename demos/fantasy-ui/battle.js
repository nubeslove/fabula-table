/* Responsive two-dimensional formation. Each portrait stays inside its own cell. */
let battleResizeObserver;
function battleRoster(side) {
  const count = side === "ally" ? state.partyCount : state.enemyCount;
  const names =
    side === "ally"
      ? [
          "莉娜",
          "雷恩",
          "伊芙",
          "诺亚",
          "索拉",
          "露米",
          "亚修",
          "弥娅",
          "艾琳",
          "罗伊",
          "塔拉",
          "星河",
        ]
      : [
          "雾狼",
          "晶壳守卫",
          "黑帆斥候",
          "银翼使徒",
          "迷雾侍卫",
          "遗迹守卫",
          "星灯使徒",
          "影狼",
          "灰羽守卫",
          "湖畔幽灵",
          "雾中歌者",
          "水晶巨像",
          "苍银飞鸟",
          "黑帆术士",
          "镜面守卫",
          "古塔哨兵",
        ];
  const base = Object.values(people);
  return Array.from({ length: count }, (_, i) => ({
    id: `${side}-${i}`,
    name: names[i],
    hp: side === "ally" ? base[i]?.hp || 50 : 40 + (i % 4) * 5,
    mp: side === "ally" ? base[i]?.mp || 35 : 20 + (i % 3) * 5,
    z: side === "ally" ? base[i]?.z || 300 + i * 70 : undefined,
    portrait: side === "ally" && i % 3 === 0,
    glyph: names[i][0],
    side,
    index: i,
  }));
}
function formationSpec(side, width, height, count) {
  const zoneWidth = width * (count <= 4 ? 0.52 : 0.88);
  const columns = Math.max(1, Math.floor(zoneWidth / 88));
  const rows = count > columns || (side === "enemy" && count > 4) ? 2 : 1;
  const capacity = columns * rows;
  const pageCount = Math.max(1, Math.ceil(count / capacity));
  const page = Math.min(state.battlePages[side] || 0, pageCount - 1);
  state.battlePages[side] = page;
  const shown = Math.min(capacity, count - page * capacity);
  const usedRows = Math.min(rows, shown);
  const usedCols = Math.ceil(shown / usedRows);
  const gap = usedRows === 2 ? 8 : 12;
  const slotWidth = (zoneWidth - gap * (usedCols - 1)) / usedCols;
  const slotHeight = (height / 2 - 25 - gap * (usedRows - 1)) / usedRows;
  return {
    zoneWidth,
    rows: usedRows,
    cols: usedCols,
    capacity,
    pageCount,
    page,
    shown,
    portrait: Math.max(24, Math.min(140, slotWidth - 18, slotHeight - 44)),
    gap,
  };
}
function renderTeam(side, width, height) {
  const roster = battleRoster(side),
    spec = formationSpec(side, width, height, roster.length);
  const id = side === "ally" ? "allies" : "enemies",
    zone = $(side + "-zone");
  zone.style.width = spec.zoneWidth + "px";
  zone.style.setProperty("--columns", spec.cols);
  zone.style.setProperty("--rows", spec.rows);
  zone.style.setProperty("--portrait-size", spec.portrait + "px");
  zone.style.setProperty("--formation-gap", spec.gap + "px");
  $(side + "-count-label").textContent = roster.length + " 人";
  $(side + "-pager").innerHTML =
    spec.pageCount > 1
      ? `<button data-team-page="${side}" data-step="-1" aria-label="${side === "ally" ? "我方" : "对方"}上一页" ${spec.page === 0 ? "disabled" : ""}>‹</button><span>${spec.page + 1}/${spec.pageCount}</span><button data-team-page="${side}" data-step="1" aria-label="${side === "ally" ? "我方" : "对方"}下一页" ${spec.page + 1 === spec.pageCount ? "disabled" : ""}>›</button>`
      : "";
  $(id).innerHTML = roster
    .slice(spec.page * spec.capacity, (spec.page + 1) * spec.capacity)
    .map(
      (p) =>
        `<button class="combatant ${p.id === "ally-0" ? "active" : ""} ${state.acted.has(p.id) ? "acted" : ""}" data-combatant="${p.id}" title="${p.name} · HP ${p.hp} · MP ${p.mp}${p.z === undefined ? "" : " · 泽尼特 " + p.z}" aria-label="${p.name}的行动"><span class="fighter-art ${p.portrait ? "portrait" : "token"}">${p.portrait ? '<img src="assets/silver-wayfarer.webp" alt="角色立绘样例">' : `<span>${p.glyph}</span>`}<i class="turn-mark">${state.acted.has(p.id) ? "✓" : p.id === "ally-0" ? "行动中" : ""}</i></span><b class="combatant-name">${p.name}</b><span class="combatant-data"><span>HP <b>${p.hp}</b></span><span>MP <b>${p.mp}</b></span></span><i class="health-line"></i></button>`,
    )
    .join("");
}
function renderCombat() {
  if (state.mode !== "conflict") return;
  const field = $("battlefield");
  if (!field.clientWidth || !field.clientHeight) return;
  renderTeam("enemy", field.clientWidth, field.clientHeight);
  renderTeam("ally", field.clientWidth, field.clientHeight);
  requestAnimationFrame(layoutCombat);
}
function rectanglesOverlap(a, b, padding = 6) {
  return (
    a.left < b.right + padding &&
    a.right > b.left - padding &&
    a.top < b.bottom + padding &&
    a.bottom > b.top - padding
  );
}
function layoutCombat() {
  if (state.mode !== "conflict") return;
  const stageRect = $("stage").getBoundingClientRect();
  const actorRects = [...document.querySelectorAll(".combatant")].map((e) =>
    e.getBoundingClientRect(),
  );
  const sheetRect = $("sheet").hidden
    ? null
    : $("sheet").getBoundingClientRect();
  for (const area of ["upper", "lower"]) {
    const pod = $(area + "-pod");
    pod.hidden = false;
    const box = pod.getBoundingClientRect();
    const covered =
      actorRects.some((a) => rectanglesOverlap(box, a, 12)) ||
      (sheetRect && rectanglesOverlap(box, sheetRect)) ||
      box.bottom > stageRect.bottom - 6 ||
      box.top < stageRect.top + 62 ||
      stageRect.width < 650;
    pod.hidden = Boolean(covered) || state.clockOpen === area;
    $(area + "-clock-toggle").classList.toggle("docked", Boolean(covered));
    $(area + "-clock-toggle").title = covered
      ? "命刻已收纳，点击展开"
      : "点击展开命刻";
  }
}
function showBattleActor(id) {
  if (id === "ally-0") {
    openActions();
    requestAnimationFrame(layoutCombat);
    return;
  }
  const p = [...battleRoster("ally"), ...battleRoster("enemy")].find(
    (x) => x.id === id,
  );
  if (!p) return;
  showUtility(
    p.name,
    `<article><h3>${p.side === "ally" ? "我方人物" : "对方人物"}</h3><p>HP <b>${p.hp}</b> · MP <b>${p.mp}</b></p>${p.z === undefined ? "" : `<p class="gold">泽尼特 ${p.z} Z</p>`}</article><article><h3>行动记录</h3><p>此人物用于验证多人阵型；完整角色卡使用莉娜样例。</p></article><button class="primary" id="record-other">记录 ${p.name} 已行动</button>`,
    "actor",
  );
  $("record-other").onclick = () => {
    state.acted.add(id);
    addMessage("combat", p.name, "完成了本轮行动（演示记录）。");
    $("utility").hidden = true;
    renderCombat();
  };
}
function bindBattle() {
  ["party", "enemy"].forEach(
    (side) =>
      ($(side + "-count").onchange = (e) => {
        state[side === "party" ? "partyCount" : "enemyCount"] = Number(
          e.target.value,
        );
        state.battlePages = { ally: 0, enemy: 0 };
        renderCombat();
      }),
  );
  $("battlefield").onclick = (e) => {
    const actor = e.target.closest("[data-combatant]");
    if (actor) {
      showBattleActor(actor.dataset.combatant);
      return;
    }
    const page = e.target.closest("[data-team-page]");
    if (page) {
      state.battlePages[page.dataset.teamPage] += Number(page.dataset.step);
      renderCombat();
    }
  };
  $("round-next").onclick = () => {
    state.round++;
    state.acted.clear();
    $("round-label").textContent = `第 ${state.round} 轮`;
    renderCombat();
    addMessage("combat", "GM", `开始第 ${state.round} 轮。`);
    toast(`第 ${state.round} 轮开始`);
  };
  battleResizeObserver = new ResizeObserver(() => {
    renderCombat();
    layoutCombat();
  });
  battleResizeObserver.observe($("battlefield"));
  new MutationObserver(() => requestAnimationFrame(layoutCombat)).observe(
    $("sheet"),
    { attributes: true, attributeFilter: ["hidden", "data-context"] },
  );
}
