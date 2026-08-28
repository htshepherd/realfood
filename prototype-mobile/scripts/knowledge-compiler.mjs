import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { readRegularFile, regularFiles, validatePathSegment } from "../src/server/safe-files.mjs";

const COLLECTIONS = [
  ["foods", "食物"],
  ["nutrients", "营养素"],
  ["supplement-ingredients", "补充剂"],
  ["nutrient-groups", "营养素组"],
  ["guides", "指南"],
  ["references", "参考与验证"],
  ["references/taxonomies", "参考与验证"],
];

const SLOT_ORDER = [
  "overview",
  "effects",
  "acquisition",
  "special",
  "deficiency",
  "foodSources",
  "formsAndSelection",
  "dosage",
  "safety",
  "lifestyle",
];

const SLOT_LABELS = {
  overview: "概览",
  effects: "有什么作用？",
  acquisition: "获取与利用",
  special: "相关知识",
  deficiency: "缺乏与不足",
  foodSources: "食物来源",
  formsAndSelection: "补充剂形态与选择",
  dosage: "补充方式与用量",
  safety: "服用补充剂注意事项",
  lifestyle: "生活建议",
};

const GROUP_SUMMARIES = {
  "维生素 C/抗氧化与细胞保护": "氧化应激、自由基与细胞保护",
  "维生素 C/胶原与组织修复": "胶原合成、伤口、皮肤与牙龈",
  "维生素 C/免疫、感染与过敏": "白细胞、感冒、感染与组胺",
  "维生素 C/铁吸收与营养协同": "铁形态转换与营养素协同",
  "维生素 C/心血管与代谢支持": "血管、心脏、肝脏、血压与尿酸",
  "维生素 C/神经、恢复与特定用途": "大脑、疲劳、运动恢复与特定用途",
  "鱼油/心血管与代谢": "心脏、血脂、血压与肝脏",
  "鱼油/炎症与关节": "慢性炎症与关节不适",
  "鱼油/眼睛与认知": "眼睛、注意力与认知变化",
  "鱼油/皮肤、骨骼与成长": "皮肤、骨骼与婴儿视力发育",
  "鱼油/呼吸、情绪与日常状态": "过敏、情绪、睡眠与经期不适",
};
const DEFICIENCY_RISK_GROUP_TITLES = new Set([
  "易缺乏钙群体", "易患胆碱缺乏症的人群", "易缺乏铜的原因及群体", "易缺碘群体",
  "低钾血症的原因", "易缺乏镁的群体", "易缺乏硒的群体", "低钠血症的原因",
  "导致牛磺酸缺乏的原因", "易缺乏维生素 A 群体", "易缺乏维生素 B12 群体",
  "易缺乏维生素 B9 群体", "饮食与生活方式", "药物影响", "疾病与恢复阶段",
  "易缺乏维生素 E 群体", "易缺乏锌的群体", "哪些疾病会消耗辅酶 Q10？",
  "哪些人更需要辅酶 Q10？", "易缺乏肌醇群体", "干扰褪黑激素分泌的因素",
]);
const DEFICIENCY_SYMPTOM_GROUP_TITLES = new Set([
  "钙缺乏体征和症状", "胆碱缺乏症", "铜缺乏症体征和症状",
  "碘缺乏及相关甲状腺疾病体征和症状", "新生儿碘缺乏症状", "与碘缺乏相关的疾病",
  "铁缺乏症体征和症状", "镁缺乏体征和症状", "低钾血症体征和症状",
  "硒缺乏体征和症状", "低钠血症体征和症状", "牛磺酸缺乏的体征和症状",
  "维生素 A 缺乏体征和症状", "维生素 B1 缺乏体征和症状",
  "维生素 B12 缺乏体征和症状", "维生素 B2 缺乏体征和症状",
  "维生素 B3 缺乏体征和症状", "维生素 B6 缺乏体征和症状", "维生素 B7 缺乏症",
  "维生素 B9 缺乏体征和症状", "维生素 D 缺乏体征和症状",
  "维生素 E 缺乏体征和症状", "维生素 K 缺乏体征和症状", "锌缺乏体征和症状",
  "褪黑激素不足症状",
]);

// Authoring-only sections are intentionally omitted. Listing them explicitly
// ensures a newly introduced heading fails the build instead of disappearing.
const AUTHORING_ONLY_HEADINGS = new Set(["重点提示", "资料状态"]);
const COMPILER_SCHEMA = "ihealth-release@3";
const SEARCH_ENGINE_VERSION = "pagefind@1.5.2";
const SEARCH_DOCUMENT_SCHEMA = "focused-effects-deficiency-safety@2";
const SEARCH_CONTENT_SLOT_KEYS = ["effects", "deficiency", "safety"];
const SEARCH_CONTENT_COLLECTIONS = new Set(["营养素", "补充剂"]);
const SEARCH_SLOT_LABELS = {
  effects: "作用与潜在益处",
  deficiency: "缺乏体征和症状",
  safety: "风险、禁忌与相互作用",
};
const EXPLORE_GROUPS = [
  { name: "细胞功能与代谢", topics: ["血糖", "血脂", "能量", "DNA", "抗氧化", "细胞保护", "营养协同", "造血"] },
  { name: "心脑与神经", topics: ["心脏", "血管", "大脑", "神经", "情绪", "睡眠"] },
  { name: "免疫与呼吸", topics: ["免疫", "炎症", "感染", "呼吸道", "过敏"] },
  { name: "消化与脏器", topics: ["消化", "肝脏", "肾脏"] },
  { name: "骨骼与运动", topics: ["骨骼", "牙齿", "肌肉", "关节", "运动", "身体恢复", "疼痛"] },
  { name: "皮肤与感官", topics: ["皮肤", "头发", "眼睛", "伤口"] },
  { name: "生殖与激素", topics: ["生殖", "激素"] },
];
// These opaque tokens are indexed beside the exact evidence at that evidence's
// own Pagefind weight. They work around Chinese tokenization gaps without
// borrowing the score of an unrelated searchable word.
const PAGEFIND_EVIDENCE_ANCHORS = {
  骨密度: "ihealthevidencebonedensity",
  磷虾油: "ihealthevidencekrilloil",
};
const SEARCH_QUERY_EXPANSIONS = {
  a: [{ query: "维生素 A" }],
  c: [{ query: "维生素 C" }],
  d: [{ query: "维生素 D" }],
  e: [{ query: "维生素 E" }],
  k: [{ query: "维生素 K" }],
  老人: [{ query: "老人" }, { query: "老年人" }, { query: "老年" }],
  女人: [{ query: "女人" }, { query: "女性" }, { query: "妇女" }],
  幽门: [{ query: "根除", evidenceTerm: "幽门螺杆菌" }],
  幽门螺杆菌: [{ query: "根除", evidenceTerm: "幽门螺杆菌" }],
  幽门螺旋杆菌: [{ query: "根除", evidenceTerm: "幽门螺杆菌" }],
  抽筋: [{ query: "抽筋" }, { query: "肌肉痉挛" }],
  伤口恢复慢: [{ query: "伤口恢复慢" }, { query: "伤口愈合缓慢" }],
  注意力下降: [{ query: "注意力下降" }, { query: "注意力不集中" }, { query: "难以集中注意力" }],
  睡眠差: [{ query: "睡眠差" }, { query: "睡眠质量" }, { query: "入睡困难" }, { query: "失眠" }],
  反复感染: [{ query: "反复感染" }, { query: "频繁感染" }, { query: "容易感染" }],
  骨密度: [{ query: PAGEFIND_EVIDENCE_ANCHORS.骨密度, evidenceTerm: "骨密度" }],
  欧米伽3: [{ query: "Omega-3" }, { query: "ω-3" }],
  奥米伽3: [{ query: "Omega-3" }, { query: "ω-3" }],
  磷虾油: [{ query: PAGEFIND_EVIDENCE_ANCHORS.磷虾油, evidenceTerm: "磷虾油" }],
  ala: [
    { query: "Alpha Lipoic Acid", context: "ALA：Alpha Lipoic Acid（α-硫辛酸）" },
    { query: "α-亚麻酸", context: "ALA：α-亚麻酸（相关知识）" },
  ],
};

const normalizeName = (value) => value
  .replace(/^\d+_/, "")
  .replace(/\.[^.]+$/, "")
  .replace(/^所有/, "")
  .replaceAll(" ", "")
  .replace("大枣", "鲜枣");

function parseInlineArray(value) {
  if (!value || value === "[]") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
}

function scalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function nestedScalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^\\s+${key}:\\s*(.*)$`, "m"));
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function parseFrontmatter(markdown, sourceLabel) {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) throw new Error(`缺少 frontmatter：${sourceLabel}`);
  const frontmatter = match[1];
  return {
    body: match[2],
    metadata: {
      type: scalar(frontmatter, "type"),
      title: scalar(frontmatter, "title"),
      description: scalar(frontmatter, "description"),
      profile: scalar(frontmatter, "profile"),
      language: scalar(frontmatter, "language"),
      scope: scalar(frontmatter, "release_scope"),
      status: scalar(frontmatter, "status"),
      aliases: parseInlineArray(scalar(frontmatter, "aliases")),
      tags: parseInlineArray(scalar(frontmatter, "tags")),
      topicTags: parseInlineArray(scalar(frontmatter, "topic_tags")),
      searchTerms: parseInlineArray(scalar(frontmatter, "search_terms")),
      relatedQueries: parseInlineArray(scalar(frontmatter, "related_queries")),
      giftGroup: nestedScalar(frontmatter, "group"),
      giftGroupCode: nestedScalar(frontmatter, "group_code"),
      giftSubgroup: nestedScalar(frontmatter, "subgroup"),
      giftSubgroupCode: nestedScalar(frontmatter, "subgroup_code"),
    },
  };
}

function sectionsAtLevel(markdown, level) {
  const lines = markdown.split("\n");
  const prefix = "#".repeat(level);
  const starts = [];
  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match?.[1] === prefix) starts.push({ index, title: match[2].trim() });
  });

  return starts.map((start, index) => {
    let end = lines.length;
    for (let cursor = start.index + 1; cursor < lines.length; cursor += 1) {
      const heading = lines[cursor].match(/^(#{1,6})\s+/);
      if (heading && heading[1].length <= level) {
        end = cursor;
        break;
      }
    }
    const contentLines = lines.slice(start.index + 1, end);
    return {
      title: start.title,
      markdown: contentLines.join("\n").trim(),
      order: index,
    };
  });
}

function plainText(markdown) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*>]\s*/gm, "")
    .replace(/`|\*\*|__/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function consumerMarkdown(markdown) {
  return markdown
    .split("\n")
    .filter((line) => !(line.startsWith(">") && /(内部审核|医学审核|待确认|按原文保留|分类提示|暂定为|暂分为|用量信息类型|上限是风险边界|原始标题|这里混有|这里包含|仍需审核|不可直接用于个人决策)/.test(line)))
    .join("\n")
    .replace(/^以下内容保留原资料的措辞和确定性程度；归入“潜在益处”不等于已完成医学验证。$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function knowledgeLinks(markdown) {
  return [...markdown.matchAll(/\[([^\]]+)\]\(([^)]+\.md)\)/g)].map((match) => ({
    title: match[1],
    href: match[2],
    slug: path.basename(match[2], ".md"),
  }));
}

function sectionToSlot(section, key, objectTitle = "") {
  const markdown = consumerMarkdown(section.markdown);
  const nestedSections = sectionsAtLevel(section.markdown, 2);
  const groupSections = nestedSections.length > 0 ? nestedSections : key === "special" ? [section] : [];
  return {
    key,
    label: SLOT_LABELS[key],
    sourceTitle: section.title,
    markdown,
    text: plainText(markdown),
    groups: groupSections.map((group) => {
      const groupMarkdown = consumerMarkdown(group.markdown);
      const itemCount = group.markdown.split("\n").filter((line) => /^-\s+/.test(line)).length;
      return {
      title: group.title.replace(/^\[|\]$/g, ""),
      markdown: groupMarkdown,
      text: plainText(groupMarkdown),
      itemCount,
      links: knowledgeLinks(group.markdown),
      summary: GROUP_SUMMARIES[`${objectTitle}/${group.title}`] ?? "",
      subgroups: sectionsAtLevel(group.markdown, 3).map((subgroup) => {
        const subgroupMarkdown = consumerMarkdown(subgroup.markdown);
        return {
          title: subgroup.title.replace(/^\[|\]$/g, ""),
          markdown: subgroupMarkdown,
          text: plainText(subgroupMarkdown),
          itemCount: subgroup.markdown.split("\n").filter((line) => /^-\s+/.test(line)).length,
          links: knowledgeLinks(subgroup.markdown),
          summary: "",
          subgroups: [],
        };
      }),
    }; }),
  };
}

function slotKeyForTitle(title) {
  if (title === "概览") return "overview";
  if (title === "机制、作用与潜在益处") return "effects";
  if (/^获取与利用/.test(title)) return "acquisition";
  if (title === "缺乏" || title === "缺乏与不足") return "deficiency";
  if (title === "食物来源") return "foodSources";
  if (title === "补充剂形态" || title === "补充剂形态与选择") return "formsAndSelection";
  if (title === "每日用量") return "dosage";
  if (title === "相互作用与注意事项") return "safety";
  if (title === "生活建议") return "lifestyle";
  if (["相关概念", "其他用途", "阳光的其他作用", "日晒与补充剂的区别"].includes(title)) return "special";
  return null;
}

function buildSlots(body, sourceLabel, objectTitle) {
  const found = new Map();
  for (const section of sectionsAtLevel(body, 1)) {
    const key = slotKeyForTitle(section.title);
    if (!key) {
      if (AUTHORING_ONLY_HEADINGS.has(section.title)) continue;
      throw new Error(`无法识别的内容栏目：${sourceLabel} -> ${section.title}`);
    }
    if (found.has(key)) {
      const previous = found.get(key);
      found.set(key, {
        ...previous,
        sourceTitle: `${previous.sourceTitle}；${section.title}`,
        markdown: `${previous.markdown}\n\n## ${section.title}\n\n${section.markdown}`,
        text: `${previous.text} ${plainText(section.markdown)}`.trim(),
        groups: [...previous.groups, ...sectionToSlot(section, key, objectTitle).groups],
      });
    } else {
      found.set(key, sectionToSlot(section, key, objectTitle));
    }
  }
  return Object.fromEntries(SLOT_ORDER.filter((key) => found.has(key)).map((key) => [key, found.get(key)]));
}

function cloneSlot(slot) {
  return slot ? { ...slot, groups: slot.groups.map((group) => ({ ...group, links: [...group.links], subgroups: group.subgroups.map((subgroup) => ({ ...subgroup, links: [...subgroup.links], subgroups: [] })) })) } : null;
}

function appendToSlot(target, source, sourceTitle = source?.sourceTitle) {
  if (!source?.markdown?.trim()) return target;
  if (!target) return cloneSlot(source);
  const heading = sourceTitle ? `## ${sourceTitle}\n\n` : "";
  const markdown = `${target.markdown}\n\n${heading}${source.markdown}`.trim();
  return {
    ...target,
    markdown,
    text: plainText(markdown),
    groups: [...target.groups, ...source.groups],
  };
}

function slotFromGroups(slot, groups, label = slot?.label) {
  if (!slot || groups.length === 0) return null;
  const markdown = groups.map((group) => `## ${group.title}\n\n${group.markdown}`).join("\n\n");
  return { ...slot, label, markdown, text: plainText(markdown), groups };
}

function groupFromBulletLines(title, lines) {
  const markdown = lines.join("\n");
  return { title, markdown, text: plainText(markdown), itemCount: lines.length, links: knowledgeLinks(markdown), summary: "", subgroups: [] };
}

function refineVitaminCPresentation(slots) {
  const deficiency = slots.deficiency;
  if (deficiency?.groups.length === 1) {
    const bullets = deficiency.groups[0].markdown.split("\n").filter((line) => /^-\s+/.test(line));
    const medicine = bullets.filter((line) => /服用.+药/.test(line));
    const illness = bullets.filter((line) => /癌症患者|肾功能|患有牙龈炎/.test(line));
    const lifestyle = bullets.filter((line) => !medicine.includes(line) && !illness.includes(line));
    slots.deficiency = slotFromGroups(deficiency, [
      groupFromBulletLines("饮食与生活方式", lifestyle),
      groupFromBulletLines("药物影响", medicine),
      groupFromBulletLines("疾病与恢复阶段", illness),
    ].filter((group) => group.itemCount > 0));
  }

  const safety = slots.safety;
  if (safety?.groups.length === 1) {
    const bullets = safety.groups[0].markdown.split("\n").filter((line) => /^-\s+/.test(line));
    const nutrients = bullets.filter((line) => /^-\s+(铜|钙)：/.test(line));
    const medicines = bullets.filter((line) => !nutrients.includes(line));
    slots.safety = slotFromGroups(safety, [
      groupFromBulletLines("与药物同服", medicines),
      groupFromBulletLines("与其他营养素同服", nutrients),
    ].filter((group) => group.itemCount > 0));
  }
}

function projectDeficiencyRoles(slot, objectTitle) {
  if (!slot) return slot;
  return {
    ...slot,
    groups: slot.groups.map((group) => {
      const deficiencyRole = DEFICIENCY_RISK_GROUP_TITLES.has(group.title)
        ? "risk"
        : DEFICIENCY_SYMPTOM_GROUP_TITLES.has(group.title)
          ? "symptoms"
          : null;
      if (!deficiencyRole) throw new Error(`缺乏分组缺少语义角色：${objectTitle} -> ${group.title}`);
      return { ...group, deficiencyRole };
    }),
  };
}

// The Markdown headings preserve the author's source structure. The consumer
// contract below applies the product decisions without rewriting those files:
// Basic facts live in overview and serving advice lives with dosage. Most
// acquisition details can enrich food/dosage; vitamin D keeps its authored
// acquisition journey because sunlight, food and supplement differences form
// one coherent user-facing topic. Related concepts never become a card.
function normalizeConsumerSlots(sourceSlots, title) {
  const slots = Object.fromEntries(Object.entries(sourceSlots).map(([key, slot]) => [key, cloneSlot(slot)]));
  const acquisition = slots.acquisition;
  if (title === "维生素 D" && acquisition) {
    const relatedGroups = slots.special?.groups.filter((group) => group.title === "相关概念") ?? [];
    const sunlightGroups = slots.special?.groups.filter((group) => group.title !== "相关概念") ?? [];
    slots.acquisition = slotFromGroups(acquisition, [...acquisition.groups, ...sunlightGroups], acquisition.label);
    slots.overview = appendToSlot(slots.overview, slotFromGroups(slots.special, relatedGroups), "相关概念");
  } else if (acquisition) {
    const overviewGroups = acquisition.groups.filter((group) => /基础|概览|事实/.test(group.title));
    const dosageGroups = acquisition.groups.filter((group) => /补充需求|补充方式|服用/.test(group.title));
    const foodGroups = acquisition.groups.filter((group) => !overviewGroups.includes(group) && !dosageGroups.includes(group));
    slots.overview = appendToSlot(slots.overview, slotFromGroups(acquisition, overviewGroups), "获取与利用");
    slots.foodSources = appendToSlot(slots.foodSources, slotFromGroups(acquisition, foodGroups), "获取与利用");
    slots.dosage = appendToSlot(slots.dosage, slotFromGroups(acquisition, dosageGroups), "补充需求");
  }
  if (title !== "维生素 D" && slots.special) slots.overview = appendToSlot(slots.overview, slots.special, slots.special.sourceTitle);

  if (slots.safety) {
    const servingAdvice = slots.safety.groups.filter((group) => /服用建议|使用方式/.test(group.title));
    const safetyGroups = slots.safety.groups.filter((group) => !servingAdvice.includes(group));
    slots.dosage = appendToSlot(slots.dosage, slotFromGroups(slots.safety, servingAdvice), "服用方式");
    slots.safety = slotFromGroups(slots.safety, safetyGroups) ?? slots.safety;
  }

  if (title !== "维生素 D") delete slots.acquisition;
  delete slots.special;
  if (title === "维生素 C") refineVitaminCPresentation(slots);
  slots.deficiency = projectDeficiencyRoles(slots.deficiency, title);
  return Object.fromEntries(SLOT_ORDER.filter((key) => slots[key]?.markdown?.trim()).map((key) => [key, slots[key]]));
}

function slotCounts(slot) {
  return {
    groups: slot?.groups.length ?? 0,
    items: slot?.groups.reduce((total, group) => total + group.itemCount, 0) ?? 0,
    links: slot?.groups.reduce((total, group) => total + group.links.length, 0) ?? 0,
  };
}

function effectPageIntro(title, groups) {
  if (title === "维生素 C") return "它参与抗氧化、胶原合成、免疫支持和铁吸收等多种生理过程。";
  if (title === "鱼油") return "主要涉及心血管、炎症、认知、皮肤和日常状态等方面。";
  const themes = groups.slice(0, 4).map((group) => group.title.split(/[、与，]/)[0]).filter(Boolean);
  return themes.length ? `主要涉及${themes.join("、")}等方面。` : "按作用主题查看相关内容。";
}

function navigationEntry({ id, slotKey, title, description, pageIntro = "", groupIndexes = null }) {
  return { id, slotKey, title, description, pageIntro, groupIndexes };
}

function buildKnowledgeNavigation(title, collection, slots) {
  const entries = [];
  const titleGap = /[A-Za-z0-9]$/.test(title) ? " " : "";
  const addStandard = (slotKey) => {
    const slot = slots[slotKey];
    if (!slot?.markdown?.trim()) return;
    const counts = slotCounts(slot);
    if (slotKey === "foodSources") {
      const hasSunlight = slot.text.includes("日晒") || slot.text.includes("阳光");
      entries.push(navigationEntry({
        id: "food-sources", slotKey,
        title: title === "鱼油" ? "哪些食物可以提供相关脂肪酸？" : title === "维生素 D" ? "维生素 D 的来源" : hasSunlight ? `如何获得${title}？` : `哪些食物富含${title}？`,
        description: title === "鱼油" ? `${counts.links} 种食物 · 植物转化` : `${counts.links || counts.items} 种食物`,
        pageIntro: title === "维生素 C" ? "以下水果和蔬菜中富含维生素 C。" : title === "维生素 D" ? "维生素 D 可以通过阳光、食物和补充剂获得。" : title === "鱼油" ? "这些食物可以提供与鱼油相关的脂肪酸。" : "常见食物来源如下。",
      }));
    } else if (slotKey === "effects") {
      entries.push(navigationEntry({ id: "effects", slotKey, title: `${title}${titleGap}有什么作用？`, description: `${counts.groups} 个主题 · ${counts.items} 条`, pageIntro: effectPageIntro(title, slot.groups) }));
    } else if (slotKey === "acquisition") {
      entries.push(navigationEntry({ id: "acquisition", slotKey, title: `获取与利用${title}`, description: `${counts.groups} 个主题 · ${counts.items} 条`, pageIntro: "日晒、食物与补充剂的获取和利用方式。" }));
    } else if (slotKey === "deficiency") {
      entries.push(navigationEntry({ id: "deficiency", slotKey, title: `${title}${titleGap}缺乏与不足`, description: `${counts.groups || 1} 类 · ${counts.items} 条`, pageIntro: "了解缺乏与不足的常见表现及相关人群。" }));
    } else if (slotKey === "dosage") {
      const hasTable = /\|[^\n]+\|/.test(slot.markdown);
      const hasServingAdvice = /成人|服用|随餐|早餐|分次|使用方式/.test(slot.text);
      entries.push(navigationEntry({ id: "dosage", slotKey, title: "补充方式与用量", description: hasTable && hasServingAdvice ? "成人与年龄用量参考" : hasTable ? "按年龄用量参考" : "用量与服用方式", pageIntro: "不同年龄阶段的参考摄入量与补充方式。" }));
    } else if (slotKey === "safety") {
      const description = title === "维生素 C" ? `${slot.groups[0]?.itemCount ?? 0} 类药物 · ${slot.groups[1]?.itemCount ?? 0} 种营养素` : title === "鱼油" ? "过量 · 同服注意事项" : `${counts.groups || 1} 类注意事项`;
      entries.push(navigationEntry({ id: "safety", slotKey, title: "服用补充剂注意事项", description, pageIntro: "了解服用风险、禁忌人群及可能的相互作用。" }));
    } else if (slotKey === "lifestyle") {
      entries.push(navigationEntry({ id: "lifestyle", slotKey, title: `${title}的生活建议`, description: `${counts.groups || 1} 类 · ${counts.items} 条` }));
    }
  };

  const addFormsAndSelection = () => {
    const slot = slots.formsAndSelection;
    if (!slot?.markdown?.trim()) return;
    const selectionIndexes = [];
    const formIndexes = [];
    slot.groups.forEach((group, index) => (/如何.*选|选购|选择/.test(group.title) ? selectionIndexes : formIndexes).push(index));
    if (formIndexes.length) {
      const formGroups = formIndexes.map((index) => slot.groups[index]);
      const formCount = formGroups.reduce((total, group) => total + group.subgroups.length, 0);
      entries.push(navigationEntry({ id: "forms", slotKey: "formsAndSelection", groupIndexes: formIndexes, title: `${title}${titleGap}有哪些形式？`, description: formCount ? `${formCount} 种形式 · 各有取舍` : `${formGroups.length} 类形态`, pageIntro: `${title}${titleGap}有多种形式，各自保留了不同的优点与局限。` }));
    }
    if (selectionIndexes.length) {
      entries.push(navigationEntry({ id: "selection", slotKey: "formsAndSelection", groupIndexes: selectionIndexes, title: `如何选择${title}？`, description: title === "鱼油" ? "含量 · 氧化 · 第三方验证" : "按形态与选择要点查看", pageIntro: "选择时可关注含量、形态和质量信息。" }));
    }
  };

  const order = collection === "营养素"
    ? ["foodSources", "effects", "acquisition", "deficiency", "formsAndSelection", "dosage", "lifestyle", "safety"]
    : ["effects", "foodSources", "formsAndSelection", "deficiency", "dosage", "lifestyle", "safety"];
  for (const key of order) key === "formsAndSelection" ? addFormsAndSelection() : addStandard(key);
  return entries;
}

function extractFoodContent(body) {
  const sections = sectionsAtLevel(body, 2);
  const byTitle = Object.fromEntries(sections.map((section) => [section.title, section]));
  const relationSection = byTitle["在本知识库中的营养关系"];
  const relationMatches = [...(relationSection?.markdown ?? "").matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
  return {
    identity: byTitle["这是什么条目"] ? sectionToSlot(byTitle["这是什么条目"], "overview") : null,
    classification: byTitle["食物分类"] ? sectionToSlot({
      ...byTitle["食物分类"],
      markdown: byTitle["食物分类"].markdown.replace(/^- 更细的国际对照编码暂不填写。.*$/m, "").trim(),
    }, "special") : null,
    relations: relationMatches.map((match) => ({ title: match[1], href: match[2] })),
    relationCount: relationMatches.length,
  };
}

function extractVerificationMarks(body) {
  return sectionsAtLevel(body, 3).map((section) => {
    const image = section.markdown.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1] ?? "";
    const filename = path.basename(image).replace(/^\d+_/, "");
    return {
      name: section.title,
      description: plainText(consumerMarkdown(section.markdown)),
      image: filename ? `/api/v1/assets/verification-images/${encodeURIComponent(filename)}` : "",
    };
  }).filter((mark) => mark.image);
}

function surfaceForType(type) {
  if (["Food", "Food Group", "Nutrient", "Supplement Ingredient"].includes(type)) return "primary";
  if (type === "Nutrient Group") return "grouping-only";
  if (type === "Guidance") return "interface-only";
  return "capability-only";
}

function categoryFor(metadata, collection) {
  if (collection === "食物") return metadata.giftGroup || metadata.tags[1] || metadata.tags[0] || "其他";
  if (collection === "营养素") return metadata.tags[0] || "其他营养素";
  if (collection === "补充剂") return metadata.tags[1] || metadata.tags[0] || "其他补充剂成分";
  return collection;
}

async function buildRawOrder(rawRoot) {
  await regularFiles(rawRoot);
  const result = new Map();
  for (const entry of await fs.readdir(rawRoot, { withFileTypes: true })) {
    validatePathSegment(entry.name);
    const entryPath = path.join(rawRoot, entry.name);
    const stat = await fs.lstat(entryPath);
    if (stat.isSymbolicLink()) throw new Error(`拒绝原始资料符号链接：${entryPath}`);
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^(\d+)_([^/]+)$/);
    if (match) result.set(normalizeName(match[2]), Number(match[1]));
  }
  ["维生素B1", "维生素B2", "维生素B3", "维生素B5", "维生素B6", "维生素B7", "维生素B9", "维生素B12"]
    .forEach((name, index) => result.set(name, 4 + (index + 1) / 100));
  return result;
}

async function markdownFiles(directory, knowledgeRoot) {
  return (await regularFiles(directory, { authorizationRoot: knowledgeRoot })).filter((file) => file.endsWith(".md") && path.basename(file) !== "index.md");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function buildAssetManifest(assetRoot, options = {}) {
  if (!assetRoot) return { checksum: sha256("[]"), count: 0, items: [] };
  const outputRoot = typeof options === "object" ? options.outputRoot : null;
  const items = [];
  for (const bucket of ["food-images", "knowledge-images", "verification-images"]) {
    const directory = path.join(assetRoot, bucket);
    for (const filePath of await regularFiles(directory, { skipTopLevel: ["optimized"], authorizationRoot: assetRoot })) {
      if (path.extname(filePath).toLowerCase() !== ".png") throw new Error(`只允许 PNG 原始资源：${filePath}`);
      const filename = path.basename(filePath);
      validatePathSegment(filename);
      const sourceBytes = await readRegularFile(directory, filePath, { authorizationRoot: assetRoot });
      const sourceMetadata = await sharp(sourceBytes).metadata();
      if (sourceMetadata.format !== "png" || !sourceMetadata.width || !sourceMetadata.height) throw new Error(`不是有效 PNG：${bucket}/${filename}`);
      const bytes = await sharp(sourceBytes).rotate().png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
      const metadata = await sharp(bytes).metadata();
      const optimizedKey = `${bucket}/optimized/${path.basename(filename, ".png")}.webp`;
      const optimizedBytes = await sharp(bytes).webp({ lossless: true, effort: 4 }).toBuffer();
      const optimizedMetadata = await sharp(optimizedBytes).metadata();
      if (metadata.width !== optimizedMetadata.width || metadata.height !== optimizedMetadata.height) {
        throw new Error(`优化图片尺寸发生变化：${bucket}/${filename}`);
      }
      if (outputRoot) {
        const originalOutput = path.join(outputRoot, bucket, filename);
        const optimizedOutput = path.join(outputRoot, optimizedKey);
        await Promise.all([fs.mkdir(path.dirname(originalOutput), { recursive: true }), fs.mkdir(path.dirname(optimizedOutput), { recursive: true })]);
        await Promise.all([fs.writeFile(originalOutput, bytes), fs.writeFile(optimizedOutput, optimizedBytes)]);
      }
      items.push({
        key: `${bucket}/${filename}`,
        bytes: bytes.length,
        checksum: sha256(bytes),
        mediaType: "image/png",
        width: metadata.width,
        height: metadata.height,
        original: { format: "png", retained: true },
        optimized: { key: optimizedKey, format: "webp", mediaType: "image/webp", lossless: true, width: metadata.width, height: metadata.height, bytes: optimizedBytes.length, checksum: sha256(optimizedBytes) },
      });
    }
  }
  items.sort((a, b) => a.key.localeCompare(b.key, "zh-CN"));
  return { checksum: sha256(JSON.stringify(items)), count: items.length, items };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function searchContextTitle(title, itemTitle) {
  const withoutObjectName = title.replaceAll(itemTitle, "").replace(/\s+/g, "").trim();
  if (/^避免使用.+群体$/.test(title.replace(/\s+/g, "")) || /^应避免服用.+补充剂的群体$/.test(title.replace(/\s+/g, ""))) {
    return "避免使用人群";
  }
  if (withoutObjectName === "的副作用") return "副作用";
  if (withoutObjectName === "与药物的相互作用") return "与药物的相互作用";
  if (withoutObjectName === "补充剂每日服用剂量") return "每日服用剂量";
  if (withoutObjectName === "富含的食物") return "食物来源";
  return title;
}

function searchSegments(markdown, fallbackTitle, itemTitle) {
  const segments = [];
  let contextTitle = fallbackTitle;
  let paragraph = [];
  const flushParagraph = () => {
    const text = plainText(paragraph.join(" "));
    if (text) segments.push({ title: contextTitle, text });
    paragraph = [];
  };

  for (const rawLine of consumerMarkdown(markdown).split("\n")) {
    const line = rawLine.trim();
    const heading = line.match(/^#{2,6}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      contextTitle = searchContextTitle(heading[1].replace(/^\[|\]$/g, ""), itemTitle);
      continue;
    }
    if (!line) {
      flushParagraph();
      continue;
    }
    const listItem = line.match(/^[-*+]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      const text = plainText(listItem[1]);
      if (text) segments.push({ title: contextTitle, text });
      continue;
    }
    if (/^\|?[\s:-]+(?:\|[\s:-]+)+\|?$/.test(line)) continue;
    paragraph.push(line);
  }
  flushParagraph();
  return segments;
}

function renderSearchSections(item) {
  if (!SEARCH_CONTENT_COLLECTIONS.has(item.collection)) return "";
  return SEARCH_CONTENT_SLOT_KEYS.flatMap((slotKey) => {
    const slot = item.slots[slotKey];
    if (!slot) return [];
    const segments = searchSegments(slot.markdown, slot.label, item.title);
    let previousTitle = "";
    let headingIndex = 0;
    const content = segments.map((segment) => {
      const heading = segment.title !== previousTitle
        ? `<h3 id="${slotKey}--${headingIndex++}">${escapeHtml(segment.title)}</h3>\n`
        : "";
      previousTitle = segment.title;
      const evidence = `${segment.title}：${segment.text}`;
      const anchors = searchEvidenceAnchors(evidence);
      return `${heading}<p>${escapeHtml(evidence)}${anchors ? ` ${anchors}` : ""}</p>`;
    }).join("\n");
    const weight = slotKey === "safety" ? ` data-pagefind-weight="0.5"` : "";
    return [`<section${weight}>\n<h2 id="${slotKey}">${escapeHtml(SEARCH_SLOT_LABELS[slotKey])}</h2>\n${content}\n</section>`];
  }).join("\n");
}

function searchEvidenceAnchors(value) {
  return Object.entries(PAGEFIND_EVIDENCE_ANCHORS)
    .filter(([term]) => value.includes(term))
    .map(([, anchor]) => anchor)
    .join(" ");
}

function weightedSearchMetadata(values) {
  const evidence = values.join(" ");
  const anchors = searchEvidenceAnchors(evidence);
  return `${escapeHtml(evidence)}${anchors ? ` ${anchors}` : ""}`;
}

async function writeSearchCorpus(objects, outputRoot) {
  const searchRoot = path.join(outputRoot, "search-corpus");
  await fs.mkdir(searchRoot, { recursive: true });
  // Pagefind follows directory enumeration order on some platforms. Writing in
  // stable object order keeps the generated index byte-for-byte reproducible.
  for (const item of objects.filter((entry) => entry.surface === "primary")) {
    const searchSections = renderSearchSections(item);
    const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(item.title)}</title></head>
<body data-pagefind-body data-pagefind-meta="id:${escapeHtml(item.id)}">
<span data-pagefind-ignore data-pagefind-filter="collection:${escapeHtml(item.collection)}"></span>
<span data-pagefind-ignore data-pagefind-filter="category:${escapeHtml(item.category)}"></span>
<h1 data-pagefind-weight="10">${escapeHtml(item.title)}</h1>
<p data-pagefind-weight="8">${weightedSearchMetadata(item.aliases)}</p>
<p data-pagefind-weight="6">${weightedSearchMetadata(item.searchTerms)}</p>
<p data-pagefind-weight="2">${weightedSearchMetadata(item.relatedQueries)}</p>
${searchSections}
</body></html>\n`;
    await fs.writeFile(path.join(searchRoot, `${item.id.replaceAll("/", "__")}.html`), html);
  }
}

function buildExploreProjection(objects, options = {}) {
  const groups = options.groups ?? EXPLORE_GROUPS;
  const defaultGroup = options.defaultGroup ?? "细胞功能与代谢";
  const defaultTopic = options.defaultTopic ?? "血糖";
  const topicObjects = new Map();
  for (const item of objects.filter((entry) => entry.surface === "primary")) {
    for (const topic of item.topicTags) topicObjects.set(topic, [...(topicObjects.get(topic) ?? []), item.id]);
  }

  const mappedTopics = groups.flatMap((group) => group.topics);
  if (new Set(mappedTopics).size !== mappedTopics.length) throw new Error("探索标签不可重复归入多个分组");
  const missing = [...topicObjects.keys()].filter((topic) => !mappedTopics.includes(topic));
  const empty = mappedTopics.filter((topic) => !topicObjects.has(topic));
  if (missing.length) throw new Error(`探索标签尚未分组：${missing.join("、")}`);
  if (empty.length) throw new Error(`探索分组包含空标签：${empty.join("、")}`);
  const defaultGroupEntry = groups.find((group) => group.name === defaultGroup);
  if (!defaultGroupEntry) throw new Error(`探索默认分组无效：${defaultGroup}`);
  if (!defaultGroupEntry.topics.includes(defaultTopic)) throw new Error(`探索默认标签无效：${defaultTopic}`);

  return {
    defaultGroup,
    defaultTopic,
    groups: groups.map((group) => ({
      name: group.name,
      topics: group.topics.map((name) => {
        const objectIds = topicObjects.get(name) ?? [];
        return { name, count: objectIds.length, objectIds };
      }),
    })),
  };
}

function normalizedSearchTerm(value) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]+/gu, "");
}

function validateAndSummarizeSearchMetadata(objects) {
  const primary = objects.filter((item) => item.surface === "primary");
  const claims = new Map();
  for (const item of primary) {
    const local = new Map();
    for (const [kind, values] of [["alias", item.aliases], ["searchTerm", item.searchTerms], ["relatedQuery", item.relatedQueries]]) {
      for (const value of values) {
        const normalized = normalizedSearchTerm(value);
        if (!normalized) throw new Error(`搜索词不可为空：${item.id}`);
        if (local.has(normalized)) throw new Error(`搜索词重复：${item.id} 的“${value}”与“${local.get(normalized)}”归一化后相同`);
        local.set(normalized, value);
        claims.set(normalized, [...(claims.get(normalized) ?? []), { id: item.id, kind, value }]);
      }
    }
  }
  return {
    termCounts: {
      aliases: primary.reduce((total, item) => total + item.aliases.length, 0),
      searchTerms: primary.reduce((total, item) => total + item.searchTerms.length, 0),
      relatedQueries: primary.reduce((total, item) => total + item.relatedQueries.length, 0),
    },
    termCollisions: [...claims.entries()]
      .filter(([, entries]) => new Set(entries.map((entry) => entry.id)).size > 1)
      .map(([term, entries]) => ({ term, entries })),
  };
}

function expectedCounts(objects) {
  const count = (predicate) => objects.filter(predicate).length;
  return {
    total: objects.length,
    primary: count((item) => item.surface === "primary"),
    foods: count((item) => item.collection === "食物"),
    nutrients: count((item) => item.collection === "营养素"),
    supplements: count((item) => item.collection === "补充剂"),
    nutrientGroups: count((item) => item.collection === "营养素组"),
    guides: count((item) => item.collection === "指南"),
    references: count((item) => item.collection === "参考与验证"),
  };
}

function validateCounts(counts) {
  const expected = { total: 196, primary: 190, foods: 153, nutrients: 26, supplements: 11, nutrientGroups: 1, guides: 2, references: 3 };
  for (const [key, value] of Object.entries(expected)) {
    if (counts[key] !== value) throw new Error(`知识对象数量异常：${key} 应为 ${value}，实际为 ${counts[key]}`);
  }
}

export async function compileKnowledgeRelease({ knowledgeRoot, rawRoot, outputRoot, assetRoot = null, copyAssets = true, generatedAt = new Date().toISOString() }) {
  const rawOrder = await buildRawOrder(rawRoot);
  const assetManifest = await buildAssetManifest(assetRoot, { outputRoot: copyAssets && assetRoot ? path.join(outputRoot, "assets") : null });
  const objects = [];

  for (const [relativeDirectory, collection] of COLLECTIONS) {
    const directory = path.join(knowledgeRoot, relativeDirectory);
    for (const filePath of await markdownFiles(directory, knowledgeRoot)) {
      const relativeFile = path.relative(knowledgeRoot, filePath).replaceAll(path.sep, "/");
      if (relativeDirectory === "references" && relativeFile.startsWith("references/taxonomies/")) continue;
      const slug = path.basename(filePath, ".md");
      const id = `${relativeDirectory}/${slug}`;
      const markdown = (await readRegularFile(directory, filePath, { authorizationRoot: knowledgeRoot })).toString("utf8");
      const { body, metadata } = parseFrontmatter(markdown, relativeFile);
      if (!metadata.type || !metadata.title || !metadata.scope) throw new Error(`缺少必填元数据：${relativeFile}`);
      const surface = surfaceForType(metadata.type);
      const sourceSlots = ["Nutrient", "Supplement Ingredient"].includes(metadata.type) ? buildSlots(body, relativeFile, metadata.title) : {};
      const slots = normalizeConsumerSlots(sourceSlots, metadata.title);
      const food = collection === "食物" ? extractFoodContent(body) : null;
      const slotText = Object.values(slots).map((slot) => `${slot.label} ${slot.text}`).join(" ");
      const foodText = food
        ? `${food.identity?.text ?? ""} ${food.classification?.text ?? ""} ${food.relations.map((relation) => relation.title).join(" ")}`
        : "";
      const searchableText = plainText([
        metadata.title,
        metadata.description,
        metadata.aliases.join(" "),
        metadata.searchTerms.join(" "),
        metadata.relatedQueries.join(" "),
        metadata.tags.join(" "),
        metadata.topicTags.join(" "),
        slotText,
        foodText,
      ].filter(Boolean).join(" "));

      objects.push({
        id,
        slug,
        type: metadata.type,
        collection,
        surface,
        title: metadata.title,
        description: metadata.description,
        aliases: metadata.aliases,
        searchTerms: metadata.searchTerms,
        relatedQueries: metadata.relatedQueries,
        tags: metadata.tags,
        topicTags: metadata.topicTags,
        category: categoryFor(metadata, collection),
        scope: metadata.scope,
        status: metadata.status,
        rawOrder: collection === "营养素" ? rawOrder.get(normalizeName(metadata.title)) ?? 999 : null,
        classification: collection === "食物" ? {
          groupCode: metadata.giftGroupCode,
          group: metadata.giftGroup,
          subgroupCode: metadata.giftSubgroupCode,
          subgroup: metadata.giftSubgroup,
        } : null,
        food,
        verificationMarks: metadata.title === "第三方验证标志" ? extractVerificationMarks(body) : [],
        slots,
        navigation: ["Nutrient", "Supplement Ingredient"].includes(metadata.type)
          ? buildKnowledgeNavigation(metadata.title, collection, slots)
          : [],
        searchableText,
        image: surface === "primary" ? `/api/v1/assets/${collection === "食物" ? "food-images" : "knowledge-images"}/${encodeURIComponent(slug)}.webp` : "",
      });
    }
  }

  objects.sort((a, b) => a.id.localeCompare(b.id, "zh-CN"));
  const objectIds = new Set(objects.map((item) => item.id));
  if (objectIds.size !== objects.length) throw new Error("知识对象标识重复");
  for (const item of objects) {
    const links = [
      ...Object.values(item.slots).flatMap((slot) => knowledgeLinks(slot.markdown)),
      ...(item.food?.relations ?? []),
    ];
    for (const link of links) {
      if (!link.href.startsWith("/")) continue;
      const target = decodeURIComponent(link.href.replace(/^\//, "").replace(/\.md(?:#.*)?$/, ""));
      if (!objectIds.has(target)) throw new Error(`知识链接断开：${item.id} -> ${link.href}`);
    }
  }
  const counts = expectedCounts(objects);
  validateCounts(counts);
  const explore = buildExploreProjection(objects);
  const searchMetadata = validateAndSummarizeSearchMetadata(objects);
  const payload = { schema: COMPILER_SCHEMA, searchEngine: SEARCH_ENGINE_VERSION, searchDocumentSchema: SEARCH_DOCUMENT_SCHEMA, searchQueryExpansions: SEARCH_QUERY_EXPANSIONS, searchMetadata, objects, explore, assetFingerprint: assetManifest.checksum };
  const checksum = sha256(JSON.stringify(payload));
  const compactDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(generatedAt))
    .replaceAll("-", "");
  const version = `${compactDate}-${checksum.slice(0, 12)}`;
  const manifest = {
    version,
    generatedAt,
    checksum,
    counts,
    assets: { strategy: "on-demand", source: "private-minio", count: assetManifest.count, checksum: assetManifest.checksum, items: assetManifest.items },
    schema: COMPILER_SCHEMA,
    search: { engine: "pagefind", engineVersion: SEARCH_ENGINE_VERSION, documentSchema: SEARCH_DOCUMENT_SCHEMA, queryExpansions: SEARCH_QUERY_EXPANSIONS, ...searchMetadata, baseUrl: `/api/v1/search/${version}/`, files: [] },
  };
  const release = { manifest, objects, explore };

  await fs.mkdir(outputRoot, { recursive: true });
  await writeSearchCorpus(objects, outputRoot);
  await Promise.all([
    fs.writeFile(path.join(outputRoot, "release.json"), `${JSON.stringify(release, null, 2)}\n`),
    fs.writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    fs.writeFile(path.join(outputRoot, "report.md"), `# 候选知识版本 ${manifest.version}\n\n- 总对象：${counts.total}\n- 普通详情对象：${counts.primary}\n- 校验和：\`${checksum}\`\n- 内部审核注释只进入构建检查，不进入家庭端正文。\n`),
  ]);

  if (copyAssets) {
    await fs.writeFile(path.join(outputRoot, "assets.json"), `${JSON.stringify({ strategy: "on-demand", ...assetManifest }, null, 2)}\n`);
  }

  return release;
}

export { buildAssetManifest, buildExploreProjection, parseFrontmatter, sectionsAtLevel };
