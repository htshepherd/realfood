# 探索主题分组与聚焦搜索语料

**Status:** ready-for-agent

## Problem Statement

探索页面直接把 35 个探索标签铺在同一个筛选器中。用户缺少先按人体功能范围缩小选择、再选择具体探索标签的路径；在 iPhone 上，长列表需要连续滚动，标签之间的关系也不容易理解。当前默认标签取决于知识对象和标签的遍历顺序，不是稳定的产品决定。

全文搜索虽然已经使用 Pagefind 和中文分词，但搜索正文只投影“作用与潜在益处”和“缺乏与不足”。因此，像“口臭”这种只出现在注意事项中的明确风险表现不会被召回。另一方面，37 个营养素和补充剂成分只有 122 个 `search_terms`，分布不均，部分常见形态只存在于概览或补充剂形态槽位，无法进入聚焦搜索语料；现有词表还把等价名称、形态、疾病、宽泛主题和搭配成分放在同一个高权重层，可能造成漏检、歧义和排序偏差。

用户需要一个更容易理解的探索筛选器，以及一个范围明确、能区分益处、缺乏和风险上下文的确定性搜索。两项改造都必须继续来自知识版本，支持离线使用，并且不引入语义搜索、搜索日志或新的健康结论。

## Solution

改造现有探索主题筛选器为左右两列的联动选择器：左侧选择简洁、单行显示的主题分组，右侧只显示该分组下的探索标签。进入探索页面时稳定选择“细胞功能与代谢”分组和“血糖”标签；“血糖”在该分组内排第一。选择其他分组后，右侧列表立即联动，并默认选中该分组的第一个标签；用户选择右侧标签后提交选择并返回探索关系视图。

35 个探索标签继续来自知识对象的 `topic_tags`。分组只是面向探索导航的产品分类，不声称是正式医学专科分类。编译端维护并校验有序分组映射，将分组、顺序、默认值、数量和对象关系投影进知识版本与主题接口；移动端不维护另一份硬编码标签表。

将营养素和补充剂成分的可搜索正文明确限定为三个内容槽位：作用与潜在益处、缺乏与不足、相互作用与注意事项。注意事项属于次级风险语料，权重低于作用与缺乏，并在搜索结果中显示明确的风险上下文标签。食物仍只通过名称、别名和人工搜索词参与搜索，不把营养关系正文扩展为搜索语料。

整理人工检索元数据：等价名称留在 `aliases`；具体形态和名称邻近词保留高权重；宽泛主题、相关疾病、药物类别或搭配成分进入较低权重的关联查询层；拼写、简称和用户口语表达由全局查询变体处理。第一批补齐 20 个知识包已经包含、但位于排除槽位中的高价值名称或形态，并修正 `ALA` 的歧义。第二批专业形态进入覆盖矩阵，经过黄金查询验收后再决定是否作为人工词发布。

## User Stories

1. As a family member, I want to choose an exploration group before choosing a topic, so that I do not have to scan all 35 topics at once.
2. As a family member, I want groups on the left and topics on the right, so that the relationship between the two levels is immediately understandable.
3. As a family member, I want each group name to stay on one line, so that the selector remains compact and easy to scan on iPhone.
4. As a family member, I want group names to be concise without losing their meaning, so that I can choose without learning internal terminology.
5. As a family member, I want the Explore page to open on “细胞功能与代谢 / 血糖”, so that the first view starts with a familiar health topic.
6. As a family member, I want “血糖” to appear first within “细胞功能与代谢”, so that a commonly understood topic is immediately available.
7. As a family member, I want the right topic list to update immediately after selecting a group, so that the selector feels like one linked control.
8. As a family member, I want a newly selected group to have a valid topic selected automatically, so that the relationship view never enters an empty or inconsistent state.
9. As a family member, I want the active group and topic to be visually identifiable, so that I can tell what the relationship view represents.
10. As a family member, I want topic counts to remain visible, so that I can understand how many knowledge objects are connected to a topic.
11. As a family member, I want every existing exploration topic to remain available exactly once, so that grouping does not remove or duplicate knowledge relationships.
12. As a family member, I want selecting a topic to show the same related knowledge objects as before, so that grouping changes navigation rather than relationship meaning.
13. As a family member, I want to open a related nutrient, supplement ingredient or food from Explore, so that discovery still leads to the corresponding knowledge object.
14. As a family member, I want the grouped selector to remain usable at the smallest supported iPhone viewport, so that neither column is clipped or inaccessible.
15. As a family member, I want both columns to remain scrollable when necessary, so that the last group and topic can be reached without breaking the dialog layout.
16. As a family member, I want Explore to behave the same when offline, so that navigation does not depend on a live topic request.
17. As a family member, I want to search effects and potential benefits, so that I can find knowledge objects related to a health question.
18. As a family member, I want to search deficiency and insufficiency signs, so that relevant nutrient knowledge can be found from a symptom phrase.
19. As a family member, I want to search risk, contraindication and interaction content, so that important safety information is not hidden from search.
20. As a family member, I want safety matches labelled as risk or precaution context, so that I do not mistake a side effect for a potential benefit.
21. As a family member, I want effect and deficiency evidence to rank ahead of a safety-only match when relevance is otherwise comparable, so that secondary risk corpus does not dominate ordinary results.
22. As a family member, I want “口臭” to find selenium with a safety-context excerpt, so that a term present in the knowledge package is actually searchable without being promoted as a benefit.
23. As a family member, I want both “幽门螺杆菌” and “幽门螺旋杆菌” to find the same evidence-backed effect content, so that a common wording difference does not cause a false no-result state.
24. As a family member, I want common supplement forms such as vitamin D3, methylcobalamin, krill oil and marine magnesium to be searchable, so that I can search the words seen on a supplement label.
25. As a family member, I want Chinese transliterations such as “欧米伽3” and “奥米伽3” to resolve to the established Omega-3 wording, so that spelling style does not block search.
26. As a family member, I want “甲钴胺” to resolve to the established methylcobalamin wording after medical terminology review, so that a common short name can find vitamin B12 knowledge.
27. As a family member, I want an ambiguous query such as `ALA` not to silently mean only α-lipoic acid, so that alpha-linolenic acid is not concealed by an overloaded abbreviation.
28. As a family member, I want broad terms such as “骨密度” or “甲状腺” to retrieve evidence across relevant objects rather than receive an artificial exclusive boost, so that results reflect the searchable content.
29. As a family member, I want exact names and true aliases to remain stronger than related concepts, so that direct object lookup is predictable.
30. As a family member, I want search excerpts to contain the canonical matched wording and its content context, so that I can understand why a result appeared.
31. As a family member, I want search to exclude dosage, food-source, acquisition, overview and lifestyle prose unless represented by reviewed search metadata, so that the search scope stays focused.
32. As a family member, I want food search behavior to remain name-oriented, so that a food is not returned merely because another object lists it as a source.
33. As a family member, I want search results to remain identical offline after a knowledge version has synchronized, so that no server-side fallback changes health results.
34. As a family member, I want my search terms to remain on my device, so that improving search does not introduce server search-history collection.
35. As a project owner, I want all 35 exploration tags mapped to exactly one navigation group, so that adding or renaming a tag cannot silently break Explore.
36. As a project owner, I want group order, topic order and defaults emitted by the knowledge compiler, so that online and offline consumers use the same taxonomy.
37. As a project owner, I want the search document schema version to change when the searchable slots or weights change, so that clients never mix incompatible Pagefind indexes with release data.
38. As a project owner, I want aliases, forms and related queries to have distinct semantics and weights, so that adding recall terms does not degrade exact-name ranking.
39. As a project owner, I want a reviewed golden-query suite instead of server analytics, so that search quality can improve while preserving the project’s personal-data boundary.
40. As a project owner, I want malformed topic mappings, unknown topics, duplicate topic assignments and invalid defaults to fail the candidate build, so that a broken selector cannot be published.
41. As a project owner, I want every published search term to resolve to an intended knowledge object and a defensible context, so that the artificial vocabulary remains auditable.
42. As a project owner, I want candidate releases to remain subject to explicit human publication, so that search and taxonomy changes do not automatically reach family devices.

## Implementation Decisions

- Reuse the existing modal filter interaction and reshape only the Explore variant into a hierarchical, two-column selector. Collection category filters remain single-level.
- The left column contains ordered exploration groups; the right column contains only the ordered topics belonging to the active group. A group selection does not close the selector. A topic selection commits the topic and closes the selector.
- Group labels must render without wrapping or truncation at the supported iPhone viewport. The right column receives the remaining width and each column can scroll within the dialog when its content exceeds the viewport.
- The canonical group and topic order is:
  1. **细胞功能与代谢**：血糖、血脂、能量、DNA、抗氧化、细胞保护、营养协同、造血
  2. **心脑与神经**：心脏、血管、大脑、神经、情绪、睡眠
  3. **免疫与呼吸**：免疫、炎症、感染、呼吸道、过敏
  4. **消化与脏器**：消化、肝脏、肾脏
  5. **骨骼与运动**：骨骼、牙齿、肌肉、关节、运动、身体恢复、疼痛
  6. **皮肤与感官**：皮肤、头发、眼睛、伤口
  7. **生殖与激素**：生殖、激素
- “细胞功能与代谢” is a product navigation grouping for related physiological functions. It is not presented as a formal medical specialty, disease classification or claim that all included topics share one mechanism.
- The default group is “细胞功能与代谢”; the default topic is “血糖”. Both are explicit release metadata, not values inferred from collection iteration order.
- Selecting a new group selects that group’s first topic immediately and updates the relationship view. Reopening the selector reflects the current group and topic.
- `topic_tags` remains the relationship source on each primary knowledge object. The compiler owns one ordered topic-group mapping, validates it, and emits an Explore projection in the immutable knowledge version. The frontend must not recreate the mapping.
- The Explore projection contains the default group, default topic and an ordered list of groups. Each group contains ordered topics; each topic exposes its name, object count and object identifiers. The authenticated topics interface returns the same versioned projection, while the offline release contains all information required without a network request.
- All 35 current tags must appear exactly once in the mapping. A topic present on an object but absent from the mapping, a mapped topic absent from every primary object, a duplicate assignment, or a default outside its declared group fails compilation.
- Ordinary relationship results continue to be computed from primary knowledge objects only. Group names do not become searchable knowledge objects, ordinary detail pages or new `topic_tags`.
- Pagefind remains the only search engine. Search remains deterministic, local after synchronization and limited to the 190 primary knowledge objects.
- The search document schema is versioned as a new focused schema. Nutrient and supplement-ingredient documents contain title, aliases, reviewed artificial search metadata and only the `effects`, `deficiency` and `safety` body slots. Food documents contain title, aliases and reviewed artificial search metadata only.
- Search result context labels distinguish “作用与潜在益处”, “缺乏体征和症状” and “风险、禁忌与相互作用”. The safety label must be visible whenever the selected excerpt comes from `safety`.
- `safety` is a secondary corpus. Its Pagefind weight is lower than `effects` and `deficiency`; title and true aliases remain the strongest signals. Safety-only results are still returned when they are the relevant match.
- Overview, acquisition, food sources, supplement forms and selection, dosage, lifestyle, related concepts and authoring-only material do not enter the body corpus. A query for a useful concept in those slots is supported only through reviewed metadata or a global query variant.
- Keep `aliases` strictly for equivalent names, established English names and unambiguous abbreviations. Do not place symptoms, diseases, themes, medication classes or paired ingredients in `aliases`.
- Reserve the existing high-weight artificial term layer for concrete supplement forms and name-adjacent user queries. Introduce a distinct lower-weight related-query projection for broad themes, diseases, medication classes and paired ingredients. Exact field naming must be reflected in the knowledge profile and release schema, but the compiled contract must preserve the distinction.
- Move or demote broad existing terms including 甲状腺、甲状腺激素、骨密度、GABA、胶原蛋白、谷胱甘肽、黄酮、非蛋白质氨基酸、含硫氨基酸、ACE 抑制剂、利尿剂、胡椒碱 and 菠萝蛋白酶. They may remain useful relationship queries but must not have alias-equivalent weight.
- Add the following first-batch high-value terms, all backed by concepts already present in the knowledge package but outside the focused body corpus:
  - 维生素 D：维生素 D2、维生素 D3
  - 维生素 B12：甲基钴胺素、羟钴胺素、氰钴胺素
  - 钙：磷酸钙、氧化钙、乳酸钙
  - 镁：氢氧化镁、海洋镁、泻盐
  - 锌：锌蛋氨酸、酶活化锌、氧化锌、乙酸锌
  - 鱼油：TG、EE、rTG、磷虾油、藻油
- Track the following second-batch candidates in the golden-query coverage matrix. They are not promoted merely to increase the term count; each must demonstrate a useful intended result and no material precision regression:
  - 维生素 B1：硝酸硫胺、盐酸硫胺、硫胺素焦磷酸酯
  - 维生素 B3：烟酰胺核苷
  - 维生素 B12：5-脱氧腺苷钴胺素
  - 维生素 E：生育三烯酚
  - 硒：甲基硒代半胱氨酸
  - α-硫辛酸：S-α-硫辛酸、DL-α-硫辛酸、硫辛酸钠、二氢硫辛酸
  - 鱼油：MAG-O3
  - 姜黄素：脂质体姜黄素、纳米姜黄素
  - 槲皮素：脂质体槲皮素、乳化槲皮素、环糊精络合槲皮素、磷脂体槲皮素
- Query variants are a separate, versioned normalization layer. Preserve current verified variants and add reviewed variants for 欧米伽3／奥米伽3 → Omega-3. Add 甲钴胺 → 甲基钴胺素 only after terminology review. Product-form hypotheses such as 钙片、镁片、锌片 and 铁剂 require golden-query approval rather than automatic inclusion.
- `ALA` must no longer act as an exclusive high-weight route to α-lipoic acid. Treat it as an ambiguous query with explicit expansions for Alpha Lipoic Acid and α-亚麻酸; any fish-oil relationship is a lower-weight related match, not an alias claim that fish oil and α-亚麻酸 are identical.
- Do not add “口臭” as an isolated high-weight term for selenium. It is retrieved from `safety`, preserving the sentence and risk label that explain the relationship.
- Preserve the established 幽门螺旋杆菌 → 幽门螺杆菌 normalization. The result excerpt must show the canonical phrase from the evidence-bearing effect content.
- Query normalization and result verification must support the user’s original form and the canonical expansion without accepting an unrelated tokenized result. Highlight the canonical matched wording when the original spelling does not appear verbatim in the excerpt.
- The knowledge validator reports counts separately for aliases, high-weight artificial terms and lower-weight related queries. It also rejects duplicate normalized terms within one object and flags cross-object collisions for explicit ambiguity handling.
- Candidate builds generate a new immutable release and Pagefind index. The existing human-confirmed publication flow and atomic client activation remain unchanged.

## Testing Decisions

- The preferred seam is one release-to-product acceptance path: compile the real knowledge package, build the real Pagefind index, load the resulting knowledge version in the running application, and exercise external behavior in WebKit at an iPhone viewport. Tests should assert what the user can select, see and search, not component state, helper calls, CSS classes or the internal Pagefind HTML structure.
- Existing knowledge-release compilation tests are prior art for validating object counts, content-slot projection, generated search documents and rejection of invalid knowledge. Extend this boundary to verify the new search document schema, three permitted body slots, absence of excluded slots, separate weights and Explore projection.
- Existing iPhone WebKit scenarios for the Explore topic dialog, contextual search excerpts and common query variants are prior art for the product acceptance path. Replace the flat-list assumptions rather than adding a second parallel Explore test harness.
- The real-release Explore acceptance scenario verifies the default “细胞功能与代谢 / 血糖” state, the seven groups in order, all 35 topics exactly once, one-line group labels, linked right-column contents, automatic first-topic selection, topic commit, result counts and navigation into a related knowledge object.
- The Explore viewport scenario verifies that the final group and final topic are reachable on the smallest supported iPhone viewport, both columns remain inside the dialog, no group label wraps or truncates, and background content does not scroll while the selector is open.
- Compiler fixtures verify failure for an unmapped `topic_tag`, a tag mapped twice, an empty mapped topic, an invalid default group or topic, and a topic order that omits one of the 35 current tags.
- The real Pagefind acceptance suite includes at least: `口臭`, 幽门螺杆菌, 幽门螺旋杆菌, 维生素 D3, 甲基钴胺素, 海洋镁, 磷虾油, 骨密度, 甲状腺 and ALA. Each assertion checks result identity, selected excerpt and visible context, not only presence somewhere in the index.
- `口臭` must return selenium with a safety-context excerpt and must not be labelled as an effect. 幽门螺旋杆菌 must resolve through the canonical 幽门螺杆菌 wording in effect content. First-batch form queries must return their intended knowledge object.
- A ranking scenario where the same normalized query appears in primary and secondary corpora verifies that an effect or deficiency match precedes an otherwise comparable safety-only match, while a safety-only query still returns a result.
- An ambiguity scenario verifies that `ALA` is not silently accepted as an exclusive α-lipoic-acid alias and that each displayed interpretation has an explicit matched meaning.
- Precision scenarios verify that broad related terms do not receive alias-equivalent ranking and that dosage, food-source, acquisition, overview and lifestyle-only prose is absent unless a reviewed artificial term deliberately bridges it.
- Search tests run against both the online-loaded release and the synchronized offline release. The ordered result identities, excerpts and context labels must remain the same after the network is disabled.
- Golden queries are stored as version-controlled test data with the intended query, accepted variants, expected objects, accepted context slots and prohibited false positives. They do not come from uploaded user search history.
- The full candidate build, type checking, knowledge-release tests and iPhone WebKit suite must pass before owner review. Publication remains a separate explicit action and is not performed by the test suite.

## Out of Scope

- Semantic search, vector databases, generative answers, spelling correction powered by an external service or AI reranking.
- Uploading or storing search terms, browsing history or health interests on the server.
- Rewriting the medical claims, certainty or structure of the underlying effect, deficiency or safety content.
- Making dosage, food sources, acquisition, overview, lifestyle or supplement-selection prose part of the full body corpus.
- Turning exploration groups into new knowledge objects, medical specialties, diagnoses or additional relationship tags.
- Adding, deleting or renaming the 35 existing `topic_tags` as part of this feature.
- Redesigning the Explore relationship diagram or knowledge-object cards beyond the selector changes required for grouping.
- Changing collection category filters for food, nutrients, supplements or favorites into hierarchical selectors.
- Automatically publishing the resulting candidate knowledge version.
- Promoting every second-batch candidate or every imagined product term without golden-query evidence and terminology review.
- Collecting production search analytics to estimate keyword popularity.

## Further Notes

- The current knowledge package contains 196 knowledge objects, of which 190 are primary: 153 foods, 26 nutrients and 11 supplement ingredients. The 129 existing `search_terms` comprise 122 terms on the 37 nutrient and supplement objects plus 7 terms on food objects; aliases are counted separately.
- Ten vitamin objects currently have an empty `search_terms` array, but this does not automatically mean they are unsearchable. Names and aliases remain indexed, and terms already present in effects, deficiency or safety should come from their evidence-bearing body context rather than be duplicated for count symmetry.
- The grouped exploration taxonomy is a stable product-navigation decision based on physiological function and user recognizability. “细胞功能与代谢” is acceptable as a navigation grouping, but the UI must not describe it as a universally standardized medical taxonomy.
- The existing Pagefind ADR broadly describes indexing headings, body, categories and topic tags. This specification narrows the body corpus and therefore refines that ADR; the ADR should be updated so future work does not restore excluded slots accidentally.
- The completed V1 search ticket also describes a broader corpus than the current implementation and this confirmed direction. This specification supersedes that ticket only for search-corpus composition, weighting and query metadata; Pagefind, offline behavior and the 190-object boundary remain unchanged.
- The existing Explore ADR and completed ticket require `topic_tags` to remain the cross-object relationship vocabulary and prohibit a frontend-maintained tag list. The compiler-emitted group projection preserves those decisions.
