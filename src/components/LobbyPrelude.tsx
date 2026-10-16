/** The lobby's decorative cover stays separate from the real room directory. */
export function LobbyPrelude() {
  return (
    <aside className="lobby-prelude" aria-label="旅途序章">
      <div className="court-crest" aria-hidden="true">
        ♜
      </div>
      <div className="prelude-copy">
        <span className="eyebrow">FABULA ULTIMA</span>
        <h2>
          每一次相遇，
          <br />
          都是故事的开端。
        </h2>
        <span className="court-flourish" aria-hidden="true">
          ✦
        </span>
        <p>
          收拾行囊，翻开新的一页。
          <br />
          你的伙伴与未完的冒险，正在这里等你。
        </p>
      </div>
      <footer>
        <span>✦ 最终物语</span>
        <span>写下属于你们的故事</span>
      </footer>
    </aside>
  );
}
