(() => {
  const q = (id) => document.getElementById(id);
  const sound = new FuSound.InterfaceAudio({
    audio: (file) => new Audio(new URL(`audio/${file}`, document.baseURI).href),
    now: () => performance.now(),
    later: (fn, ms) => setTimeout(fn, ms),
    cancel: (timer) => clearTimeout(timer),
  });
  sound.setScene("lobby");
  const captions = {
    manuscript: "叶蔓 · 金线 · 温润纸纹",
    astrolabe: "星盘 · 刻度 · 磨砂珐琅",
    court: "卷草 · 饰冠 · 织锦底纹",
  };
  const decorate = () => {
    document
      .querySelectorAll(".ornamental, .dialogue, .sheet, .chat, .utility")
      .forEach((el) => {
        if (el.querySelector(":scope > .fantasy-edges")) return;
        const edge = document.createElement("div");
        edge.className = "fantasy-edges";
        edge.setAttribute("aria-hidden", "true");
        el.append(edge);
      });
  };
  decorate();
  document.querySelectorAll(".clock-tab").forEach((button) => {
    const label = button.classList.contains("left")
      ? "展开或收起上半场命刻"
      : "展开或收起下半场命刻";
    button.setAttribute("aria-label", label);
    button.title = label;
  });
  new MutationObserver(decorate).observe(q("table"), {
    childList: true,
    subtree: true,
  });
  document.querySelectorAll("[data-theme-choice]").forEach((button) =>
    button.addEventListener("click", () => {
      document.body.dataset.theme = button.dataset.themeChoice;
      document
        .querySelectorAll("[data-theme-choice]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      q("theme-caption").textContent = captions[button.dataset.themeChoice];
    }),
  );
  const preview = (mode) => {
    document.body.dataset.preview = mode;
    q("preview-lobby").setAttribute("aria-pressed", String(mode === "lobby"));
    q("preview-world").setAttribute("aria-pressed", String(mode === "world"));
    q("utility").hidden = true;
    sound.setScene(mode === "world" ? "world" : "lobby");
  };
  q("preview-lobby").onclick = () => preview("lobby");
  q("preview-world").onclick = () => preview("world");
  q("preview-sheet").onclick = () => {
    preview("world");
    openSheet("gear");
  };
  q("hero-enter").onclick = () => preview("world");
  document
    .querySelectorAll(".enter-demo")
    .forEach((b) => (b.onclick = () => preview("world")));
  q("all-rooms").onclick = () => {
    document
      .querySelectorAll(".lobby-tabs button")
      .forEach((b) => b.classList.toggle("active", b === q("all-rooms")));
  };
  document.querySelector(".lobby-tabs button").onclick = (e) => {
    document
      .querySelectorAll(".lobby-tabs button")
      .forEach((b) => b.classList.toggle("active", b === e.currentTarget));
  };
  const showSound = (open) => {
    q("demo-sound").hidden = !open;
    q("preview-sound").setAttribute("aria-expanded", String(open));
  };
  q("preview-sound").onclick = () => showSound(q("demo-sound").hidden);
  q("close-sound").onclick = () => showSound(false);
  q("lobby-listen").onclick = () => {
    showSound(true);
    sound.configure({ music: true });
    q("music-enabled").checked = true;
    sound.unlock();
  };
  q("play-music").onclick = () => {
    sound.configure({ music: true });
    q("music-enabled").checked = true;
    sound.unlock();
  };
  q("test-sound").onclick = () => sound.cue("press");
  q("music-enabled").onchange = (e) =>
    sound.configure({ music: e.target.checked });
  q("effects-enabled").onchange = (e) =>
    sound.configure({ effects: e.target.checked });
  q("music-volume").oninput = (e) => {
    sound.configure({ musicVolume: +e.target.value });
    q("music-volume-label").textContent = e.target.value + "%";
  };
  q("effects-volume").oninput = (e) => {
    sound.configure({ effectsVolume: +e.target.value });
    q("effects-volume-label").textContent = e.target.value + "%";
  };
  sound.subscribe(() => {
    q("music-status").textContent =
      sound.scene === "world"
        ? "已进入世界 · 大厅音乐停止，交互轻声。"
        : sound.status === "playing"
          ? "正在播放 · 钢琴、竖琴与大提琴"
          : !sound.preferences.music
            ? "大厅音乐已关闭。"
            : sound.status === "unavailable"
              ? "尚未播放，请点击播放按钮重试。"
              : "点击播放，听见故事的开端。";
  });
  const unlock = (e) => {
    if (e.isTrusted) sound.unlock();
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
  document.addEventListener("click", (e) => {
    if (e.isTrusted && e.target.closest("button:not(:disabled),a[href]"))
      sound.cue("press");
  });
  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest("button:not(:disabled),a[href]");
    if (
      e.isTrusted &&
      e.pointerType !== "touch" &&
      el &&
      !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))
    )
      sound.cue("hover");
  });
  document.addEventListener("visibilitychange", () =>
    sound.setVisible(document.visibilityState === "visible"),
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") showSound(false);
  });
  document.addEventListener("pointerdown", (e) => {
    if (
      !q("demo-sound").contains(e.target) &&
      !q("preview-sound").contains(e.target) &&
      !q("lobby-listen").contains(e.target)
    )
      showSound(false);
  });
  // Public demo state is ephemeral. No account, server API, or production world data.
})();
