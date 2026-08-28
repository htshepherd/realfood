import { expect, test, type Page } from "@playwright/test";

import goldenQueries from "../tests/search-golden-queries.json";

async function login(page: Page, username = "admin", password = "999999") {
  await page.goto("/");
  await page.getByPlaceholder("账号").fill(username);
  await page.getByPlaceholder("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByPlaceholder("搜索食物、营养或健康问题")).toBeVisible({ timeout: 15_000 });
}

async function navigate(page: Page, name: string) {
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.locator("aside").getByRole("button", { name, exact: true }).click();
}

test("未登录时知识接口和页面内容受保护", async ({ page, request }) => {
  const response = await request.get("/api/v1/releases/current");
  expect(response.status()).toBe(401);
  expect((await request.get("/api/v1/search/unknown/pagefind.js")).status()).toBe(401);
  expect((await request.get("/food-images/三文鱼.png")).status()).toBe(404);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "食物与营养指南" })).toBeVisible();
  await expect(page.getByPlaceholder("密码")).toBeVisible();
  await expect(page.getByText("三文鱼")).toHaveCount(0);
});

test("首页搜索使用发布索引并能进入详情", async ({ page }) => {
  await login(page);
  await page.getByPlaceholder("搜索食物、营养或健康问题").fill("L-抗坏血酸");
  await expect(page.getByRole("button").filter({ hasText: "维生素 C" }).first()).toBeVisible();
  await page.getByRole("button").filter({ hasText: "维生素 C" }).first().click();
  await expect(page.getByRole("heading", { name: "维生素 C", exact: true }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: /维生素C的作用和益处/ })).toContainText("6 个主题 · 28 条");
  await expect(page.locator("[data-detail-navigation] > button")).toHaveCount(5);
  await expect(page.getByRole("button", { name: /获取与利用|相关知识/ })).toHaveCount(0);
  await page.getByRole("button", { name: /维生素C的作用和益处/ }).click();
  await expect(page.getByRole("heading", { name: "作用和益处" })).toBeVisible();
  await expect(page.getByText("抗氧化与细胞保护", { exact: true })).toBeVisible();
  await expect(page.getByText(/条$/)).toHaveCount(0);
});

test("首页搜索展示带上下文的高亮原文", async ({ page }) => {
  await login(page);
  const search = page.getByPlaceholder("搜索食物、营养或健康问题");

  await search.fill("高血压");
  const taurine = page.getByRole("button").filter({ hasText: "牛磺酸" }).first();
  await expect(taurine).toBeVisible();
  await expect(taurine.locator("[data-search-context]")).toHaveText("作用与潜在益处");
  await expect(taurine.locator("[data-search-excerpt]")).toContainText("心脏与血管：可自然降低高血压患者的血压");
  await expect(taurine.locator("mark")).toContainText("高血压");

  const melatonin = page.getByRole("button").filter({ hasText: "褪黑激素" }).first();
  await expect(melatonin).toBeVisible();
  await expect(melatonin.locator("[data-search-context]")).toHaveText("风险、禁忌与相互作用");
  const rankedIds = await page.locator("[data-search-result]").evaluateAll((results) => results.map((result) => result.getAttribute("data-search-result")));
  expect(rankedIds.indexOf("nutrients/taurine")).toBeLessThan(rankedIds.indexOf("supplement-ingredients/melatonin"));
  await taurine.click();
  await expect(page.getByRole("heading", { name: "牛磺酸", exact: true }).last()).toBeVisible();
});

test("首页健康问题搜索过滤分词噪声并支持常用人群词", async ({ page }) => {
  await login(page);
  const search = page.getByPlaceholder("搜索食物、营养或健康问题");

  await search.fill("脂肪肝");
  await expect(page.getByRole("button").filter({ hasText: "鱼油" }).first()).toBeVisible();
  await expect(page.getByRole("button").filter({ hasText: "α-硫辛酸" })).toHaveCount(0);

  await search.fill("女人");
  const vitaminB6 = page.getByRole("button").filter({ hasText: "维生素 B6" }).first();
  await expect(vitaminB6).toBeVisible();
  await expect(vitaminB6.locator("mark")).toContainText("女性");

  await search.fill("高");
  await expect(page.getByText("没有找到相关知识")).toBeVisible();
  await search.fill("铁");
  await expect(page.getByRole("button").filter({ hasText: "铁" }).first()).toBeVisible();
  await search.fill("A");
  await expect(page.getByRole("button").filter({ hasText: "维生素 A" }).first()).toBeVisible();
});

test("首页搜索通过版本化黄金查询矩阵", async ({ page }) => {
  await login(page);
  const search = page.getByPlaceholder("搜索食物、营养或健康问题");

  for (const scenario of goldenQueries) {
    await search.fill(scenario.query);
    for (const expected of scenario.expected) {
      const result = page.locator(`[data-search-result="${expected.id}"]`);
      await expect(result, `${scenario.query} 应召回 ${expected.id}`).toBeVisible();
      await expect(result.locator("[data-search-excerpt]")).toContainText(expected.excerpt);
      if (expected.context) await expect(result.locator("[data-search-context]")).toHaveText(expected.context);
      else await expect(result.locator("[data-search-context]")).toHaveCount(0);
    }
    for (const prohibited of scenario.prohibited) {
      await expect(page.locator(`[data-search-result="${prohibited}"]`)).toHaveCount(0);
    }
    if (scenario.ranking) {
      const rankedIds = await page.locator("[data-search-result]").evaluateAll((results) => results.map((result) => result.getAttribute("data-search-result")));
      if (scenario.ranking.length === 1) expect(rankedIds[0], `${scenario.query} 的精确名称或具体形态应排第一`).toBe(scenario.ranking[0]);
      else {
        const positions = scenario.ranking.map((id) => rankedIds.indexOf(id));
        expect(positions.every((position) => position >= 0), `${scenario.query} 的排序对象都应出现`).toBe(true);
        expect(positions, `${scenario.query} 排序应遵循人工词层级`).toEqual([...positions].sort((left, right) => left - right));
      }
    }
  }

  await search.fill("欧米伽3");
  await expect(page.locator('[data-search-result="supplement-ingredients/fish-oil"]')).toBeVisible();
});

test("维生素 D 保留完整的获取与利用内容", async ({ page }) => {
  await login(page);
  await navigate(page, "营养素");
  await page.locator("article").filter({ has: page.getByRole("heading", { name: "维生素 D", exact: true }) }).getByRole("button").click();
  await expect(page.getByText("阳光的其他作用；日晒与补充剂的区别；相关概念", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /获取与利用维生素 D/ })).toBeVisible();
  await page.getByRole("button", { name: /获取与利用维生素 D/ }).click();
  await expect(page.getByRole("heading", { name: "获取与利用维生素 D", exact: true })).toBeVisible();
  for (const title of ["日晒与人群差异", "食物、吸收与形式", "阳光的其他作用", "日晒与补充剂的区别"]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
});

test("维生素 C 的缺乏相关因素不会显示为缺乏症状", async ({ page }) => {
  await login(page);
  await navigate(page, "营养素");
  await page.locator("article").filter({ has: page.getByRole("heading", { name: "维生素 C", exact: true }) }).getByRole("button").click();
  await page.getByRole("button", { name: /维生素 C 缺乏与不足/ }).click();
  await expect(page.getByText("了解可能导致缺乏与不足的相关因素。", { exact: true })).toBeVisible();
  await expect(page.getByText("缺乏体征和症状", { exact: true })).toHaveCount(0);
  for (const title of ["饮食与生活方式", "药物影响", "疾病与恢复阶段"]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
});

test("探索主题按分组联动并保持单行可达", async ({ page }) => {
  await login(page);
  await navigate(page, "探索");
  const expectedGroups = [
    { name: "细胞功能与代谢", topics: ["血糖", "血脂", "能量", "DNA", "抗氧化", "细胞保护", "营养协同", "造血"] },
    { name: "心脑与神经", topics: ["心脏", "血管", "大脑", "神经", "情绪", "睡眠"] },
    { name: "免疫与呼吸", topics: ["免疫", "炎症", "感染", "呼吸道", "过敏"] },
    { name: "消化与脏器", topics: ["消化", "肝脏", "肾脏"] },
    { name: "骨骼与运动", topics: ["骨骼", "牙齿", "肌肉", "关节", "运动", "身体恢复", "疼痛"] },
    { name: "皮肤与感官", topics: ["皮肤", "头发", "眼睛", "伤口"] },
    { name: "生殖与激素", topics: ["生殖", "激素"] },
  ];
  const topicResponse = await page.request.get("/api/v1/topics");
  expect(topicResponse.status()).toBe(200);
  const topicProjection = await topicResponse.json();
  expect({ defaultGroup: topicProjection.defaultGroup, defaultTopic: topicProjection.defaultTopic }).toEqual({ defaultGroup: "细胞功能与代谢", defaultTopic: "血糖" });
  expect(topicProjection.groups.map((group: { name: string; topics: { name: string }[] }) => ({ name: group.name, topics: group.topics.map((topic) => topic.name) }))).toEqual(expectedGroups);
  const picker = page.getByRole("button", { name: "选择探索主题" });
  await expect(picker).toContainText("血糖");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const backgroundScroll = await page.evaluate(() => window.scrollY);
  expect(backgroundScroll).toBeGreaterThan(0);
  await picker.click();
  const dialog = page.getByRole("dialog");
  const backgroundLocked = await page.evaluate(() => document.body.hasAttribute("data-scroll-locked") || getComputedStyle(document.body).overflow === "hidden");
  expect(backgroundLocked).toBe(true);
  const groups = dialog.locator("[data-explore-group]");
  await expect(groups).toHaveCount(7);
  expect(await groups.locator("span").allTextContents()).toEqual(expectedGroups.map((group) => group.name));
  await expect(groups.first()).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.locator("[data-explore-topic]").first()).toContainText("血糖");
  const projectedTopics: string[] = [];
  for (let index = 0; index < expectedGroups.length; index += 1) {
    await groups.nth(index).scrollIntoViewIfNeeded();
    await groups.nth(index).click();
    const topics = dialog.locator("[data-explore-topic]");
    await expect(topics).toHaveCount(expectedGroups[index].topics.length);
    const topicNames = await topics.locator("span:first-child").allTextContents();
    expect(topicNames).toEqual(expectedGroups[index].topics);
    expect((await topics.locator("span:last-child").allTextContents()).every((count) => Number(count) > 0)).toBe(true);
    projectedTopics.push(...topicNames);
    await expect(topics.first()).toHaveAttribute("aria-pressed", "true");
    if (index === 0) {
      const lastTopic = topics.last();
      await lastTopic.scrollIntoViewIfNeeded();
      const rightColumnLayout = await lastTopic.evaluate((last) => {
        const column = last.closest("[data-explore-topics]")!;
        const columnBounds = column.getBoundingClientRect();
        const topicBounds = last.getBoundingClientRect();
        return topicBounds.top >= columnBounds.top && topicBounds.bottom <= columnBounds.bottom;
      });
      expect(rightColumnLayout).toBe(true);
      await expect(lastTopic).toContainText("造血");
    }
  }
  expect(projectedTopics).toHaveLength(35);
  expect(new Set(projectedTopics).size).toBe(35);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-explore-topic]")).toHaveCount(2);
  await expect(dialog.locator("[data-explore-topic]").first()).toHaveAttribute("aria-pressed", "true");
  const groupLayout = await groups.evaluateAll((buttons) => buttons.map((button) => ({
    oneLine: button.scrollHeight === button.clientHeight,
    notClipped: button.scrollWidth <= button.clientWidth,
  })));
  expect(groupLayout.every((entry) => entry.oneLine && entry.notClipped)).toBe(true);
  const dialogLayout = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const left = element.querySelector("[data-explore-groups]")!.getBoundingClientRect();
    const right = element.querySelector("[data-explore-topics]")!.getBoundingClientRect();
    return {
      inside: left.left >= bounds.left && right.right <= bounds.right && left.top >= bounds.top && right.bottom <= bounds.bottom,
      linkedColumns: left.right <= right.left,
    };
  });
  expect(dialogLayout).toEqual({ inside: true, linkedColumns: true });
  const selectedTopicCount = Number(await dialog.locator("[data-explore-topic]").filter({ hasText: "激素" }).locator("span:last-child").textContent());
  await dialog.locator("[data-explore-topic]").filter({ hasText: "激素" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-explore-active-topic]")).toHaveText("激素");
  const relatedCards = page.locator("section .grid-cols-2 > button");
  await expect(relatedCards).toHaveCount(selectedTopicCount);
  const relatedTitle = await relatedCards.first().locator("strong").textContent();
  await relatedCards.first().click();
  await expect(page.getByRole("heading", { name: relatedTitle ?? "", exact: true }).last()).toBeVisible();
});

test("三类列表、单标签探索和账号收藏可操作", async ({ page }) => {
  await login(page);
  await navigate(page, "食物");
  const foodCategory = page.getByRole("button", { name: "选择食物分类" });
  await expect(foodCategory).toContainText("全部食物");
  await foodCategory.click();
  await expect(page.getByRole("dialog").getByText("选择食物分类", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: /鱼、贝类及其制品/ }).click();
  await expect(foodCategory).toContainText("鱼、贝类及其制品");
  await expect(page.getByRole("heading", { name: "三文鱼", exact: true })).toBeVisible();
  await expect(page.getByText("18 种营养成分").first()).toBeVisible();
  const foodRelationCounts = await page.locator("article p").allTextContents();
  const relationNumbers = foodRelationCounts.map((value) => Number.parseInt(value, 10));
  expect(relationNumbers).toEqual([...relationNumbers].sort((a, b) => b - a));
  await expect(page.locator("article").filter({ has: page.getByRole("heading", { name: "三文鱼", exact: true }) }).getByRole("button", { name: /收藏/ })).toHaveCount(0);
  await page.getByRole("button").filter({ has: page.getByRole("heading", { name: "三文鱼", exact: true }) }).click();
  await expect(page.locator("[data-detail-navigation] > button")).toHaveCount(2);
  await expect(page.locator("[data-detail-navigation] > button").nth(0)).toContainText("含有哪些营养成分？");
  await expect(page.locator("[data-detail-navigation] > button").nth(1)).toContainText("食物分类");
  await expect(page.getByRole("button", { name: /食物分类/ })).toContainText("查看大类与细类");
  const foodNutrients = page.getByRole("button", { name: /含有哪些营养成分？/ });
  await expect(foodNutrients).toContainText("查看 18 种相关营养成分");
  await foodNutrients.click();
  await expect(page.getByText("按类型查看与三文鱼相关的营养与补充成分。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "维生素", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "相关补充剂", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "维生素 A", exact: true }).click();
  await expect(page.getByRole("heading", { name: "维生素 A", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();
  await navigate(page, "营养素");
  await expect(page.getByRole("button", { name: "选择营养素分类" })).toContainText("全部营养素");
  await expect(page.getByRole("heading", { name: "维生素 A" })).toBeVisible();
  await expect(page.locator("article").filter({ has: page.getByRole("heading", { name: "维生素 A", exact: true }) }).getByRole("button", { name: /收藏/ })).toHaveCount(0);
  await page.getByRole("button").filter({ has: page.getByRole("heading", { name: "维生素 A", exact: true }) }).click();
  expect(await page.locator("[data-detail-navigation] strong").allTextContents()).toEqual(["维生素A的作用和益处", "哪些食物富含维生素A？", "维生素 A 缺乏与不足", "服用补充剂注意事项", "补充方式与用量"]);
  await page.getByRole("button", { name: /维生素 A 缺乏与不足/ }).click();
  await expect(page.getByRole("heading", { name: "维生素 A 缺乏与不足", exact: true })).toBeVisible();
  await expect(page.locator("[data-detail-tabs]").getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "缺乏体征和症状" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("夜盲症", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "易缺乏人群" }).click();
  await expect(page.getByText("低脂素食者", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: /服用补充剂注意事项/ }).click();
  await expect(page.locator("[data-detail-tabs]").getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "服用过量体征和症状" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".knowledge-markdown--compact").first()).toBeVisible();
  await expect(page.locator("[data-important-safety-sections]").getByRole("heading", { name: "维生素 A 衍生物副作用及风险" })).toBeVisible();
  await page.getByRole("tab", { name: "与药物的相互作用" }).click();
  await expect(page.getByText("华法林", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: /补充方式与用量/ }).click();
  await expect(page.getByRole("heading", { name: "每日参考摄入量", exact: true })).toBeVisible();
  await expect(page.locator("[data-reference-table]")).toBeVisible();
  await expect(page.getByText(/维生素 A 的可耐受上限为每日 3000 微克 RAE/)).toBeVisible();
  await expect(page.getByText(/β-胡萝卜素补充剂与吸烟者患肺癌风险增加/)).toBeVisible();
  await expect(page.getByText(/暂分为两类|原始标题/)).toHaveCount(0);
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByPlaceholder("搜索食物、营养或健康问题").fill("L-抗坏血酸");
  await expect(page.getByRole("heading", { name: "维生素 C", exact: true })).toBeVisible();
  await page.getByPlaceholder("搜索食物、营养或健康问题").fill("");
  await navigate(page, "补充剂");
  await expect(page.getByRole("button", { name: "选择补充剂分类" })).toContainText("全部补充剂");
  await expect(page.getByRole("heading", { name: "鱼油" })).toBeVisible();
  await expect(page.locator("article").filter({ has: page.getByRole("heading", { name: "鱼油", exact: true }) }).getByRole("button", { name: /收藏/ })).toHaveCount(0);
  await page.getByRole("button").filter({ has: page.getByRole("heading", { name: "鱼油", exact: true }) }).click();
  await expect(page.locator("[data-detail-navigation] > button")).toHaveCount(6);
  expect(await page.locator("[data-detail-navigation] strong").allTextContents()).toEqual(["鱼油的作用和益处", "哪些食物可以提供相关脂肪酸？", "鱼油有哪些形式？", "如何选择鱼油？", "服用补充剂注意事项", "补充方式与用量"]);
  await expect(page.getByRole("button", { name: /鱼油有哪些形式/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /如何选择鱼油/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /相关知识/ })).toHaveCount(0);
  await page.getByRole("button", { name: /鱼油有哪些形式/ }).click();
  await expect(page.getByText("甘油三酯（TG）", { exact: true })).toBeVisible();
  await expect(page.getByText("藻油", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: /补充方式与用量/ }).click();
  await expect(page.getByRole("heading", { name: "每日参考摄入量" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "服用建议" })).toBeVisible();
  await expect(page.getByText("14 岁以上男性", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();
  const favoriteButton = page.locator("header").getByRole("button", { name: /收藏/ });
  if (await favoriteButton.getAttribute("aria-label") === "收藏") await favoriteButton.click();
  await page.getByRole("button", { name: "返回" }).click();
  await navigate(page, "收藏");
  await expect(page.getByRole("heading", { name: "鱼油", exact: true })).toBeVisible();
  await navigate(page, "探索");
  const exploreTopic = page.getByRole("button", { name: "选择探索主题" });
  await expect(exploreTopic).toBeVisible();
  await expect(exploreTopic).toContainText("血糖");
  await exploreTopic.click();
  const exploreDialog = page.getByRole("dialog");
  await expect(exploreDialog.getByText("选择探索主题", { exact: true })).toBeVisible();
  await exploreDialog.getByRole("button", { name: /免疫与呼吸/ }).click();
  await exploreDialog.getByRole("button", { name: /过敏/ }).click();
  await expect(page.locator("[data-explore-active-topic]")).toHaveText("过敏");
  await navigate(page, "验证标志");
  await expect(page.getByText("美国国家卫生基金会", { exact: true })).toBeVisible();
  const categories = await page.request.get("/api/v1/categories");
  expect(categories.status()).toBe(200);
  const relations = await page.request.get(`/api/v1/relations?foodId=${encodeURIComponent("foods/三文鱼")}`);
  expect((await relations.json()).relations).toHaveLength(18);
  expect((await page.request.get("/api/v1/offline-package")).status()).toBe(200);
});

test("首轮同步后离线仍可打开已缓存知识", async ({ page, context }) => {
  const searchSnapshot = () => page.locator("[data-search-result]").evaluateAll((results) => results.map((result) => ({
    id: result.getAttribute("data-search-result"),
    context: result.querySelector("[data-search-context]")?.textContent ?? null,
    excerpt: result.querySelector("[data-search-excerpt]")?.textContent ?? "",
  })));
  const exploreSnapshot = async () => {
    await navigate(page, "探索");
    const activeTopic = await page.locator("[data-explore-active-topic]").textContent();
    await page.getByRole("button", { name: "选择探索主题" }).click();
    const dialog = page.getByRole("dialog");
    const groups = dialog.locator("[data-explore-group]");
    const groupNames = await groups.locator("span").allTextContents();
    const topics: string[][] = [];
    for (let index = 0; index < await groups.count(); index += 1) {
      await groups.nth(index).click();
      topics.push(await dialog.locator("[data-explore-topic] span:first-child").allTextContents());
    }
    await page.keyboard.press("Escape");
    return { activeTopic, groupNames, topics };
  };
  await login(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByPlaceholder("搜索食物、营养或健康问题")).toBeVisible();
  await page.getByPlaceholder("搜索食物、营养或健康问题").fill("L-抗坏血酸");
  await expect(page.getByRole("button").filter({ hasText: "维生素 C" }).first()).toBeVisible();
  const onlineExplore = await exploreSnapshot();
  expect(onlineExplore.activeTopic).toBe("血糖");
  await navigate(page, "首页");
  await page.getByPlaceholder("搜索食物、营养或健康问题").fill("ALA");
  await expect(page.locator('[data-search-result="supplement-ingredients/fish-oil"]')).toBeVisible();
  const onlineResults = await searchSnapshot();
  await context.setOffline(true);
  // Playwright WebKit reports an internal navigation error when an offline reload is
  // fulfilled by a service worker, so trigger the real browser reload and assert the resulting UI.
  await page.evaluate(() => window.location.reload()).catch(() => undefined);
  await page.waitForTimeout(800);
  await expect(page.getByPlaceholder("搜索食物、营养或健康问题")).toBeVisible();
  await page.getByPlaceholder("搜索食物、营养或健康问题").fill("ALA");
  await expect(page.locator('[data-search-result="supplement-ingredients/fish-oil"]')).toBeVisible();
  expect(await searchSnapshot()).toEqual(onlineResults);
  expect(await exploreSnapshot()).toEqual(onlineExplore);
});

test("退出会清除本机私有数据", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "退出并清除本机数据" }).click();
  await expect(page.getByPlaceholder("密码")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const cachedRequests = (await Promise.all(cacheNames.map(async (name) => (await caches.open(name)).keys()))).flat().map((request) => new URL(request.url).pathname);
    return { privateEntries: cachedRequests.filter((path) => path.startsWith("/api/v1/")).length, databases: (await indexedDB.databases()).filter((database) => database.name === "ihealth-private-v1").length };
  })).toEqual({ privateEntries: 0, databases: 0 });
});

test("任一标签页退出会立即清除所有标签页的私有界面和存储", async ({ page, context }) => {
  await login(page);
  const sibling = await context.newPage();
  await sibling.goto("/");
  await expect(sibling.getByPlaceholder("搜索食物、营养或健康问题")).toBeVisible();
  await navigate(sibling, "营养素");
  await sibling.locator("article").first().getByRole("button").click();
  await expect(sibling.getByRole("button", { name: "返回" })).toBeVisible();

  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "退出并清除本机数据" }).click();

  await expect(page.getByPlaceholder("密码")).toBeVisible();
  await expect(sibling.getByPlaceholder("密码")).toBeVisible();
  await expect(sibling.getByRole("button", { name: "返回" })).toHaveCount(0);
  for (const current of [page, sibling]) {
    await expect.poll(() => current.evaluate(async () => ({
      databases: (await indexedDB.databases()).filter((database) => database.name === "ihealth-private-v1").length,
      privateCaches: (await caches.keys()).filter((name) => name.includes("ihealth") || name.includes("pagefind")).length,
    }))).toEqual({ databases: 0, privateCaches: 0 });
  }
});

test("账户 A 的陈旧离线队列不会重放到账户 B", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "退出并清除本机数据" }).click();
  await login(page, "family", "888888");
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ihealth-private-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("private-data", "readwrite");
      transaction.objectStore("private-data").put([{
        accountId: "00000000-0000-0000-0000-000000000001",
        objectId: "nutrients/vitamin-c",
        favorite: true,
        updatedAt: new Date().toISOString(),
      }], "account:00000000-0000-0000-0000-000000000002:favorite-queue");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();
  await expect(page.getByPlaceholder("搜索食物、营养或健康问题")).toBeVisible();
  const favorites = await (await page.request.get("/api/v1/favorites")).json();
  expect(favorites.items.some((item: { objectId: string; deleted: boolean }) => item.objectId === "nutrients/vitamin-c" && !item.deleted)).toBe(false);
});

test("退出代际会丢弃仍在途的收藏写入", async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    const target = window as typeof window & { favoriteWriteStarted?: boolean; releaseFavoriteWrite?: () => void };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).includes("/api/v1/favorites") && init?.method === "PUT") {
        target.favoriteWriteStarted = true;
        return new Promise((resolve, reject) => { target.releaseFavoriteWrite = () => { void originalFetch(input, init).then(resolve, reject); }; });
      }
      return originalFetch(input, init);
    };
  });
  await navigate(page, "营养素");
  await page.locator("article").first().getByRole("button").click();
  await page.locator("header").getByRole("button", { name: /收藏/ }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { favoriteWriteStarted?: boolean }).favoriteWriteStarted)).toBe(true);
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "退出并清除本机数据" }).click();
  await page.evaluate(() => (window as typeof window & { releaseFavoriteWrite?: () => void }).releaseFavoriteWrite?.());
  await expect(page.getByPlaceholder("密码")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).filter((database) => database.name === "ihealth-private-v1").length)).toBe(0);
});
