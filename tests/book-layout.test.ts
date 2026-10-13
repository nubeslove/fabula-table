import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { reflowText, searchablePage } from "../src/lib/book-layout";
import type { BookPage, BookSection } from "../src/lib/book-layout";

test("文本换行不会割断中文关键词，数值行保留", () => {
  const page = {
    number: 1,
    printed: null,
    text: "命刻\n危险不断逼\n近。\n30\n10 | 20 | 30",
  };
  const blocks = reflowText(page, [{ title: "命刻", page: 1, depth: 0 }]);
  assert.deepEqual(blocks, [
    { kind: "h", text: "命刻", level: 2 },
    { kind: "p", text: "危险不断逼近。" },
    { kind: "p", text: "30" },
    { kind: "p", text: "10 | 20 | 30" },
  ]);
  assert.ok(searchablePage(page).includes("逼近"));
});

test("全部扩展目录能定位正文，表格与资源来源完整，分发文件通过散列校验", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../public/official/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  const books = new Map<
    string,
    { pages: BookPage[]; sections: BookSection[]; note?: string }
  >();
  for (const doc of manifest.documents.filter(
    (d: { id: string }) => d.id !== "core",
  )) {
    const bytes = await readFile(
      new URL("../public/" + doc.file, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      doc.hash,
      doc.title,
    );
    const book = JSON.parse(bytes.toString("utf8"));
    books.set(doc.id, book);
    assert.ok(book.sections.length > 1, doc.title);
    for (const s of book.sections) {
      assert.ok(
        s.page >= 1 && s.page <= book.pages.length,
        `${doc.title}: ${s.title}`,
      );
      if (s.block !== undefined)
        assert.ok(
          s.block >= 0 && s.block < book.pages[s.page - 1].blocks.length,
          s.title,
        );
    }
  }
  const pilot = books.get("chm-212449b32927")!;
  const vehicle = pilot.sections.find((s) => s.title.includes("个人载具"))!;
  assert.equal(vehicle.depth, 1);
  assert.match(searchablePage(pilot.pages[vehicle.page - 1]), /个人载具/);
  const card = books.get("pdf-05b3d5db4f48")!;
  const combo = card.pages[4].blocks!.find((b) => b.kind === "table");
  assert.ok(combo?.kind === "table");
  assert.deepEqual(combo.rows[0], ["组合", "组合条件", "效果"]);
  assert.match(combo.rows[1][2], /777.*HP.*777.*MP/);
  assert.ok(
    card.sections.some((s) => s.title === "组合效果表" && s.page === 5),
  );
  assert.ok(
    !card.sections.some((s) => /♥|Pixel Art|published by/.test(s.title)),
  );
  assert.match(books.get("pdf-c9f4fbcf0ad8")!.note!, /不作 PDF 逐页对照/);
  const resourceBytes = await readFile(
    new URL("../public/" + manifest.characterResources.file, import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(resourceBytes).digest("hex"),
    manifest.characterResources.hash,
  );
  const resources = JSON.parse(resourceBytes.toString("utf8")) as {
    id: string;
    name: string;
    book: string;
    text: string;
  }[];
  assert.equal(new Set(resources.map((r) => r.id)).size, resources.length);
  const bulletTime = resources.find((r) => r.name.startsWith("子弹时间"))!;
  assert.match(bulletTime.text, /要求：.*精通游荡者或熵师/);
  assert.match(bulletTime.text, /你的先攻/);
  assert.ok(
    !resources.some((r) => /^(要求|效果|前提|目标)([：:]|$)/.test(r.name)),
  );
  for (const resource of resources)
    assert.ok(books.has(resource.book) && resource.text.trim(), resource.id);
});
test("核心规则结构保留标题顺序、命刻条目与装备表格数值", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../public/official/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  const file = manifest.documents.find(
    (d: { id: string }) => d.id === "core",
  ).file;
  const book: { pages: BookPage[] } = JSON.parse(
    await readFile(new URL("../public/" + file, import.meta.url), "utf8"),
  );
  const chapter = book.pages[30].blocks!;
  assert.deepEqual(
    chapter.slice(0, 3).map((b) => b.kind),
    ["h", "p", "h"],
  );
  assert.ok(searchablePage(book.pages[30]).startsWith("游戏规则本章"));
  assert.equal(book.pages[53].blocks!.filter((b) => b.kind === "li").length, 3);
  const armor = book.pages[133].blocks!.find((b) => b.kind === "table");
  assert.ok(armor?.kind === "table");
  assert.deepEqual(armor.rows[0], ["防具", "花费", "物防", "魔防", "先攻"]);
  assert.deepEqual(armor.rows[3], [
    "丝质衬衫",
    "100 z",
    "DEX size",
    "INS size +2",
    "-1",
  ]);
  assert.ok(armor.rows.some((r) => r[0] === "锁子甲 ◆" && r[2] === "10"));
  assert.ok(searchablePage(book.pages[155]).includes("1. 创建角色的身份"));
});
