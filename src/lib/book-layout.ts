export type BookBlock =
  | { kind: "p" | "h" | "li"; text: string; level?: number }
  | { kind: "table"; rows: string[][] };
export interface BookPage {
  number: number;
  printed: number | null;
  text: string;
  blocks?: BookBlock[];
}
export interface BookSection {
  block?: number;
  title: string;
  page: number;
  depth: number;
}

/** Conservative fallback for imports without geometry: keep numeric data and lists. */
export function reflowText(
  page: BookPage,
  sections: BookSection[],
): BookBlock[] {
  const headings = new Set(
    sections.filter((s) => s.page === page.number).map((s) => s.title.trim()),
  );
  const lines = page.text.split(/\r?\n/).map((s) => s.trim());
  const blocks: BookBlock[] = [];
  let paragraph = "";
  const flush = () => {
    if (paragraph) blocks.push({ kind: "p", text: paragraph });
    paragraph = "";
  };
  for (const line of lines) {
    if (/^(?:\d*GAME RULES|\d*PRESS START|(?:CHAPTER\s*)+)$/.test(line))
      continue;
    if (!line) {
      flush();
      continue;
    }
    if (headings.has(line)) {
      flush();
      blocks.push({ kind: "h", text: line, level: 2 });
      continue;
    }
    if (/^[•\uf077]/.test(line)) {
      flush();
      blocks.push({ kind: "li", text: line.replace(/^[•\uf077]\s*/, "") });
      continue;
    }
    if (/^[\d\s+−×÷=|.,%/\-]+$/.test(line) || line.includes(" | ")) {
      flush();
      blocks.push({ kind: "p", text: line });
      continue;
    }
    paragraph +=
      (/[a-z0-9]$/i.test(paragraph) && /^[a-z0-9]/i.test(line) ? " " : "") +
      line;
    if (/[。！？!?]$/.test(line)) flush();
  }
  flush();
  return blocks;
}

export function searchablePage(page: BookPage) {
  return (
    page.blocks
      ?.map((b) =>
        b.kind === "table" ? b.rows.map((r) => r.join(" ")).join("\n") : b.text,
      )
      .join("\n") ?? page.text
  ).replace(/\n/g, "");
}
