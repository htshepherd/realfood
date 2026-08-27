import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { compileKnowledgeRelease } from "../scripts/knowledge-compiler.mjs";

const projectRoot = path.resolve(import.meta.dirname, "../..");

test("真实知识包生成完整、带版本的消费契约", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "ihealth-release-"));
  const release = await compileKnowledgeRelease({
    knowledgeRoot: path.join(projectRoot, "knowledge"),
    rawRoot: path.join(projectRoot, "raw"),
    outputRoot,
    copyAssets: false,
    generatedAt: "2026-08-27T00:00:00.000Z",
  });

  assert.deepEqual(release.manifest.counts, {
    total: 196,
    primary: 190,
    foods: 153,
    nutrients: 26,
    supplements: 11,
    nutrientGroups: 1,
    guides: 2,
    references: 3,
  });
  assert.match(release.manifest.version, /^20260827-[a-f0-9]{12}$/);
  assert.equal(release.manifest.checksum.length, 64);

  const vitaminC = release.objects.find((item) => item.id === "nutrients/vitamin-c");
  assert.ok(vitaminC);
  assert.deepEqual(Object.keys(vitaminC.slots), [
    "overview",
    "effects",
    "deficiency",
    "foodSources",
    "dosage",
    "safety",
  ]);
  assert.deepEqual(vitaminC.slots.effects.groups.map((group) => group.title), [
    "抗氧化与细胞保护",
    "胶原与组织修复",
    "免疫、感染与过敏",
    "铁吸收与营养协同",
    "心血管与代谢支持",
    "神经、恢复与特定用途",
  ]);
  assert.match(vitaminC.slots.overview.markdown, /冲洗黑白胶片/);
  assert.match(vitaminC.slots.foodSources.markdown, /保存与吸收/);
  assert.match(vitaminC.image, /vitamin-c\.webp$/);
  assert.equal(vitaminC.slots.foodSources.groups.flatMap((group) => group.links).length, 12);
  assert.doesNotMatch(vitaminC.slots.dosage.markdown, /待确认|医学审核|内部审核/);
  assert.deepEqual(vitaminC.navigation.map((entry) => entry.title), [
    "哪些食物富含维生素 C？",
    "维生素 C 有什么作用？",
    "维生素 C 缺乏与不足",
    "补充方式与用量",
    "服用补充剂注意事项",
  ]);
  assert.deepEqual(vitaminC.slots.deficiency.groups.map((group) => group.title), ["饮食与生活方式", "药物影响", "疾病与恢复阶段"]);
  assert.deepEqual(vitaminC.slots.safety.groups.map((group) => group.title), ["与药物同服", "与其他营养素同服"]);
  assert.equal(vitaminC.navigation.find((entry) => entry.id === "safety").description, "11 类药物 · 2 种营养素");

  const vitaminD = release.objects.find((item) => item.id === "nutrients/vitamin-d");
  assert.ok(vitaminD);
  const vitaminDAcquisition = vitaminD.navigation.find((entry) => entry.id === "acquisition");
  assert.ok(vitaminDAcquisition, "维生素 D 应提供独立的获取与利用入口");
  assert.equal(vitaminDAcquisition.title, "获取与利用维生素 D");
  assert.equal(vitaminD.navigation.find((entry) => entry.id === "food-sources").title, "维生素 D 的来源");
  assert.deepEqual(vitaminD.slots[vitaminDAcquisition.slotKey].groups.map((group) => group.title), [
    "日晒与人群差异",
    "食物、吸收与形式",
    "阳光的其他作用",
    "日晒与补充剂的区别",
  ]);
  assert.match(vitaminD.slots.overview.text, /^介绍\s+维生素 D/);
  assert.doesNotMatch(vitaminD.slots.overview.text, /阳光的其他作用；日晒与补充剂的区别；相关概念/);

  const fishOil = release.objects.find((item) => item.id === "supplement-ingredients/fish-oil");
  assert.ok(fishOil);
  assert.ok(fishOil.slots.formsAndSelection);
  assert.equal(fishOil.slots.effects.groups.length, 5);
  assert.match(fishOil.slots.formsAndSelection.markdown, /甘油三酯（TG）/);
  assert.equal(fishOil.slots.formsAndSelection.groups[0].subgroups.length, 6);
  assert.equal(fishOil.slots.effects.groups[0].summary, "心脏、血脂、血压与肝脏");
  assert.deepEqual(fishOil.navigation.map((entry) => entry.title), [
    "鱼油有什么作用？",
    "哪些食物可以提供相关脂肪酸？",
    "鱼油有哪些形式？",
    "如何选择鱼油？",
    "补充方式与用量",
    "服用补充剂注意事项",
  ]);
  assert.deepEqual(fishOil.navigation.find((entry) => entry.id === "forms").groupIndexes, [0]);
  assert.deepEqual(fishOil.navigation.find((entry) => entry.id === "selection").groupIndexes, [1]);
  assert.match(fishOil.slots.dosage.markdown, /建议早餐后服用鱼油/);
  assert.doesNotMatch(fishOil.slots.safety.markdown, /建议早餐后服用鱼油/);

  const contentObjects = release.objects.filter((item) => ["营养素", "补充剂"].includes(item.collection));
  const navigationTitles = contentObjects.flatMap((item) => item.navigation.map((entry) => entry.title));
  assert.ok(navigationTitles.every((title) => !title.includes("?")), "详情标题不应使用英文问号");
  assert.ok(navigationTitles.filter((title) => /^(哪些|如何)|有什么作用|有哪些形式/.test(title)).every((title) => title.endsWith("？")), "问句标题应使用中文全角问号");
  for (const item of contentObjects) {
    assert.ok(item.navigation.length > 0, `${item.title} 应至少有一个详情入口`);
    assert.equal(new Set(item.navigation.map((entry) => entry.id)).size, item.navigation.length, `${item.title} 入口标识不可重复`);
    assert.ok(item.navigation.every((entry) => item.slots[entry.slotKey]?.markdown?.trim()), `${item.title} 不应生成空入口`);
    assert.ok(item.navigation.every((entry) => !["overview", "special"].includes(entry.slotKey)), `${item.title} 不应把内部内容槽位暴露为入口`);
    const reachableSlotKeys = new Set(item.navigation.map((entry) => entry.slotKey));
    for (const [slotKey, slot] of Object.entries(item.slots)) {
      if (slotKey !== "overview" && slot.markdown.trim()) assert.ok(reachableSlotKeys.has(slotKey), `${item.title} 的 ${slotKey} 槽位有内容但没有入口`);
    }
  }

  const normalizedLine = (value) => value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*>]\s*/, "")
    .replace(/[`*_]/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [directory, idPrefix] of [["nutrients", "nutrients"], ["supplement-ingredients", "supplement-ingredients"]]) {
    const filenames = (await readdir(path.join(projectRoot, "knowledge", directory))).filter((filename) => filename.endsWith(".md") && filename !== "index.md");
    for (const filename of filenames) {
      const item = release.objects.find((entry) => entry.id === `${idPrefix}/${path.basename(filename, ".md")}`);
      assert.ok(item);
      const projectedText = normalizedLine(Object.values(item.slots).map((slot) => slot.markdown).join("\n"));
      let frontmatter = false;
      let topLevelHeading = "";
      const sourceLines = (await readFile(path.join(projectRoot, "knowledge", directory, filename), "utf8")).split("\n");
      for (const [index, line] of sourceLines.entries()) {
        if (index === 0 && line === "---") { frontmatter = true; continue; }
        if (frontmatter) { if (line === "---") frontmatter = false; continue; }
        const heading = line.match(/^#\s+(.+)/);
        if (heading) { topLevelHeading = heading[1]; continue; }
        if (["重点提示", "资料状态"].includes(topLevelHeading) || !line.trim() || /^#{2,6}\s/.test(line) || /^!\[/.test(line)) continue;
        if (/^以下内容保留原资料|^以下(?:内容|症状|症状和原因).*不能单独/.test(line)) continue;
        if (/^>/.test(line) && /(内部审核|医学审核|待确认|按原文保留|分类提示|暂定为|暂分为|用量信息类型|上限是风险边界|原始标题|这里混有|这里包含|仍需审核|不可直接用于个人决策)/.test(line)) continue;
        if (/^\|?\s*:?-{3,}/.test(line.trim().replace(/^\|\s*/, ""))) continue;
        const expectedText = normalizedLine(line);
        if (expectedText.length >= 2) assert.ok(projectedText.includes(expectedText), `${item.title} 的源内容未进入前端投影：${filename}:${index + 1} ${expectedText}`);
      }
    }
  }

  const guide = release.objects.find((item) => item.type === "Guidance");
  assert.ok(guide);
  assert.equal(guide.surface, "interface-only");

  const verification = release.objects.find((item) => item.title === "第三方验证标志");
  assert.equal(verification.verificationMarks.length, 13);
  assert.match(verification.verificationMarks[0].image, /^\/api\/v1\/assets\/verification-images\//);

  const salmon = release.objects.find((item) => item.id === "foods/三文鱼");
  assert.doesNotMatch(salmon.food.classification.markdown, /更细的国际对照编码/);

  const persisted = JSON.parse(await readFile(path.join(outputRoot, "release.json"), "utf8"));
  assert.equal(persisted.manifest.checksum, release.manifest.checksum);

  const searchDocuments = await readdir(path.join(outputRoot, "search-corpus"));
  assert.equal(searchDocuments.length, 190);
  const vitaminSearchDocument = await readFile(path.join(outputRoot, "search-corpus", "nutrients__vitamin-c.html"), "utf8");
  assert.match(vitaminSearchDocument, /data-pagefind-filter="collection:营养素"/);
  assert.match(vitaminSearchDocument, /data-pagefind-filter="category:维生素"/);
  assert.match(vitaminSearchDocument, /L-抗坏血酸/);
  assert.match(vitaminSearchDocument, /<h2 id="effects">作用与潜在益处<\/h2>/);
  assert.match(vitaminSearchDocument, /<h2 id="deficiency">缺乏体征和症状<\/h2>/);
  assert.doesNotMatch(vitaminSearchDocument, /补充方式与用量|服用补充剂注意事项|食物来源/);
  assert.doesNotMatch(vitaminSearchDocument, /重点提示/);
  const taurineSearchDocument = await readFile(path.join(outputRoot, "search-corpus", "nutrients__taurine.html"), "utf8");
  assert.match(taurineSearchDocument, /<h3 id="effects--\d+">心脏与血管<\/h3>/);
  assert.match(taurineSearchDocument, /心脏与血管：可自然降低高血压患者的血压/);
  const melatoninSearchDocument = await readFile(path.join(outputRoot, "search-corpus", "supplement-ingredients__melatonin.html"), "utf8");
  assert.doesNotMatch(melatoninSearchDocument, /避免使用人群|患有高血压的人/);
  const salmonSearchDocument = await readFile(path.join(outputRoot, "search-corpus", "foods__三文鱼.html"), "utf8");
  assert.match(salmonSearchDocument, /<h1 data-pagefind-weight="10">三文鱼<\/h1>/);
  assert.doesNotMatch(salmonSearchDocument, /<section>|维生素 A|牛磺酸/);
  assert.doesNotMatch(release.objects.map((item) => item.searchableText).join(" "), /供内部审核|尚未完成医学审核|不等于已完成医学验证|更细的国际对照编码暂不填写|暂分为|用量信息类型|上限是风险边界|原始标题/);
});

test("未知内容栏目会阻止候选发布", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "ihealth-invalid-slot-"));
  const knowledgeRoot = path.join(fixtureRoot, "knowledge");
  await cp(path.join(projectRoot, "knowledge"), knowledgeRoot, { recursive: true });
  const target = path.join(knowledgeRoot, "nutrients", "vitamin-c.md");
  await writeFile(target, `${await readFile(target, "utf8")}\n# 未登记的新栏目\n\n- 不应被静默丢弃\n`);
  await assert.rejects(() => compileKnowledgeRelease({
    knowledgeRoot,
    rawRoot: path.join(projectRoot, "raw"),
    outputRoot: path.join(fixtureRoot, "output"),
    copyAssets: false,
  }), /无法识别的内容栏目/);
});

test("断开的知识对象链接会阻止候选发布", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "ihealth-broken-link-"));
  const knowledgeRoot = path.join(fixtureRoot, "knowledge");
  await cp(path.join(projectRoot, "knowledge"), knowledgeRoot, { recursive: true });
  const target = path.join(knowledgeRoot, "nutrients", "vitamin-c.md");
  const source = await readFile(target, "utf8");
  await writeFile(target, source.replace("# 概览", "# 概览\n\n- [不存在的对象](/nutrients/not-found.md)"));
  await assert.rejects(() => compileKnowledgeRelease({
    knowledgeRoot,
    rawRoot: path.join(projectRoot, "raw"),
    outputRoot: path.join(fixtureRoot, "output"),
    copyAssets: false,
  }), /知识链接断开/);
});
