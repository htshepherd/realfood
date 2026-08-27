import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("账号").fill("admin");
  await page.getByPlaceholder("密码").fill("999999");
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

  await expect(page.getByRole("button").filter({ hasText: "褪黑激素" })).toHaveCount(0);
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

test("探索主题选择器可滚动到最后一个分类", async ({ page }) => {
  await login(page);
  await navigate(page, "探索");
  await page.getByRole("button", { name: "选择探索主题" }).click();
  const dialog = page.getByRole("dialog");
  const options = dialog.locator("[data-category-options]");
  const lastOption = dialog.locator("[data-category-option]").last();
  await expect(lastOption).toBeAttached();
  await lastOption.scrollIntoViewIfNeeded();
  const layout = await options.evaluate((container) => {
    const last = container.querySelector<HTMLElement>("[data-category-option]:last-child");
    const containerRect = container.getBoundingClientRect();
    const lastRect = last?.getBoundingClientRect();
    return {
      scrollable: container.scrollHeight > container.clientHeight,
      lastInsideViewport: Boolean(lastRect && lastRect.bottom <= containerRect.bottom + 1),
    };
  });
  expect(layout).toEqual({ scrollable: true, lastInsideViewport: true });
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
  await exploreTopic.click();
  const exploreDialog = page.getByRole("dialog");
  await expect(exploreDialog.getByText("选择探索主题", { exact: true })).toBeVisible();
  const exploreOptions = exploreDialog.locator("[data-category-options]");
  const lastExploreOption = exploreDialog.locator("[data-category-option]").last();
  await expect(lastExploreOption).toBeAttached();
  await lastExploreOption.scrollIntoViewIfNeeded();
  const categoryLayout = await exploreOptions.evaluate((container) => {
    const last = container.querySelector<HTMLElement>("[data-category-option]:last-child");
    const containerRect = container.getBoundingClientRect();
    const lastRect = last?.getBoundingClientRect();
    return {
      scrollable: container.scrollHeight > container.clientHeight,
      lastInsideViewport: Boolean(lastRect && lastRect.bottom <= containerRect.bottom + 1),
    };
  });
  expect(categoryLayout).toEqual({ scrollable: true, lastInsideViewport: true });
  await exploreDialog.locator("[data-category-option]").nth(1).click();
  await expect(page.locator("section .rounded-full").first()).toBeVisible();
  await navigate(page, "验证标志");
  await expect(page.getByText("美国国家卫生基金会", { exact: true })).toBeVisible();
  const categories = await page.request.get("/api/v1/categories");
  expect(categories.status()).toBe(200);
  const relations = await page.request.get(`/api/v1/relations?foodId=${encodeURIComponent("foods/三文鱼")}`);
  expect((await relations.json()).relations).toHaveLength(18);
  expect((await page.request.get("/api/v1/offline-package")).status()).toBe(200);
});

test("首轮同步后离线仍可打开已缓存知识", async ({ page, context }) => {
  await login(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByPlaceholder("搜索食物、营养或健康问题")).toBeVisible();
  await page.getByPlaceholder("搜索食物、营养或健康问题").fill("L-抗坏血酸");
  await expect(page.getByRole("button").filter({ hasText: "维生素 C" }).first()).toBeVisible();
  await context.setOffline(true);
  // Playwright WebKit reports an internal navigation error when an offline reload is
  // fulfilled by a service worker, so trigger the real browser reload and assert the resulting UI.
  await page.evaluate(() => window.location.reload()).catch(() => undefined);
  await page.waitForTimeout(800);
  await expect(page.getByPlaceholder("搜索食物、营养或健康问题")).toBeVisible();
  await page.getByPlaceholder("搜索食物、营养或健康问题").fill("L-抗坏血酸");
  await expect(page.getByRole("button").filter({ hasText: "维生素 C" }).first()).toBeVisible();
  await page.getByRole("button", { name: "打开菜单" }).click();
  await expect(page.getByRole("button", { name: "营养素", exact: true })).toBeVisible();
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
