/* Decorative manual clocks, shared by the strip, directory and scene drawers. */
function clockPoint(radius, angle) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [70 + radius * Math.cos(rad), 70 + radius * Math.sin(rad)];
}
function clockSegment(start, end) {
  const a = clockPoint(54, start),
    b = clockPoint(54, end);
  const c = clockPoint(42, end),
    d = clockPoint(42, start);
  return `M${a} A54,54 0 0 1 ${b} L${c} A42,42 0 0 0 ${d} Z`;
}
function clockMarkup(c, place = "directory") {
  const id = `dial-${place}-${c.id}`;
  const ticks = Array.from({ length: c.max * 4 }, (_, i) => {
    const a = clockPoint(i % 4 === 0 ? 57 : 59, (360 * i) / (c.max * 4));
    const b = clockPoint(62, (360 * i) / (c.max * 4));
    return `<path d="M${a}L${b}" stroke="#d8c28e" stroke-width="${i % 4 === 0 ? 1.2 : 0.55}" opacity="${i % 4 === 0 ? 0.9 : 0.45}"/>`;
  }).join("");
  const petals = [0, 45, 90, 135, 180, 225, 270, 315]
    .map(
      (a) =>
        `<path d="M70 40Q86 52 70 70Q54 52 70 40Z" transform="rotate(${a} 70 70)"/>`,
    )
    .join("");
  return `<article class="clock" data-clock="${c.id}" data-clock-place="${place}"><div class="clock-meter"><svg viewBox="0 0 140 140" role="img" aria-label="${esc(c.name)} ${c.value}/${c.max}">
    <defs><linearGradient id="${id}"><stop stop-color="#e9d7a3"/><stop offset="1" stop-color="#b79a57"/></linearGradient><radialGradient id="${id}-core"><stop stop-color="#3c6157"/><stop offset="1" stop-color="#173e35"/></radialGradient></defs>
    <circle cx="70" cy="70" r="64" fill="#21483e" stroke="#aa915c" stroke-width="1"/><circle cx="70" cy="70" r="60" fill="none" stroke="#d7bd7f" stroke-width=".6"/>
    ${ticks}${Array.from({ length: c.max }, (_, i) => `<path d="${clockSegment((360 * i) / c.max + 2.3, (360 * (i + 1)) / c.max - 2.3)}" fill="${i < c.value ? `url(#${id})` : "#45685a"}" stroke="${i < c.value ? "#ebd7a2" : "#78917b"}" stroke-width=".7"/>`).join("")}
    <circle cx="70" cy="70" r="36" fill="url(#${id}-core)" stroke="#c4b67e" stroke-width=".6"/><g fill="none" stroke="#c9bd87" stroke-width=".5" opacity=".16">${petals}<circle cx="70" cy="70" r="31"/><path d="M42 70h56M70 42v56"/></g>
    <path d="M70 30L73 35L70 38L67 35Z M70 102L73 105L70 110L67 105Z" fill="#cfb77b"/><text class="dial-glyph" x="70" y="54">✦</text><text class="dial-number" x="70" y="83">${c.value}</text><text class="dial-total" x="70" y="97">/ ${c.max}</text>
    ${[0, 90, 180, 270].map((a) => `<path d="M70 1L74 7L70 13L66 7Z" transform="rotate(${a} 70 70)" fill="#e3cf97" stroke="#8e773e" stroke-width=".6"/>`).join("")}
    </svg><div class="clock-controls"><button data-clock-id="${c.id}" data-delta="-1" aria-label="撤回${esc(c.name)}">−</button><button data-clock-id="${c.id}" data-delta="1" aria-label="推进${esc(c.name)}">+</button></div></div><div class="clock-info"><small class="clock-kind">${c.area ? "冲突命刻 · " + (c.area === "upper" ? "上半场" : "下半场") : c.extra ? "世界命刻" : "优先显示"}</small><b>${esc(c.name)}</b><small class="clock-meaning">${esc(c.meaning)}</small><span class="clock-progress">${c.value} / ${c.max} 格${c.value === c.max ? " · 已填满" : ""}</span></div></article>`;
}
function renderClocks() {
  $("global-clocks").innerHTML = clocks
    .filter((c) => !c.area && !c.extra)
    .map((c) => clockMarkup(c, "strip"))
    .join("");
  for (const area of ["upper", "lower"]) {
    const entries = clocks.filter((c) => c.area === area);
    $(area + "-clocks").innerHTML = entries
      .map((c) => clockMarkup(c, area + "-float"))
      .join("");
    $(area + "-clock-list").innerHTML = entries
      .map((c) => clockMarkup(c, area + "-drawer"))
      .join("");
    $(area + "-clock-toggle").querySelector("b").textContent = entries.length;
  }
  if (!$("utility").hidden && $("utility").dataset.kind === "clocks")
    renderClockRows();
  requestAnimationFrame(layoutCombat);
}
function renderClockRows() {
  const list = $("clock-directory-list");
  if (!list) return;
  const query = (state.clockSearch || "").trim().toLowerCase();
  const entries = clocks.filter(
    (c) =>
      (state.clockFilter !== "conflict" || c.area) &&
      (state.clockFilter !== "world" || !c.area) &&
      (!query || (c.name + " " + c.meaning).toLowerCase().includes(query)),
  );
  list.innerHTML = entries.length
    ? entries.map((c) => clockMarkup(c, "directory")).join("")
    : '<p class="empty-note">没有匹配的命刻。</p>';
  $("clock-result-count").textContent = `${entries.length} 个命刻 · 手动推进`;
  document
    .querySelectorAll("[data-clock-filter]")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.clockFilter === state.clockFilter),
    );
}
function showClockDirectory() {
  state.clockFilter = state.clockFilter || "all";
  showUtility(
    "命刻目录",
    `<div class="clock-directory-tools"><input id="clock-search" type="search" aria-label="搜索命刻" placeholder="搜索名称或含义…" value="${esc(state.clockSearch || "")}"><div class="clock-filters"><button data-clock-filter="all">全部</button><button data-clock-filter="world">世界命刻</button><button data-clock-filter="conflict">冲突命刻</button></div><small id="clock-result-count"></small></div><div id="clock-directory-list" class="clock-directory-list"></div>`,
    "clocks",
  );
  $("clock-search").oninput = (e) => {
    state.clockSearch = e.target.value;
    renderClockRows();
  };
  document.querySelectorAll("[data-clock-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        state.clockFilter = b.dataset.clockFilter;
        renderClockRows();
      }),
  );
  renderClockRows();
}
function toggleSceneClocks(area, force) {
  state.clockOpen = force === false || state.clockOpen === area ? "" : area;
  for (const side of ["upper", "lower"]) {
    const open = state.clockOpen === side;
    $(side + "-clock-drawer").classList.toggle("open", open);
    $(side + "-clock-drawer").inert = !open;
    $(side + "-clock-toggle").setAttribute("aria-expanded", String(open));
  }
  requestAnimationFrame(layoutCombat);
}
function bindClocks() {
  $("clock-more").onclick = showClockDirectory;
  for (const area of ["upper", "lower"])
    $(area + "-clock-toggle").onclick = () => toggleSceneClocks(area);
  document
    .querySelectorAll("[data-close-clocks]")
    .forEach(
      (b) =>
        (b.onclick = () => toggleSceneClocks(b.dataset.closeClocks, false)),
    );
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-clock-id]");
    if (!b) return;
    const place = b.closest("[data-clock-place]").dataset.clockPlace;
    const c = clocks.find((x) => x.id === b.dataset.clockId);
    c.value = Math.min(c.max, Math.max(0, c.value + Number(b.dataset.delta)));
    renderClocks();
    document
      .querySelector(
        `[data-clock-place="${place}"] [data-clock-id="${c.id}"][data-delta="${b.dataset.delta}"]`,
      )
      ?.focus();
  });
}
