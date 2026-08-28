# 症状／问题探索式搜索调研

调研日期：2026-08-27
范围：在不修改 `knowledge/*.md`、不引入向量数据库的前提下，评估“用户搜索症状或日常问题 → 按知识对象展示命中栏目与原文”的实现方式。本文只提出方案，不修改产品代码。

> 2026-08-27 实施说明：产品范围随后明确为首页只检索营养素／补充剂的“机制、作用与潜在益处”和“缺乏体征和症状”两个章节。当前最小版本因此采用收窄后的 Pagefind 语料投影，并加入少量查询词归一化与完整短语校验；本文提出的 evidence sidecar 保留为未来需要更强关系审核和策展排序时的升级方向。

## 结论

建议采用**混合检索**：知识生成器产出“经审核的 concern／symptom 词表 + 逐条 `search-evidence`”，已识别的症状／问题直接查询这份小型结构化索引；Pagefind 继续负责对象名称、知识原文等普通全文搜索，并作为未识别问题的兜底。前端依据 evidence 标注栏目、区分关系方向、去重和排序。

不建议直接把搜索结果写成“疲劳可能涉及铁、维生素 B12、镁”。当前资料只能证明这些对象的某个栏目**提到了**“疲劳”，不能由一次文本命中推出缺乏、病因、诊断或补充建议。项目架构本身也明确写过：跨营养素重复的症状“不能据此反推缺乏”，并推荐使用“资料列出的体征包括……”而不是“症状证明缺乏”的表达。[知识架构](knowledge-architecture.md#23-已发现的数据问题)、[知识链接设计](knowledge-architecture.md#8-知识链接设计)

推荐的界面文案是：

```text
疲劳相关内容
以下条目在原资料中提到“疲劳”，不代表可以据此判断营养缺乏。

铁
缺乏与不足 · 铁缺乏症体征和症状
疲劳

维生素 B12
缺乏与不足 · 维生素 B12 缺乏体征和症状
疲劳、虚弱和精疲力竭

镁
作用和益处 · 肌肉、运动与细胞能量
能将疲劳感减轻一半
```

如果必须保留“可能涉及”，至少要紧邻显示“按知识库文字关联，不是诊断或补充建议”，并把“缺乏”“作用”“副作用／过量”“注意事项”分组，不能混成一条无方向的关系。

## 目标应拆成三层

这个交互表面上只是搜索结果换一种布局，实际上包含三种不同能力：

1. **召回**：找到正文中出现“疲劳”的铁、维生素 B12、镁等对象。
2. **上下文**：知道命中来自“缺乏与不足”“作用和益处”还是“服用注意事项”，并保留相应原文。
3. **解释与排序**：决定哪些结果靠前，以及“睡眠差 → 睡眠质量／失眠”“抽筋 → 肌肉痉挛”是否算同一个搜索意图。

Pagefind 原生适合第 1 层，也能在索引结构正确时提供第 2 层的基础数据；第 3 层属于产品领域规则，不能交给普通全文相关性分数隐式决定。

## 当前项目已有的基础

- 项目已经锁定 `pagefind@1.5.2`，发布索引是中文、190 个 primary page；当前架构也规定 V1 使用 Pagefind，不加入向量存储或语义排序。[ADR 0002](adr/0002-pagefind-is-the-v1-search-engine.md)、[V1 规格](../.scratch/ihealth-v1/spec.md#implementation-decisions)
- 生成器按“一知识对象一 HTML 页面”建立语料，并在页级 metadata 中写入对象 `id`；因此 Pagefind 的一个 page result 天然可以对应一个食物、营养素或补充剂对象，不需要额外按对象 `groupBy`。[生成器](../prototype-mobile/scripts/knowledge-compiler.mjs#L590)
- 当前生成器已经把正文拆成“内容槽位 → 小标题 → 段落／列表项”，并生成“小标题：原文”的可检索句子。这一设计足以稳定产生“避免使用人群：患有高血压的人”一类摘要。[分段代码](../prototype-mobile/scripts/knowledge-compiler.mjs#L529)、[搜索语料](../prototype-mobile/scripts/knowledge-compiler.mjs#L577)
- 当前客户端已经读取 Pagefind 的 `excerpt`、`sub_results` 和 `weighted_locations`，并显示高亮摘要。[搜索客户端](../prototype-mobile/components/handbook-app.tsx#L120)

但当前实现还有三个边界：

1. **栏目标题没有 `id`。** Pagefind 1.5.2 只把带 `id` 的 `h1`–`h6` 作为可定位的 sub-result 分段。当前生成的 `h2/h3` 没有 `id`，实测发布索引的 `anchors` 为空，每页只有根 sub-result；客户端所谓“最强栏目”实际上仍是整页片段。Pagefind 官方说明见 [Sub-results](https://pagefind.app/docs/sub-results/)。
2. **`sort: { weight: "desc" }` 没有对应排序字段。** `data-pagefind-weight` 是相关性权重，不是自定义 sort。当前语料没有 `data-pagefind-sort="weight..."`，加不加这一 sort 的实测顺序一致。Pagefind 的 sort 会取代默认相关性排序，并非在相关性上加分；应移除无效 sort，或建立真正的页级 sort 字段。[Weighting](https://pagefind.app/docs/weighting/)、[Sorts](https://pagefind.app/docs/sorts/)、[客户端调用](../prototype-mobile/components/handbook-app.tsx#L129)
3. **重复的 filter 属性丢失了分类。** 当前 `<body>` 写了两个同名 `data-pagefind-filter` 属性，实际索引的 `filters()` 只有 `collection`，没有 `category`。应改成一次声明捕获两个不同的源属性。Pagefind 的 filter 是页级能力，不能为每一个 sub-result 保存不同的关系类别。[Filtering](https://pagefind.app/docs/filtering/)、[当前 HTML](../prototype-mobile/scripts/knowledge-compiler.mjs#L603)

这三个问题应作为任何探索式搜索之前的索引正确性修复，但单独修复它们仍不能稳定实现目标排序。

## 对示例查询的本地实测

使用当前已发布版本 `20260827-9402e14bacd7`、Pagefind 1.5.2 和实际 190 页索引进行只读查询，得到：

| 查询 | 返回对象数 | 当前前四项 |
| --- | ---: | --- |
| 高血压 | 9 | 牛磺酸、肌醇、胆碱、碘 |
| 湿疹 | 4 | 锌、黑籽油、槲皮素、维生素 D |
| 黑眼圈 | 1 | 铁 |
| 鼻炎疲劳 | 1 | 槲皮素 |
| 疲劳 | 24 | 钠、辅酶 Q10、维生素 B1、肌酸 |
| 睡眠差 | 15 | 肌醇、镁、褪黑激素、甘氨酸 |
| 抽筋 | 1 | 牛磺酸 |
| 脱发 | 7 | 硒、维生素 B7、维生素 B2、锌 |
| 皮肤问题 | 26 | 维生素 B5、维生素 K、维生素 B2、黑籽油 |
| 伤口恢复慢 | 15 | 维生素 B5、锰、黑籽油、硼 |
| 注意力下降 | 35 | 维生素 B5、硼、维生素 B3、NAC |
| 反复感染 | 1 | 碘 |

这些结果说明：

- 全文召回已经能覆盖不少自然语言问题，但 Pagefind 的页级相关性不会自然得到“铁、维生素 B12、镁”这一业务顺序。
- 短语中的泛词会制造大量结果，例如“问题”“下降”“恢复”；目前最靠前的片段不一定真的表达用户想找的症状关系。
- “鼻炎疲劳”会被当作同一查询，当前只返回正文不同位置分别命中两词的槲皮素；用户却可能是在一次输入中列了“鼻炎、疲劳”两个问题。产品必须决定是按组合条件搜索，还是拆成两个意图分别展示。
- 当前资料存在明确但不同词形的关联：例如“抽筋”还可能写作“肌肉痉挛”，“伤口恢复慢”写作“伤口愈合缓慢”，“注意力下降”写作“注意力不集中”。普通全文检索不会可靠理解它们等价。
- 片段级诊断还观察到“黑眼圈”吸附“褪黑激素／黑白胶片”字串、“注意力下降”大量吸附“注意事项”、“伤口恢复慢”把分散的“伤口”和“恢复”拼成弱相关结果。即使对象级结果偶尔看起来合理，不能据此假设命中片段语义正确。

对当前 37 个营养素／补充剂对象做生成契约盘点，共有 467 个内容组、2,290 条 Markdown bullet；bullet 原文约 29,007 个 Unicode 字符，中文 UTF-8 约 87 KB。即使加上对象、栏目、类型等 JSON 字段，结构化 evidence 的规模也很小，适合随知识版本离线同步，无需为这一数据量引入数据库或向量服务。

## 三种方案比较

| 方案 | 做法 | 优点 | 局限 | 判断 |
| --- | --- | --- | --- | --- |
| 纯 Pagefind | 保持一对象一页；给栏目标题加稳定 `id`；使用 `sub_results.title/excerpt` | 改动最小；离线；高亮和摘要原生可用；点击对象简单 | 只有字面召回；页级排序不知道栏目语义；不能稳定处理同义表达、结果方向和业务顺序 | 可做基础版，不足以支撑“可能涉及” |
| 生成期症状关系索引 | 把每个句子／列表项生成为独立 Pagefind 文档，写入对象、栏目、关系类型 metadata，前端按对象聚合 | 片段级筛选和排序最强；可精确区分缺乏、作用、风险 | 索引文档由 190 页膨胀为大量 evidence 页；前端需去重；仍不能自动获得可信同义关系；容易把“提及”误命名为医学关系 | 适合以后有已审核 Symptom Concept 时使用 |
| 混合检索 | 已识别 concern 查询审核词表和逐条 `search-evidence`；Pagefind 负责普通全文与兜底 | 不破坏普通搜索与 190 页 Pagefind 契约；症状方向、上下文和排序可解释；仍然离线；无需向量库 | 需要一份生成契约和受控词表；要明确“探索关系索引”与全文引擎的边界 | **推荐** |

### 为什么不推荐向量检索

当前问题不是“完全找不到语义相近文档”，而是必须区分“缺乏症状”“可能益处”“过量副作用”“禁忌人群”等方向。向量相似度会扩大召回，却不会自动给出可靠的医学关系类型；而且它违反当前 V1 明确的“Pagefind only、无向量存储”决定。[ADR 0002](adr/0002-pagefind-is-the-v1-search-engine.md)

## 推荐架构

推荐查询流：

```text
输入
  → concern 词表识别／最长短语切分
      → 已识别：在 search-evidence 中做精确／审核扩展匹配
          → 按 relationType 分区、对象去重、稳定排序
      → 未识别：回退到现有 Pagefind 全文结果
```

Pagefind 不作为已识别症状结果的唯一候选门槛，否则“抽筋”仍可能漏掉只写“肌肉痉挛”的对象，泛词造成的弱相关对象也会先污染候选集。

### 1. 保持现有对象级 Pagefind 索引

继续一对象一页，定位为普通全文搜索和兜底，并做正确性增强：

- 为每个 `h2/h3` 生成稳定、页内唯一的 `id`，例如 `effects--muscle-energy`、`deficiency--signs`。
- 保留 `h2/h3 + 小标题：原文`，使 Pagefind 的 `sub_results` 能返回栏目标题、锚点和高亮片段。
- 移除无效的 `sort.weight`，保留 Pagefind 默认相关性；名称、别名等仍通过 `data-pagefind-weight` 加权。
- 修正 filter 的 HTML 结构。
- 客户端保留 Pagefind `result.score`，不要在调用 `data()` 后只留下 `id` 和 excerpt。Pagefind 的 `result.data()` 可返回 `excerpt`、`plain_excerpt`、`meta` 和 `sub_results`；`excerpt` 自带 `<mark>`。[Search API](https://pagefind.app/docs/api/)、[Search config](https://pagefind.app/docs/search-config/)

### 2. 生成逐条搜索证据，而不是生成医学关系

生成器可以从已编译的 slots 派生一个只读、版本化、带校验和的 `search-evidence.json`：

```json
{
  "evidenceId": "nutrients/iron#deficiency-0-3",
  "objectId": "nutrients/iron",
  "objectTitle": "铁",
  "collection": "营养素",
  "slotKey": "deficiency",
  "slotLabel": "缺乏与不足",
  "groupTitle": "铁缺乏症体征和症状",
  "text": "疲劳",
  "searchText": "缺乏与不足 铁缺乏症体征和症状 疲劳",
  "relationType": "deficiency-sign",
  "sourceOrder": 3
}
```

关键约束：

- `text` 必须逐字来自编译后的正文；生成器不改写、不总结、不补充医学事实。
- `relationType` 只是栏目来源的确定性分类，例如 `deficiency-sign`、`effect-mention`、`safety-adverse-effect`、`dosage-mention`、`other`，不能命名为 `cause` 或 `treatment`。
- 每条 evidence 必须能回溯到对象、slot、group 和源顺序；构建测试验证它的原文确实存在于对应 slot。
- 这是搜索索引投影，不是新的编辑内容源。它必须随不可变知识版本构建、校验、离线同步，不能在前端临时解析 Markdown。项目已经规定 JSON 和搜索索引都由 `knowledge/*.md` 自动生成且不能直接编辑。[ADR 0001](adr/0001-knowledge-markdown-is-the-content-source.md)、[版本化接口](adr/0005-knowledge-is-read-through-a-versioned-interface.md)

建议把 evidence 作为独立、按需加载的发布文件，而不是继续膨胀主 `release.json`。manifest 新增文件长度和 SHA-256，沿用现有 Pagefind 文件的下载校验与原子激活方式。

### 3. 查询标准化必须是显式、可审核的检索规则

建议只做有限的短语级改写，不做开放式 AI 扩词。词表中的每个 concern 直接连接到允许匹配的 evidence 表达，例如：

```json
{
  "睡眠差": ["睡眠质量", "睡眠模式紊乱", "入睡困难", "失眠"],
  "抽筋": ["抽筋", "肌肉痉挛", "痉挛"],
  "伤口恢复慢": ["伤口恢复慢", "伤口愈合缓慢"],
  "注意力下降": ["注意力下降", "注意力不集中", "难以集中注意力"],
  "反复感染": ["反复感染", "频繁感染", "容易感染"]
}
```

已识别 concern 用这些词在 `search-evidence.searchText` 中做确定性匹配，然后按对象合并；不要把扩展词拼成一个长 Pagefind 查询。只有 concern 未被识别时才回退 Pagefind 普通全文搜索。实现时也可以让 Pagefind 为 evidence 提供附加相关性分数，但它不能决定关系类型或候选资格。

这份表看似只是搜索配置，实际会改变健康内容的召回范围，因此必须版本化、有人审核、加入黄金查询测试。若它放在 `knowledge/` 之外，只能定义为“检索行为配置”，界面也只能说“相关内容”；如果要把它表述为正式症状关系，长期应按知识架构建立经过审核的 `Symptom Concept`，那将需要修改知识内容，不属于本轮范围。[知识架构的 Symptom 设计](knowledge-architecture.md#51-核心类型)

当前 V1 文档把 Pagefind 写成“only search engine”。如果 concern evidence 在客户端独立匹配，应补一条 ADR，澄清“Pagefind 是唯一全文引擎，版本化 evidence 是探索关系投影而非第二个内容源”；如果不接受这一边界调整，则可以把每条 evidence 建成独立 Pagefind 文档，但仍需前端按 `objectId/relationType` 聚合，质量与安全规则并不会消失。

对于“鼻炎疲劳”这类输入，应先用已登记的最长短语做分词：若能识别出两个完整意图，展示“鼻炎相关内容”和“疲劳相关内容”两个区块；如果不能确定，不要静默猜测，可回退为原始全文搜索。

### 4. 先按关系方向分组，再在组内排序

把所有命中揉成一个“可能涉及”列表会混淆方向。推荐按以下顺序展示：

1. **缺乏与不足中提到**：命中 `deficiency-sign` 的原文。
2. **作用和益处中提到**：命中 `effect-mention` 的原文。
3. **注意事项或过量中提到**：命中 `safety-adverse-effect` 等原文，单独标示，不能排进“可能缺乏”。
4. 其他栏目只在仍有空间时展示。

组内建议采用确定性评分：

```text
evidenceScore =
  精确连续短语命中             + 100
  审核过的短语扩展命中          + 70
  正文命中而非仅标题／标签命中   + 20
  Pagefind 相关性归一化          + 0..10
  仅 generic topic_tag 命中      - 20
```

栏目类型不应只作为一个隐蔽加减分，而应成为可见分组。每个对象默认只保留得分最高的一条 evidence，最多展示 6–8 个对象；同分时使用固定的源顺序和对象标题，保证同一知识版本离线／在线顺序一致。

若产品必须让“疲劳”固定返回“铁、维生素 B12、镁”前三项，就需要额外的人工策展顺序或经过审核的关系权重。当前原文和 Pagefind 分数本身不足以证明这三项应胜过其他 21 个含“疲劳”的对象，生成器不应该悄悄编造该优先级。

### 5. 结果数据模型

建议客户端最终消费：

```ts
type ExplorationHit = {
  objectId: string;
  objectTitle: string;
  collection: "营养素" | "补充剂";
  pagefindScore: number;
  matchedQuery: string;
  matchType: "exact" | "reviewed-expansion";
  relationType: "deficiency-sign" | "effect-mention" | "safety-adverse-effect" | "other";
  slotKey: string;
  slotLabel: string;
  groupTitle: string;
  excerptHtml: string;
  sourceText: string;
};
```

点击仍进入对应知识对象详情。更好的后续体验是同时携带 `slotKey` 和稳定 heading anchor，直接打开命中栏目，但不能让生成的搜索 HTML URL 成为产品详情 URL。

## 健康信息风险

1. **反向推断。** “铁缺乏症状中写了疲劳”不等于“疲劳说明缺铁”。界面必须说“栏目中提到”，不能说“你可能缺乏”。
2. **方向混淆。** 同一个词可能出现在益处、缺乏、过量、副作用、禁忌或疾病案例中。例如安全栏目里的“疲劳”不能作为推荐该补充剂的证据。
3. **泛症状过召回。** 疲劳、皮肤、注意力、感染都很常见。结果多并不表示关系强；必须限量、分组并提供原文。
4. **同义扩展引入新意义。** “皮肤问题”不能无条件等同所有皮肤疾病，“鼻炎”也不能默认等同全部过敏。扩展表应逐条审核。
5. **来源成熟度。** 当前架构记录指出，原资料缺少逐条医学文献和证据等级，已有核对不能直接解释为每条医学主张已审核。[知识架构](knowledge-architecture.md#23-已发现的数据问题)
6. **隐私。** 保持 Pagefind 与 evidence 在端内检索，不记录搜索历史，也不要为了语义扩展把用户症状上传外部服务；这与现有离线优先和不保存健康资料的 V1 边界一致。[V1 规格](../.scratch/ihealth-v1/spec.md#implementation-decisions)

## 验证方案

### 生成契约测试

- 每条 evidence 的 `objectId/slotKey/groupTitle` 都存在。
- `sourceText` 是对应编译 slot 中的原文，生成器没有改写。
- stable heading `id` 页内唯一且多次构建一致。
- manifest 包含 evidence 文件长度和校验和；坏文件不能激活新版本。
- `knowledge/*.md` 未发生变更，生成产物不可手工编辑。

### 黄金查询集

把用户列出的查询作为第一批回归集：高血压、湿疹、黑眼圈、鼻炎、疲劳、睡眠差、抽筋、脱发、皮肤问题、伤口恢复慢、注意力下降、反复感染。每条至少验证：

- 应包含的对象与 evidence 原文；
- 不应把安全／过量命中展示成缺乏或益处；
- 同义表达使用了哪条审核扩展规则；
- 多意图输入是否正确拆分；
- 首页摘要与进入详情后的栏目文字一致。

建议质量门槛：evidence 回溯正确率 100%；方向误标为 0；黄金集 `precision@5` 与 `recall@8` 由内容负责人确认；同一发布版本在在线和离线模式顺序一致。

### 索引与 UI 测试

- 构建真实 Pagefind 索引，断言“疲劳”可返回带 `#deficiency...` 或 `#effects...` 的 sub-result，而不是只有根页面结果。
- 断言 `<mark>` 高亮来自 Pagefind，栏目标签来自 evidence／稳定 anchor，不从摘要字符串猜测。
- WebKit iPhone 场景覆盖输入、两行摘要、关系分组、无结果、离线、点击详情和返回。
- 记录索引体积、evidence 文件体积、首次查询耗时和查询扩展后的总请求次数，避免移动端离线包无控制增长。

## 建议实施顺序

1. **修正普通全文索引**：heading `id`、filter 声明、无效 sort，并加入真实索引测试。
2. **产出 evidence sidecar**：只抽取原文和栏目来源，不做同义扩展或医学推断。
3. **加入小规模审核词表与 concern router**：先覆盖上述 12 个黄金查询；版本化并纳入发布 checksum。
4. **改首页结果模型**：已识别 concern 显示“对象 + 栏目 + 原文”并按 relation type 分组；其他输入沿用 Pagefind。
5. **人工验收后发布**：知识版本仍通过显式确认切换，遵守现有发布 ADR。[ADR 0008](adr/0008-knowledge-releases-require-human-confirmation.md)
6. **用真实查询评估**：只有字面／规则召回长期不足时，再讨论经过审核的 Symptom Concepts；不直接跳到向量检索。

## 最小可行版本与完整版本

若希望先快速看效果，最小可行版本可以只做：稳定 heading `id`、移除无效 sort、使用 `sub_result.title + excerpt`、文案改为“相关内容”。它能实现“铁：缺乏与不足中提到……”的形态，但不能承诺示例中的对象和顺序，也不建议直接对用户发布为症状探索。

若希望这个功能可以真正供用户按症状探索，建议一次完成 evidence sidecar、关系方向分组、12 条黄金查询和有限审核词表。它仍然使用 Pagefind、仍可离线、也不修改 `knowledge/*.md`，但比单纯调 Pagefind 权重更可解释、更安全。

## 一手来源

- [Pagefind 1.5.2 Search API](https://pagefind.app/docs/api/)
- [Pagefind Search config 与 excerpt](https://pagefind.app/docs/search-config/)
- [Pagefind Sub-results](https://pagefind.app/docs/sub-results/)
- [Pagefind Weighting](https://pagefind.app/docs/weighting/)
- [Pagefind Metadata](https://pagefind.app/docs/metadata/)
- [Pagefind Filters](https://pagefind.app/docs/filtering/)
- [Pagefind Sorts](https://pagefind.app/docs/sorts/)
- [Pagefind v1.5.2 类型定义](https://raw.githubusercontent.com/Pagefind/pagefind/v1.5.2/pagefind_web_js/types/index.d.ts)
- [本项目知识生成器](../prototype-mobile/scripts/knowledge-compiler.mjs)
- [本项目搜索客户端](../prototype-mobile/components/handbook-app.tsx)
- [本项目知识架构](knowledge-architecture.md)
- [ADR 0001：knowledge Markdown 是唯一产品内容源](adr/0001-knowledge-markdown-is-the-content-source.md)
- [ADR 0002：V1 使用 Pagefind](adr/0002-pagefind-is-the-v1-search-engine.md)
- [ADR 0005：版本化知识接口](adr/0005-knowledge-is-read-through-a-versioned-interface.md)
- [ADR 0008：人工确认发布](adr/0008-knowledge-releases-require-human-confirmation.md)
