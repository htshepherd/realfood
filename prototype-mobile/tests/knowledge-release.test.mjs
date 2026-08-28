import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildExploreProjection, compileKnowledgeRelease } from "../scripts/knowledge-compiler.mjs";

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
  assert.equal(release.explore.defaultGroup, "细胞功能与代谢");
  assert.equal(release.explore.defaultTopic, "血糖");
  assert.deepEqual(release.explore.groups.map((group) => group.name), [
    "细胞功能与代谢",
    "心脑与神经",
    "免疫与呼吸",
    "消化与脏器",
    "骨骼与运动",
    "皮肤与感官",
    "生殖与激素",
  ]);
  assert.equal(release.explore.groups[0].topics[0].name, "血糖");
  const projectedTopics = release.explore.groups.flatMap((group) => group.topics.map((topic) => topic.name));
  assert.equal(projectedTopics.length, 35);
  assert.equal(new Set(projectedTopics).size, 35);
  assert.ok(release.explore.groups.flatMap((group) => group.topics).every((topic) => topic.count === topic.objectIds.length && topic.count > 0));
  const groups = release.explore.groups.map((group) => ({ name: group.name, topics: group.topics.map((topic) => topic.name) }));
  const omitted = structuredClone(groups);
  omitted[0].topics.pop();
  assert.throws(() => buildExploreProjection(release.objects, { groups: omitted }), /探索标签尚未分组/);
  const duplicated = structuredClone(groups);
  duplicated[1].topics.push("血糖");
  assert.throws(() => buildExploreProjection(release.objects, { groups: duplicated }), /探索标签不可重复/);
  const empty = structuredClone(groups);
  empty[0].topics.push("不存在的主题");
  assert.throws(() => buildExploreProjection(release.objects, { groups: empty }), /探索分组包含空标签/);
  assert.throws(() => buildExploreProjection(release.objects, { groups, defaultGroup: "不存在的分组" }), /探索默认分组无效/);
  assert.throws(() => buildExploreProjection(release.objects, { groups, defaultTopic: "睡眠" }), /探索默认标签无效/);

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
  assert.deepEqual(vitaminC.slots.deficiency.groups.map((group) => ({ title: group.title, role: group.deficiencyRole })), [
    { title: "饮食与生活方式", role: "risk" },
    { title: "药物影响", role: "risk" },
    { title: "疾病与恢复阶段", role: "risk" },
  ]);
  assert.ok(release.objects.filter((item) => item.slots.deficiency).every((item) => item.slots.deficiency.groups.every((group) => ["symptoms", "risk"].includes(group.deficiencyRole))), "每个缺乏分组都应携带编译后的语义角色");
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
  assert.ok(["TG", "EE", "rTG", "磷虾油", "藻油"].every((term) => fishOil.searchTerms.includes(term)));
  assert.ok(!fishOil.searchTerms.includes("MAG-O3"), "第二批候选未经黄金查询批准，不应自动发布");
  assert.ok(fishOil.relatedQueries.includes("α-亚麻酸"));
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

  assert.ok(["维生素 D2", "维生素 D3"].every((term) => vitaminD.searchTerms.includes(term)));
  const vitaminB12 = release.objects.find((item) => item.id === "nutrients/vitamin-b12");
  assert.ok(["甲基钴胺素", "羟钴胺素", "氰钴胺素"].every((term) => vitaminB12.searchTerms.includes(term)));
  assert.ok(!vitaminB12.searchTerms.includes("5-脱氧腺苷钴胺素"), "第二批候选未经黄金查询批准，不应自动发布");
  const magnesium = release.objects.find((item) => item.id === "nutrients/magnesium");
  assert.ok(["氢氧化镁", "海洋镁", "泻盐"].every((term) => magnesium.searchTerms.includes(term)));
  const alphaLipoicAcid = release.objects.find((item) => item.id === "supplement-ingredients/alpha-lipoic-acid");
  assert.ok(!alphaLipoicAcid.searchTerms.includes("ALA"));
  assert.ok(!alphaLipoicAcid.searchTerms.includes("二氢硫辛酸"), "第二批候选未经黄金查询批准，不应自动发布");
  const iodine = release.objects.find((item) => item.id === "nutrients/iodine");
  assert.ok(iodine.relatedQueries.includes("甲状腺"));
  assert.ok(!iodine.searchTerms.includes("甲状腺"));
  assert.ok(release.objects.every((item) => Array.isArray(item.relatedQueries)));
  assert.deepEqual(release.manifest.search.termCounts, { aliases: 52, searchTerms: 123, relatedQueries: 19 });
  assert.equal(release.manifest.search.termCounts.searchTerms, release.objects
    .filter((item) => ["Nutrient", "Supplement Ingredient"].includes(item.type))
    .reduce((total, item) => total + item.searchTerms.length, 0));
  assert.deepEqual(release.manifest.search.queryExpansions["欧米伽3"].map((entry) => entry.query), ["Omega-3", "ω-3"]);
  assert.deepEqual(release.manifest.search.queryExpansions["幽门螺旋杆菌"], [{ query: "根除", evidenceTerm: "幽门螺杆菌" }]);
  assert.deepEqual(release.manifest.search.queryExpansions["幽门"], [{ query: "根除", evidenceTerm: "幽门螺杆菌" }]);
  assert.deepEqual(release.manifest.search.queryExpansions["磷虾油"], [{ query: "ihealthevidencekrilloil", evidenceTerm: "磷虾油" }]);
  assert.deepEqual(release.manifest.search.queryExpansions["骨密度"], [{ query: "ihealthevidencebonedensity", evidenceTerm: "骨密度" }]);
  assert.deepEqual(release.manifest.search.queryExpansions.ala, [
    { query: "Alpha Lipoic Acid", context: "ALA：Alpha Lipoic Acid（α-硫辛酸）" },
    { query: "α-亚麻酸", context: "ALA：α-亚麻酸（相关知识）" },
  ]);
  const candidateQueries = JSON.parse(await readFile(new URL("./search-candidate-queries.json", import.meta.url), "utf8"));
  assert.equal(candidateQueries.length, 19);
  assert.equal(candidateQueries.filter((candidate) => candidate.status === "pending-golden-review").length, 18);
  assert.equal(candidateQueries.filter((candidate) => candidate.status === "pending-terminology-review").length, 1);
  for (const candidate of candidateQueries) {
    const item = release.objects.find((entry) => entry.id === candidate.expectedId);
    assert.ok(item, `候选词对象不存在：${candidate.expectedId}`);
    assert.ok(!item.searchTerms.includes(candidate.query), `未审批的第二批候选不应进入发布词层：${candidate.query}`);
  }
  assert.equal(release.manifest.search.queryExpansions["甲钴胺"], undefined);

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
  assert.match(vitaminSearchDocument, /<p data-pagefind-weight="8">[^<]*抗坏血酸/);
  assert.match(vitaminSearchDocument, /<h2 id="effects">作用与潜在益处<\/h2>/);
  assert.match(vitaminSearchDocument, /<h2 id="deficiency">缺乏体征和症状<\/h2>/);
  assert.match(vitaminSearchDocument, /<section data-pagefind-weight="0\.5">\s*<h2 id="safety">风险、禁忌与相互作用<\/h2>/);
  assert.doesNotMatch(vitaminSearchDocument, /补充方式与用量|食物来源/);
  assert.doesNotMatch(vitaminSearchDocument, /重点提示/);
  const taurineSearchDocument = await readFile(path.join(outputRoot, "search-corpus", "nutrients__taurine.html"), "utf8");
  assert.match(taurineSearchDocument, /<h3 id="effects--\d+">心脏与血管<\/h3>/);
  assert.match(taurineSearchDocument, /心脏与血管：可自然降低高血压患者的血压/);
  const melatoninSearchDocument = await readFile(path.join(outputRoot, "search-corpus", "supplement-ingredients__melatonin.html"), "utf8");
  assert.match(melatoninSearchDocument, /<h2 id="safety">风险、禁忌与相互作用<\/h2>/);
  assert.match(melatoninSearchDocument, /避免使用人群|患有高血压的人/);
  const seleniumSearchDocument = await readFile(path.join(outputRoot, "search-corpus", "nutrients__selenium.html"), "utf8");
  assert.match(seleniumSearchDocument, /口臭（类似大蒜味）/);
  const selenium = release.objects.find((item) => item.id === "nutrients/selenium");
  assert.ok(![...selenium.aliases, ...selenium.searchTerms, ...selenium.relatedQueries].includes("口臭"));
  const iodineSearchDocument = await readFile(path.join(outputRoot, "search-corpus", "nutrients__iodine.html"), "utf8");
  assert.match(iodineSearchDocument, /<p data-pagefind-weight="2">[^<]*甲状腺/);
  const fishOilSearchDocument = await readFile(path.join(outputRoot, "search-corpus", "supplement-ingredients__fish-oil.html"), "utf8");
  assert.match(fishOilSearchDocument, /<p data-pagefind-weight="6">[^<]*磷虾油[^<]*ihealthevidencekrilloil/);
  const manganeseSearchDocument = await readFile(path.join(outputRoot, "search-corpus", "nutrients__manganese.html"), "utf8");
  assert.match(manganeseSearchDocument, /<p data-pagefind-weight="2">[^<]*骨密度[^<]*ihealthevidencebonedensity/);
  assert.match(manganeseSearchDocument, /骨密度[^<]*ihealthevidencebonedensity/);
  assert.doesNotMatch(manganeseSearchDocument, /data-pagefind-weight="(?:6|8)">[^<]*骨密度/);
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

test("同一知识对象中的归一化搜索词重复会阻止候选发布", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "ihealth-duplicate-search-term-"));
  const knowledgeRoot = path.join(fixtureRoot, "knowledge");
  await cp(path.join(projectRoot, "knowledge"), knowledgeRoot, { recursive: true });
  const target = path.join(knowledgeRoot, "nutrients", "vitamin-d.md");
  const source = await readFile(target, "utf8");
  await writeFile(target, source.replace("search_terms:", "related_queries: [\"维 D\"]\nsearch_terms:"));
  await assert.rejects(() => compileKnowledgeRelease({
    knowledgeRoot,
    rawRoot: path.join(projectRoot, "raw"),
    outputRoot: path.join(fixtureRoot, "output"),
    copyAssets: false,
  }), /搜索词重复/);
});

test("食物知识对象中的归一化搜索词重复也会阻止候选发布", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "ihealth-duplicate-food-search-term-"));
  const knowledgeRoot = path.join(fixtureRoot, "knowledge");
  await cp(path.join(projectRoot, "knowledge"), knowledgeRoot, { recursive: true });
  const target = path.join(knowledgeRoot, "foods", "松子.md");
  const source = await readFile(target, "utf8");
  await writeFile(target, source.replace("search_terms: []", "search_terms: [\"松仁\"]"));
  await assert.rejects(() => compileKnowledgeRelease({
    knowledgeRoot,
    rawRoot: path.join(projectRoot, "raw"),
    outputRoot: path.join(fixtureRoot, "output"),
    copyAssets: false,
  }), /搜索词重复/);
});
