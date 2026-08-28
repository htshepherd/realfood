# realfood V1 安全加固

**Status:** ready-for-agent

## Problem Statement

realfood 通过公网 HTTPS 域名向家庭成员提供离线优先的健康手册。现有实现已经建立预配置账户、受信任设备、私有 MinIO、版本化知识接口、人工确认发布和 ECS 外备份等基础边界，但 Codex Security 对完整公开代码快照的静态审阅确认了若干边界缺口。

公网健康检查会为每个匿名请求访问 PostgreSQL 和 MinIO；登录与收藏写接口会无上限地缓冲和解析 JSON；登录限流可以由一个有效账户清除，并且缺失全局清理、目标账户保护和统一验证耗时。管理员停用账户只临时阻止既有受信任设备，重新启用后，旧的长期会话会恢复有效。

静态资源构建和上传会跟随符号链接，上传范围也没有与人工确认的知识版本资源清单绑定。未进入资源清单的 SVG 仍可能由上传器发布，并通过已鉴权的同源资源接口作为可执行 SVG 返回。候选构建还会提前修改活动资产，削弱“候选构建—人工确认—正式发布”的边界；未经约束的内容文件名可以用终端控制字符干扰发布报告显示。

离线收藏队列没有账户身份，账号切换时可能把旧账户操作重放到新账户；退出登录只清除发起退出的标签页状态，其他标签页仍可显示对内知识。备份流程把任意 Restic 查询失败当作首次初始化，恢复流程会递归选择任意名为 `postgres.dump` 的文件，备份镜像还会下载和执行未固定版本、未经校验的工具。

用户已经确认采纳上述安全整改，但明确不处理受信任设备记录数量上限，也不新增密码复杂度策略。需要在保持家庭内部使用、长期登录、离线优先、私有资源和人工确认发布等既有产品决定不变的前提下，关闭其余已确认风险。

## Solution

把安全整改落在四个既有产品边界上。

公网与认证边界将轻量存活检查与内部依赖就绪检查分开；反向代理和应用共同限制 JSON 请求体；登录保护同时约束来源、目标账户和密码验证并发，成功登录不能清除针对其他账户的失败历史；缺失或停用账户走与错误密码一致的密码验证路径。管理员停用账户时永久撤销当时存在的全部在线会话，重新启用不能恢复旧 Cookie。

静态资源与知识版本边界只接受位于授权根目录内的普通文件。构建、上传和运行时读取都以人工确认知识版本的资源清单为准；SVG 不从已鉴权应用同源返回。优化图片只写入候选版本隔离目录，确认发布后再以不可变、版本化对象键上传，活动版本不会被候选构建提前修改。知识对象与资源文件名拒绝终端控制字符和方向控制字符，发布报告同时进行安全转义。

账户隔离边界让离线收藏操作显式绑定账户，并在同步前与当前服务端账户核对。退出登录通过同源跨标签页通知让所有打开的页面立即清除内存状态、IndexedDB、Cache Storage、待同步操作和已选详情；账号切换或退出竞态不能把旧队列写回或重放给新账户。

备份恢复边界把 Restic 仓库初始化改为独立、显式的运维动作，普通备份遇到任何仓库错误都失败并暴露错误。备份布局和恢复路径固定，恢复只能读取快照根目录中唯一、经过结构验证的数据库归档。带有数据库、MinIO 和 Restic 凭据的备份镜像及下载工具固定版本和摘要，校验失败时构建终止。

## User Stories

1. As a family member, I want anonymous health checks to stay lightweight, so that public probes cannot consume the same PostgreSQL and MinIO capacity as my authenticated requests.
2. As an operator, I want liveness and dependency readiness to be separate, so that orchestration can diagnose dependencies without exposing expensive checks to the internet.
3. As a family member, I want oversized login requests rejected before JSON parsing, so that anonymous traffic cannot exhaust the application process.
4. As a family member, I want oversized favorite operations rejected before JSON parsing, so that an authenticated browser cannot accidentally or deliberately consume unbounded memory.
5. As an operator, I want fixed-length and chunked request bodies subject to the same limit, so that transport encoding cannot bypass protection.
6. As a family member, I want login failures against my account to remain limited even when another family account logs in successfully, so that one valid account cannot reset protection for another.
7. As a family member, I want login protection applied to both client source and target account, so that rotating either dimension alone does not permit unlimited guesses.
8. As an operator, I want password-verification concurrency bounded, so that repeated login attempts cannot monopolize CPU.
9. As an operator, I want expired source-limit records removed and the in-memory limiter bounded, so that rotating client addresses cannot grow process memory indefinitely.
10. As a family member, I want an unknown, disabled or mistyped account to produce the same public response and comparable verification work, so that enabled usernames are not revealed by response differences.
11. As an administrator, I want disabling an account to revoke every session issued before disablement, so that containment remains effective after the account is re-enabled.
12. As an administrator, I want account re-enablement to require a fresh login, so that a previously stolen long-lived cookie cannot regain access.
13. As a family member, I want ordinary successful login and long-lived trusted-device behavior to remain unchanged, so that security hardening does not introduce repeated sign-in prompts.
14. As a content owner, I want candidate builds to reject symbolic links and non-regular filesystem entries, so that content preparation cannot read outside authorized roots.
15. As an operator, I want asset upload to reject symbolic links, hard links, devices, sockets and pipes, so that privileged upload credentials cannot be used to disclose host files.
16. As a content owner, I want canonical paths checked against the declared asset root, so that nested traversal and link resolution cannot escape the authorized directory.
17. As a content owner, I want only manifest-listed assets uploaded, so that unreviewed files cannot accompany an approved knowledge version.
18. As a family member, I want the application to serve only assets belonging to the active knowledge version, so that resource bytes cannot drift independently of reviewed content.
19. As a family member, I want authenticated application-origin assets limited to safe raster formats, so that opening an image URL cannot execute SVG script.
20. As a content owner, I want raster images decoded and deterministically re-encoded during candidate generation, so that extension names alone do not establish image safety.
21. As a content owner, I want optimized images written only to the candidate workspace, so that merely reviewing a candidate cannot alter active assets.
22. As a project owner, I want candidate assets promoted only after explicit publication confirmation, so that AI organization or an ordinary build cannot change family-visible bytes.
23. As a project owner, I want published asset object keys immutable and version-bound, so that a later upload cannot silently replace bytes referenced by an earlier knowledge version.
24. As a project owner, I want upload-time size and checksum verification against the confirmed manifest, so that the stored assets match the reviewed candidate.
25. As a content owner, I want unsafe control and direction characters rejected from content and asset filenames, so that publication reports cannot be visually spoofed.
26. As a project owner, I want report output escaped safely even after filename validation, so that terminal rendering never becomes a publication authority boundary.
27. As a family member, I want an offline favorite operation bound to the account that created it, so that it cannot be replayed under another family account.
28. As a family member, I want pending favorite operations replayed only after the online account identity matches, so that stale local data cannot modify another account.
29. As a family member, I want switching accounts to isolate queued operations, cached favorites and account display data, so that family members' personal state remains separate.
30. As a family member, I want logging out in one tab to log out every open tab for the same application, so that no sibling tab keeps showing internal knowledge.
31. As a family member, I want a sibling tab to clear its selected detail, release, favorites and account display immediately after logout, so that rendered memory does not outlive access.
32. As a family member, I want logout to clear IndexedDB, Pagefind data, image caches and pending operations across tabs, so that the established private-data boundary remains complete.
33. As a family member, I want an in-flight favorite write canceled or discarded after logout or account change, so that a stale tab cannot recreate the cleared queue.
34. As a family member, I want trusted offline reading to keep working until I actively log out or the device next verifies a server-side revocation, so that cross-tab hardening preserves the offline-first decision.
35. As an operator, I want Restic repository initialization to be a separate explicit command, so that an ordinary backup failure cannot silently create an empty replacement repository.
36. As an operator, I want backup failures to preserve their original error and return a failing exit status, so that missing history and credential problems cannot be mistaken for success.
37. As an operator, I want a stable backup layout with one exact database archive path, so that asset content cannot provide a decoy restore archive.
38. As an operator, I want restore to reject missing, duplicate or structurally invalid database archives before destructive actions, so that a malformed snapshot cannot partially replace production data.
39. As an operator, I want restore to continue requiring an explicit snapshot and confirmation, so that hardening does not weaken existing destructive-operation safeguards.
40. As an operator, I want backup container bases fixed by immutable digest, so that rebuilding cannot silently execute a different privileged image.
41. As an operator, I want downloaded MinIO tooling fixed to a reviewed version and verified checksum, so that compromised mutable downloads cannot access production credentials.
42. As an operator, I want architecture-specific tool checksums declared and verified, so that both supported build architectures fail closed.
43. As a project owner, I want production-stack tests to verify public endpoint cost boundaries, authentication throttling and permanent revocation, so that security behavior is validated through the deployed interface.
44. As a project owner, I want knowledge-release tests to verify regular-file-only, manifest-only and candidate-isolation rules, so that publication safety is tested before owner review.
45. As a project owner, I want iPhone WebKit tests to exercise multi-tab logout and cross-account offline queues, so that client privacy is validated in the supported browser.
46. As a project owner, I want backup and restore acceptance tests to use isolated disposable stores, so that safety behavior is tested without touching production snapshots.
47. As a project owner, I want all accepted Codex Security findings mapped to an automated test or an explicit build-time invariant, so that the same class of issue does not silently return.

## Implementation Decisions

- Preserve the established V1 architecture: one ECS, Docker Compose, Next.js, PostgreSQL, private MinIO and Caddy. This work does not introduce Redis, a managed WAF, public object storage or a multi-instance deployment.
- Preserve the public HTTPS product boundary. The existing public health path becomes a dependency-free liveness response. A separate PostgreSQL-and-MinIO readiness check is reachable only from the internal Compose network and is not routed by the public proxy.
- Apply a 16 KiB maximum to JSON bodies for login and favorite mutation at both the reverse-proxy and application boundaries. The application limit counts streamed bytes and does not rely solely on `Content-Length`; oversized fixed-length and chunked requests return `413` without calling JSON parsing or downstream dependencies.
- Keep login error messages and public status behavior uniform. Unknown, disabled and wrong-password accounts all execute password verification using either the stored hash or a fixed valid dummy hash before returning the same authentication failure.
- Replace the single resettable address counter with independent controls for effective client source and normalized target account. Preserve the current ten-attempt, fifteen-minute product policy unless implementation evidence requires a stricter lower operational limit. A successful login clears only the successful account's own eligible failure state and never erases failures directed at another account.
- Because V1 is a single application instance, source-address limiting may remain process-local, but it must use a proxy-established effective client address, prune expired entries, enforce a finite map size and never trust an attacker-prepended forwarded-address value. Target-account lock state is durable in PostgreSQL so application restarts do not reset protection for a repeatedly attacked account.
- Bound concurrent password-hash verification within the application process. Saturation returns a uniform retry response rather than starting unlimited expensive work.
- Extend account authentication state only with the minimum failed-attempt count and lock-expiry information required for target-account protection. Do not persist search terms, browsing state or a historical source-address log.
- Account disablement is a monotonic revocation event. In one database transaction it marks the account disabled, advances the password version and deletes or invalidates all existing trusted-device rows. Re-enabling changes only account availability; it cannot reverse the revocation version or revive old sessions.
- Preserve the 180-day trusted-device lifetime and normal offline behavior. Online requests made with a revoked session return `401`; a fresh login after re-enablement creates a new trusted-device session.
- Introduce one shared filesystem-ingestion boundary for knowledge and static-resource workflows. It accepts only regular files, rejects symbolic links and other special entries, rejects multi-link files where the platform exposes link counts, resolves canonical paths beneath the declared root and uses no-follow file opens where supported.
- Content and asset basenames must be Unicode-normalized and must reject C0/C1 controls, carriage return, line feed, escape, bidirectional override/isolate controls, path separators and ambiguous dot segments. Existing valid Chinese and ASCII filenames remain supported.
- Candidate generation reads original raster assets through the shared ingestion boundary, decodes them and emits deterministic PNG/WebP metadata and optimized bytes into a candidate-specific directory. It never writes into the active runtime asset tree.
- The candidate report and immutable knowledge-version manifest contain every allowed original and optimized asset key, byte length, media type and checksum. SVG and all non-raster files fail candidate validation and are never valid knowledge assets.
- Publication confirmation binds the exact candidate knowledge data, Pagefind index and asset manifest. Asset upload accepts that confirmed manifest as its complete allowlist, rejects extra files, verifies sizes and checksums before upload and uses least-privileged object-store credentials scoped to publication.
- Published objects use knowledge-version-prefixed immutable keys. Existing application resource URLs may remain stable, but the authenticated resource service resolves them through the active version's manifest and corresponding versioned object key. A missing, unlisted, mismatched or unsupported asset returns a non-executable error response.
- The authenticated application origin never serves SVG as `image/svg+xml`. This specification chooses raster-only knowledge assets instead of SVG sanitization or a separate cookieless asset origin.
- Publishing and report rendering escape untrusted names independently of filename validation. Human confirmation remains mandatory and must display the candidate's bound manifest identity and checksums.
- Change the offline favorite operation contract to include the creating account identifier. Pending operations are stored in an account-scoped queue and replay only after the current online account identity matches; mismatched operations remain isolated or are discarded during explicit logout, never rewritten under the new account.
- Add an origin-wide logout generation/event understood by every open application tab. Use a mechanism supported by the target iPhone Safari, with a storage-event fallback if the primary channel is unavailable. Receiving the event clears in-memory UI state, IndexedDB, Cache Storage and pending writes, then returns the tab to login without emitting a loop of new logout events.
- Favorite writes and queue persistence capture the active account/logout generation and verify it again before committing local state. Completion after an account change or logout is ignored, preventing a stale tab from recreating cleared data.
- When online, a tab that regains focus or visibility revalidates the session so a missed cross-tab event or administrator revocation cannot leave stale rendered data indefinitely. Offline tabs preserve the established trusted-device behavior until a local logout event or later online verification.
- Remove implicit Restic initialization from ordinary backup execution. Provide a distinct explicit repository-bootstrap operation; normal backup requires an existing readable repository and propagates any snapshots, credential, integrity or connectivity error without creating replacement state.
- Use a fixed backup layout with the database archive at one exact snapshot-root path and MinIO content under a separate subtree. Restore reads only the exact database path, rejects ambiguity, validates the PostgreSQL archive structure before confirmation and retains the existing explicit snapshot selection and destructive confirmation.
- Pin every privileged backup/restore container base by immutable digest. Pin downloaded MinIO tooling to a reviewed version, declare architecture-specific SHA-256 values, verify before making it executable and fail the image build on mismatch.
- Do not automatically patch production, publish a knowledge version, initialize a backup repository or perform a destructive restore as part of implementation or tests.

## Testing Decisions

- Prefer four high-level seams already aligned with the product architecture: the isolated production-stack HTTP acceptance path, the real knowledge-version build/publication boundary, the iPhone WebKit product boundary, and an isolated backup/restore workflow. Tests assert observable security outcomes rather than helper implementation, internal map shape, SQL text or component state.
- Extend the production-stack acceptance path that already uses real PostgreSQL, sessions, two accounts and private MinIO. It verifies that the public liveness route succeeds without dependency calls, the internal readiness route diagnoses real dependencies but is unavailable through Caddy, and ordinary authenticated knowledge/resource requests remain functional.
- At the HTTP boundary, send oversized fixed-length and chunked JSON to public login and authenticated favorite mutation. Assert `413`, no session or favorite mutation, bounded response time and continued health of a subsequent normal request.
- Authentication acceptance uses two real accounts. Fail repeatedly against account B, successfully authenticate account A and assert B remains limited. Verify source and account limits expire as specified, a process-local source map remains bounded, and concurrent password work does not exceed the configured budget.
- Timing protection tests assert equal status, headers and body for unknown, disabled and wrong-password accounts and verify that all paths cross the password-verification seam. They must not assert fragile millisecond equality; a coarse repeated timing check may guard against a large scrypt/no-scrypt distinction without becoming a flaky benchmark.
- Session revocation acceptance creates a valid Cookie, disables and re-enables the account through the administrator workflow, then asserts the old Cookie remains `401` and a newly issued Cookie succeeds. Database assertions may confirm the revocation transaction only as supporting evidence, not as the sole behavioral test.
- Extend existing knowledge-release compilation tests as the main asset safety seam. Fixtures containing file and directory symlinks, hard links where supported, special entries, out-of-root canonical paths, SVG, terminal controls, bidi controls, unlisted files and checksum mismatches must fail before publication or upload.
- A candidate-isolation test snapshots the active asset tree, generates and validates a candidate, and asserts the active tree is byte-for-byte unchanged while candidate-specific optimized assets and manifest entries are complete.
- A publication acceptance fixture confirms one candidate, uploads only its manifest entries to a disposable S3-compatible store and verifies version-prefixed immutable keys, correct media types, exact checksums, refusal of extras and refusal to replace existing versioned bytes with different content.
- Resource-service acceptance requests listed PNG/WebP assets and unlisted, mismatched and SVG keys through the authenticated application route. Only active-manifest raster assets succeed; SVG and unlisted keys cannot return executable content.
- Extend the existing iPhone WebKit logout scenario to two pages in one browser context. Logging out in either page must move both to login and remove rendered account/release/favorite/detail state, IndexedDB and private Cache Storage.
- Add an iPhone WebKit account-switch scenario with two real or deterministic test accounts. Create an offline favorite operation for account A, reproduce the stale-tab/logout race, log in as account B and assert no operation is replayed into B. Re-authenticating A may resume only A's still-valid scoped queue unless explicit logout already deleted it.
- Browser race tests pause a favorite request, trigger logout or account change, then release the request and assert no private queue or UI state is recreated. Tests remain at the visible browser/storage boundary rather than invoking queue helpers directly.
- Add disposable backup/restore integration tests using temporary PostgreSQL, MinIO-compatible storage and Restic repository paths. A normal backup against an absent, unreadable or wrong-password repository must fail without initialization; only the explicit bootstrap operation may create a repository.
- Restore fixtures place decoy `postgres.dump` files inside the MinIO subtree and assert the restore selects only the fixed snapshot-root archive. Missing, duplicate-at-required-location, invalid and unexpected archives must fail before destructive database commands.
- Build-configuration tests verify immutable image digests, pinned MinIO tool version and architecture-specific checksums. A deliberately incorrect checksum must fail before the downloaded binary is executed.
- Preserve and run the existing authentication cryptography tests, deployment configuration tests, runtime-bundle tests, knowledge-release tests, isolated production-stack acceptance and iPhone WebKit suite. No test publishes to production, touches real credentials, modifies the real knowledge package or restores a real snapshot.
- Map each accepted scan finding to at least one regression scenario in test names or test metadata, while testing the external invariant rather than reproducing scanner prose.
- After implementation and regression tests pass, run a focused security rescan against the resulting Git revision. The rescan is evidence for review, not a replacement for deterministic tests.

## Out of Scope

- Limiting the number of `trusted_devices` rows per account, pruning expired trusted-device rows or changing ordinary device issuance behavior. The owner explicitly accepts the current behavior for family-internal use.
- Adding or changing password length, complexity, common-password rejection, rotation or password-expiry policy. The owner manages strong passwords directly.
- Changing the 180-day trusted-device lifetime, removing offline trusted-device access or requiring server verification every time the PWA opens.
- Public registration, account invitation, self-service password change, password recovery, multi-factor authentication or third-party identity providers.
- Moving V1 to Redis, Kubernetes, multiple application replicas, a managed database, public object storage, a VPN-only product or a managed WAF.
- Making MinIO public, allowing browser clients to hold MinIO credentials or introducing a general-purpose file-upload feature.
- Supporting SVG knowledge assets through sanitization or a separate asset origin; this specification chooses raster-only assets.
- Changing medical content, knowledge objects, search corpus, exploration taxonomy, Pagefind behavior or the knowledge package itself.
- Uploading the knowledge package, raw materials, release JSON, Pagefind bytes or original images to the issue tracker or source repository.
- Live exploitation of production, destructive restore against production, automatic Restic repository initialization or automatic knowledge publication.
- Treating normal browser-profile access, iPhone device compromise or an already-authorized deployment/backup operator as a new application privilege escalation.

## Further Notes

- This specification is based on the completed Codex Security static scan of the `origin/main` public-code snapshot: 86 of 86 files covered, 17 findings confirmed by static source-to-sink analysis, with no critical or high findings. The scan did not perform live exploitation.
- The owner excludes finding 1, unbounded trusted-device table growth, and finding 13, weak password acceptance. This specification covers the remaining 15 findings: six medium and nine low.
- Private/generated knowledge, raw materials, active release JSON, Pagefind output, runtime asset bytes and candidate artifacts were intentionally absent from the scan snapshot. The specification therefore hardens their producing and consuming workflows but does not claim that deployed private bytes were independently inspected.
- The session-revocation decision completes the meaning of “管理员停用账户后设备再次联网完成状态核验” in the trusted-device ADR: disablement permanently invalidates pre-disable sessions, while normal long-lived and offline behavior remains unchanged.
- Cross-tab clearing strengthens the existing logout ADR rather than changing its access boundary. “当前设备” includes every open same-origin tab and PWA window using that browser profile.
- Candidate asset isolation and manifest-bound immutable upload enforce the existing human-confirmed knowledge-version ADR. A candidate build that mutates active assets would conflict with that ADR, so this specification removes the conflict rather than creating a new publication model.
- Raster-only, authenticated, manifest-bound assets strengthen the private MinIO ADR and remain compatible with images being loaded and cached on demand rather than bundled into atomic knowledge downloads.
- Durable target-account throttle state is authentication security metadata required for account protection. It must remain minimal and must not expand into search logging, browsing analytics or a general personal activity history.
- The complete local scan report remains a review input outside the tracked knowledge package. No knowledge package or original material is included in this specification.
