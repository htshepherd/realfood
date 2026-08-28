"use client";

import {
  Apple,
  ArrowLeft,
  BadgeCheck,
  Beaker,
  Bookmark,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  FlaskConical,
  HeartPulse,
  Leaf,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { clearOfflineData, readOffline, writeOffline } from "@/src/lib/offline-store";

type SlotGroup = { title: string; markdown: string; text: string; itemCount: number; links: { title: string; href: string; slug: string }[]; summary: string; subgroups: SlotGroup[]; deficiencyRole?: "symptoms" | "risk" };
type KnowledgeSlot = { key: string; label: string; sourceTitle: string; markdown: string; text: string; groups: SlotGroup[] };
type FoodData = { relationCount: number; relations: { title: string; href: string }[]; classification?: KnowledgeSlot | null };
type NavigationEntry = { id: string; slotKey: string; title: string; description: string; pageIntro: string; groupIndexes: number[] | null };
type KnowledgeItem = {
  id: string; slug: string; title: string; collection: "食物" | "营养素" | "补充剂" | string;
  surface: string;
  description: string; category: string; image: string; rawOrder: number | null; topicTags: string[]; tags: string[];
  classification?: { groupCode?: string; group?: string; subgroupCode?: string; subgroup?: string } | null; food?: FoodData | null;
  slots: Record<string, KnowledgeSlot>; aliases: string[]; searchTerms?: string[]; relatedQueries?: string[]; searchableText: string;
  navigation: NavigationEntry[];
  verificationMarks?: { name: string; description: string; image: string }[];
};
type SearchFile = { path: string; bytes: number; checksum: string };
type SearchHit = { id: string; excerpt: string; context?: string };
type PagefindSubResult = { excerpt?: string; plain_excerpt?: string; title?: string; url?: string; weighted_locations?: { balanced_score?: number }[] };
type PagefindData = { excerpt?: string; plain_excerpt?: string; meta?: { id?: string }; sub_results?: PagefindSubResult[] };
type ExploreTopic = { name: string; count: number; objectIds: string[] };
type ExploreGroup = { name: string; topics: ExploreTopic[] };
type ExploreProjection = { defaultGroup: string; defaultTopic: string; groups: ExploreGroup[] };
type SearchQueryExpansion = { query: string; evidenceTerm?: string; context?: string };
type SearchTermCollision = { term: string; entries: { id: string; kind: string; value: string }[] };
type Release = { manifest: { schema: string; version: string; generatedAt: string; checksum: string; counts: { primary: number }; assets: { checksum: string }; search: { engine: string; engineVersion: string; documentSchema?: string; baseUrl: string; files?: SearchFile[]; queryExpansions?: Record<string, SearchQueryExpansion[]>; termCounts?: { aliases: number; searchTerms: number; relatedQueries: number }; termCollisions?: SearchTermCollision[] } }; objects: KnowledgeItem[]; explore?: ExploreProjection };
type Account = { id: string; username: string; displayName: string };
type FavoriteOperation = { accountId: string; objectId: string; favorite: boolean; updatedAt: string };
type View = "home" | "foods" | "nutrients" | "supplements" | "explore" | "verification" | "favorites";

const VIEW_LABELS: Record<View, string> = {
  home: "首页", foods: "食物", nutrients: "营养素", supplements: "补充剂",
  explore: "探索", verification: "验证标志", favorites: "收藏",
};

const LEGACY_SEARCH_QUERY_EXPANSIONS: Record<string, SearchQueryExpansion[]> = {
  a: [{ query: "维生素 A" }], c: [{ query: "维生素 C" }], d: [{ query: "维生素 D" }],
  e: [{ query: "维生素 E" }], k: [{ query: "维生素 K" }],
  老人: [{ query: "老人" }, { query: "老年人" }, { query: "老年" }],
  女人: [{ query: "女人" }, { query: "女性" }, { query: "妇女" }],
  幽门螺旋杆菌: [{ query: "幽门螺旋杆菌" }, { query: "幽门螺杆菌" }],
  抽筋: [{ query: "抽筋" }, { query: "肌肉痉挛" }],
  伤口恢复慢: [{ query: "伤口恢复慢" }, { query: "伤口愈合缓慢" }],
  注意力下降: [{ query: "注意力下降" }, { query: "注意力不集中" }, { query: "难以集中注意力" }],
  睡眠差: [{ query: "睡眠差" }, { query: "睡眠质量" }, { query: "入睡困难" }, { query: "失眠" }],
  反复感染: [{ query: "反复感染" }, { query: "频繁感染" }, { query: "容易感染" }],
};

const SEARCH_CONTEXT_LABELS: Record<string, string> = {
  effects: "作用与潜在益处",
  deficiency: "缺乏体征和症状",
  safety: "风险、禁忌与相互作用",
};

const symbolBySlug: Record<string, string> = {
  "vitamin-c": "C", "vitamin-a": "A", "vitamin-d": "D", "vitamin-e": "E", "vitamin-k": "K",
  "vitamin-b1": "B1", "vitamin-b2": "B2", "vitamin-b3": "B3", "vitamin-b5": "B5",
  "vitamin-b6": "B6", "vitamin-b7": "B7", "vitamin-b9": "B9", "vitamin-b12": "B12",
  magnesium: "Mg", calcium: "Ca", iron: "Fe", zinc: "Zn", selenium: "Se", copper: "Cu",
  potassium: "K", sodium: "Na", iodine: "I", manganese: "Mn", boron: "B", "fish-oil": "Ω3",
  "n-acetylcysteine": "NAC", "coenzyme-q10": "Q10", creatine: "Cr",
};

const slotPresentation: Record<string, { icon: typeof Apple; color: string }> = {
  foodSources: { icon: Apple, color: "#e4f0e9" }, effects: { icon: Sparkles, color: "#e7e8f7" },
  deficiency: { icon: HeartPulse, color: "#f1e7df" }, dosage: { icon: FlaskConical, color: "#e9e6f2" },
  safety: { icon: ShieldCheck, color: "#eee9df" }, formsAndSelection: { icon: Beaker, color: "#e6e9ef" },
  acquisition: { icon: Leaf, color: "#e9f0e5" }, lifestyle: { icon: Compass, color: "#e5edf0" },
  special: { icon: BookOpenCheck, color: "#eee8f2" }, overview: { icon: BookOpenCheck, color: "#e8eeea" },
};

const entryPresentation: Record<string, { icon: typeof Apple; color: string }> = {
  "food-sources": { icon: Apple, color: "#e4f0e9" },
  effects: { icon: Sparkles, color: "#e7e8f7" },
  deficiency: { icon: HeartPulse, color: "#f1e7df" },
  forms: { icon: Beaker, color: "#e6e9ef" },
  selection: { icon: BadgeCheck, color: "#eee9df" },
  dosage: { icon: FlaskConical, color: "#e9e6f2" },
  lifestyle: { icon: Compass, color: "#e5edf0" },
  safety: { icon: ShieldCheck, color: "#f1e4e1" },
};

class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

function api<T>(url: string, init?: RequestInit): Promise<T> {
  return fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(body.error ?? "请求失败", response.status);
    return body;
  });
}

async function validRelease(release: Release) {
  if (release.objects.filter((item) => item.surface === "primary").length !== release.manifest.counts.primary) return false;
  const payload = {
    schema: release.manifest.schema,
    searchEngine: release.manifest.search.engineVersion,
    searchDocumentSchema: release.manifest.search.documentSchema,
    ...(release.manifest.search.queryExpansions ? { searchQueryExpansions: release.manifest.search.queryExpansions } : {}),
    ...(release.manifest.search.termCounts ? { searchMetadata: { termCounts: release.manifest.search.termCounts, termCollisions: release.manifest.search.termCollisions } } : {}),
    objects: release.objects,
    ...(release.explore ? { explore: release.explore } : {}),
    assetFingerprint: release.manifest.assets.checksum,
    searchFiles: release.manifest.search.files ?? [],
  };
  const source = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", source);
  const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return checksum === release.manifest.checksum;
}

async function prefetchSearch(release: Release) {
  const files = release.manifest.search.files ?? [];
  for (let index = 0; index < files.length; index += 12) {
    await Promise.all(files.slice(index, index + 12).map((file) => fetch(`${release.manifest.search.baseUrl}${file.path}`, { cache: "reload" }).then((response) => {
      if (!response.ok) throw new Error("搜索索引同步失败");
      return response.arrayBuffer();
    }).then(async (bytes) => {
      if (bytes.byteLength !== file.bytes) throw new Error("搜索索引长度校验失败");
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      if (checksum !== file.checksum) throw new Error("搜索索引校验失败");
    })));
  }
}

function focusedPagefindExcerpt(html: string) {
  const segments = html.split(/\.\s+/).filter(Boolean);
  const matched = segments.filter((segment) => /<mark\b/i.test(segment));
  const markCount = (segment: string) => segment.match(/<mark\b/gi)?.length ?? 0;
  return (matched.sort((left, right) => markCount(right) - markCount(left) || left.length - right.length)[0] ?? html)
    .replace(/^\s*[:：]\s*/, "")
    .trim();
}

function removePagefindEvidenceAnchors(html: string) {
  return html
    .replace(/(?:<mark\b[^>]*>)?ihealthevidence(?:bonedensity|krilloil)(?:<\/mark>)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function compactSearchText(value: string) {
  return decodeSearchEntities(value.replace(/<[^>]*>/g, ""))
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function searchQueryExpansions(release: Release, query: string) {
  const normalized = query.normalize("NFKC").trim();
  const queryExpansions = release.manifest.search.queryExpansions ?? LEGACY_SEARCH_QUERY_EXPANSIONS;
  const configured = queryExpansions[normalized]
    ?? queryExpansions[normalized.toLocaleLowerCase("zh-CN")]
    ?? [{ query: normalized }];
  return configured.filter((entry, index) => configured.findIndex((candidate) => candidate.query === entry.query && candidate.context === entry.context) === index);
}

function searchContext(result?: PagefindSubResult) {
  const fragment = result?.url?.split("#")[1] ?? "";
  const slotKey = fragment.split("--")[0];
  return SEARCH_CONTEXT_LABELS[slotKey];
}

function strongestPagefindSection(results: PagefindSubResult[], evidenceTerm: string) {
  const compactEvidenceTerm = compactSearchText(evidenceTerm);
  const score = (result: PagefindSubResult) => (result.weighted_locations ?? []).reduce((sum, location) => sum + (location.balanced_score ?? 0), 0);
  const matching = results.filter((result) => compactSearchText(result.excerpt ?? result.plain_excerpt ?? "").includes(compactEvidenceTerm));
  return [...(matching.length ? matching : results)].sort((left, right) => score(right) - score(left))[0];
}

function highlightEvidenceTerm(html: string, evidenceTerm: string) {
  if (!evidenceTerm || !html.includes(evidenceTerm) || html.includes(`<mark>${evidenceTerm}</mark>`)) return html;
  return html.replace(evidenceTerm, `<mark>${evidenceTerm}</mark>`);
}

function releaseEvidenceMatch(item: KnowledgeItem | undefined, evidenceTerm: string) {
  if (!item) return null;
  for (const slotKey of ["effects", "deficiency", "safety"]) {
    const line = item.slots[slotKey]?.markdown.split("\n")
      .map((value) => value.replace(/\[([^\]]+)]\([^)]+\)/g, "$1").replace(/[*_`#>]/g, "").replace(/^\s*-\s*/, "").trim())
      .find((value) => value.includes(evidenceTerm));
    if (line) return { excerpt: highlightEvidenceTerm(line, evidenceTerm), context: SEARCH_CONTEXT_LABELS[slotKey] };
  }
  const metadata = [item.title, ...item.aliases, ...(item.searchTerms ?? []), ...(item.relatedQueries ?? [])].find((value) => value.includes(evidenceTerm));
  return metadata ? { excerpt: highlightEvidenceTerm(metadata, evidenceTerm), context: undefined } : null;
}

async function searchRelease(release: Release, query: string, collection?: string) {
  const compactQuery = compactSearchText(query);
  const expansions = searchQueryExpansions(release, query);
  const variants = expansions.map((entry) => entry.query);
  const allowsSingleCharacter = variants.some((variant) => compactSearchText(variant) !== compactQuery)
    || release.objects.some((item) => [item.title, ...item.aliases].some((name) => compactSearchText(name) === compactQuery));
  if ([...compactQuery].length < 2 && !allowsSingleCharacter) return [];

  const pagefind = await import(/* webpackIgnore: true */ `${release.manifest.search.baseUrl}pagefind.js`);
  await pagefind.init();
  const candidates = (await Promise.all(expansions.map(async (expansion) => {
    const response = await pagefind.search(expansion.query, collection ? { filters: { collection } } : {});
    return response.results.map((result: { score: number; data: () => Promise<PagefindData> }) => ({ ...result, variant: expansion.query, evidenceTerm: expansion.evidenceTerm ?? expansion.query, expansionContext: expansion.context }));
  }))).flat().sort((left, right) => right.score - left.score);

  const hits: SearchHit[] = [];
  const accepted = new Set<string>();
  for (const candidate of candidates) {
    const entry = await candidate.data();
    const id = entry.meta?.id;
    if (!id || accepted.has(id)) continue;
    const strongestSection = strongestPagefindSection(entry.sub_results ?? [], candidate.evidenceTerm);
    let excerpt = removePagefindEvidenceAnchors(highlightEvidenceTerm(focusedPagefindExcerpt(strongestSection?.excerpt ?? entry.excerpt ?? entry.plain_excerpt ?? ""), candidate.evidenceTerm));
    let evidenceContext: string | undefined;
    if (!compactSearchText(excerpt).includes(compactSearchText(candidate.evidenceTerm))) {
      const fallback = releaseEvidenceMatch(release.objects.find((item) => item.id === id), candidate.evidenceTerm);
      if (!fallback) continue;
      excerpt = fallback.excerpt;
      evidenceContext = fallback.context;
    }
    accepted.add(id);
    hits.push({ id, excerpt, context: candidate.expansionContext ?? evidenceContext ?? searchContext(strongestSection) });
  }
  return hits;
}

function decodeSearchEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named[code.toLowerCase()] ?? entity;
  });
}

function HighlightedExcerpt({ html }: { html: string }) {
  const open = "\uE000"; const close = "\uE001";
  const text = decodeSearchEntities(html
    .replace(/<\/mark>\s*<mark\b[^>]*>/gi, "")
    .replace(/<mark\b[^>]*>/gi, open)
    .replace(/<\/mark>/gi, close)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim());
  let highlighted = false;
  return <>{text.split(/([\uE000\uE001])/).map((part, index) => {
    if (part === open) { highlighted = true; return null; }
    if (part === close) { highlighted = false; return null; }
    return highlighted ? <mark key={index} className="rounded-[3px] bg-[#dfeee4] px-0.5 text-inherit">{part}</mark> : part;
  })}</>;
}

function Login({ onSuccess }: { onSuccess: (account: Account) => void }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setPending(true);
    const values = new FormData(event.currentTarget);
    try {
      if (localStorage.getItem("ihealth-logout-pending") === "1") {
        await api("/api/v1/auth/logout", { method: "POST" });
        localStorage.removeItem("ihealth-logout-pending");
      }
      const result = await api<{ account: Account }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: values.get("username"), password: values.get("password"), deviceName: navigator.userAgent }),
      });
      await writeOffline("account", result.account); onSuccess(result.account);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "登录失败"); }
    finally { setPending(false); }
  }
  return <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col bg-[#fbfcfb] px-7 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(28px,env(safe-area-inset-top))]">
    <header className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-[10px] bg-[#172a21] text-white"><Leaf size={16}/></span><span className="font-mono text-[13px] font-semibold tracking-[0.06em]">realfood</span></header>
    <section className="my-auto w-full pb-14 pt-16">
      <div className="text-center"><h1 className="text-[30px] font-semibold tracking-[-0.045em]">食物与营养指南</h1><p className="mt-2 text-[14px] text-[var(--muted)]">登录后继续浏览健康知识</p></div>
      <form onSubmit={submit} className="mt-9 space-y-3">
        <label className="block"><span className="sr-only">账号</span><input name="username" autoComplete="username" required placeholder="请输入账号" className="focus-ring h-13 w-full rounded-[13px] border border-[var(--line-strong)] bg-white px-4 text-[16px] outline-none placeholder:text-[var(--muted-2)]"/></label>
        <label className="block"><span className="sr-only">密码</span><input name="password" type="password" autoComplete="current-password" required placeholder="请输入密码" className="focus-ring h-13 w-full rounded-[13px] border border-[var(--line-strong)] bg-white px-4 text-[16px] outline-none placeholder:text-[var(--muted-2)]"/></label>
        {error && <p role="alert" className="px-1 text-[13px] text-[#9d493c]">{error}</p>}
        <button disabled={pending} className="focus-ring h-13 w-full rounded-[13px] bg-[#172a21] text-[15px] font-semibold text-white disabled:opacity-60">{pending ? "正在登录…" : "登录"}</button>
      </form>
    </section>
  </main>;
}

function Drawer({ open, view, account, close, navigate, logout }: { open: boolean; view: View; account: Account; close: () => void; navigate: (view: View) => void; logout: () => void }) {
  return <>{open && <button aria-label="关闭菜单" onClick={close} className="fixed inset-0 z-40 bg-[#172a21]/18 backdrop-blur-[2px]"/>}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-[340px] flex-col bg-[#f4f6f3] px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="mb-8 flex items-center justify-between px-2"><span className="text-[13px] text-[var(--muted)]">{account.displayName}</span><button onClick={close} className="p-2"><X size={20}/></button></div>
      <nav className="space-y-1">{(["home", "foods", "nutrients", "supplements", "explore", "favorites", "verification"] as View[]).map((item) => {
        const Icon = item === "home" ? Search : item === "foods" ? Utensils : item === "nutrients" ? Leaf : item === "supplements" ? FlaskConical : item === "explore" ? Compass : item === "favorites" ? Bookmark : ShieldCheck;
        return <button key={item} onClick={() => { navigate(item); close(); }} className={`flex h-12 w-full items-center gap-4 rounded-xl px-3 text-[15px] ${view === item ? "bg-white font-semibold" : "text-[var(--muted)]"}`}><Icon size={19}/>{VIEW_LABELS[item]}</button>;
      })}</nav>
      <div className="mt-auto px-3"><button onClick={logout} className="flex h-12 items-center gap-4 text-[14px] text-[var(--muted)]"><LogOut size={18}/>退出并清除本机数据</button></div>
    </aside></>;
}

function TopBar({ title, onMenu, center }: { title?: string; onMenu: () => void; center?: React.ReactNode }) {
  return <header className="sticky top-0 z-30 grid h-[70px] grid-cols-[48px_1fr_48px] items-center bg-white/92 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
    <button aria-label="打开菜单" onClick={onMenu} className="grid size-11 place-items-center"><Menu size={23}/></button>
    <div className="min-w-0 text-center text-[15px] font-semibold">{center ?? title}</div><div/>
  </header>;
}

function SearchField({ value, setValue, autoFocus = false, bottom = false }: { value: string; setValue: (value: string) => void; autoFocus?: boolean; bottom?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) setTimeout(() => input.current?.focus(), 180); }, [autoFocus]);
  return <div className={`${bottom ? "fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[520px] px-5 pb-[max(18px,env(safe-area-inset-bottom))]" : "px-5 pb-5"}`}>
    <label className="focus-within:ring-3 focus-within:ring-[var(--focus)] flex h-14 items-center gap-3 rounded-[19px] border border-[var(--line-strong)] bg-white px-4 transition-shadow">
      <Search size={20} className="text-[var(--muted)]"/><input ref={input} type="search" inputMode="search" enterKeyHint="search" value={value} onChange={(event) => setValue(event.target.value)} placeholder="搜索食物、营养或健康问题" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[var(--muted-2)]"/>
    </label></div>;
}

function Home({ release, onMenu, navigate, search, setSearch, openItem }: { release: Release; onMenu: () => void; navigate: (v: View) => void; search: string; setSearch: (v: string) => void; openItem: (i: KnowledgeItem) => void }) {
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!search.trim()) { setSearchHits([]); setSearchFailed(false); return; }
    const timer = window.setTimeout(async () => {
      try {
        const hits = await searchRelease(release, search);
        if (!cancelled) { setSearchHits(hits.slice(0, 16)); setSearchFailed(false); }
      } catch { if (!cancelled) { setSearchHits([]); setSearchFailed(true); } }
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [release.manifest.search.baseUrl, search]);
  const results = searchHits.flatMap((hit) => {
    const item = release.objects.find((candidate) => candidate.id === hit.id);
    return item ? [{ item, excerpt: hit.excerpt, context: hit.context }] : [];
  });
  return <main className="min-h-dvh bg-[#fbfcfb] pb-28"><header className="grid h-[68px] grid-cols-[48px_1fr_48px] items-center px-4 pt-[env(safe-area-inset-top)]"><button aria-label="打开菜单" onClick={onMenu} className="grid size-11 place-items-center"><Menu size={22}/></button><span/><button aria-label="探索" onClick={() => navigate("explore")} className="grid size-11 place-items-center text-[var(--muted)]"><Compass size={20}/></button></header>
    {!search && <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-[94px] z-10 text-center font-mono text-[29px] font-semibold tracking-[-0.06em] text-[#172a21]/15">realfood</div>}
    <SearchField value={search} setValue={setSearch} bottom/>
    {search && <section className="px-5 pt-2">{results.length === 0 && <p className="py-8 text-center text-[14px] text-[var(--muted)]">{searchFailed ? "搜索暂时不可用，请检查网络或离线同步状态" : "没有找到相关知识"}</p>}{results.map(({ item, excerpt, context }) => <button data-search-result={item.id} key={item.id} onClick={() => openItem(item)} className="focus-ring block w-full border-b border-[var(--line)] px-1 py-4 text-left"><strong className="block truncate text-[16px] font-semibold tracking-[-0.01em]">{item.title}</strong>{context && <span data-search-context className="mt-1.5 block text-[11px] font-medium tracking-[0.02em] text-[var(--muted-2)]">{context}</span>}<span data-search-excerpt className={`${context ? "mt-0.5" : "mt-1.5"} line-clamp-2 block text-[13px] leading-5 text-[var(--muted)]`}><HighlightedExcerpt html={excerpt}/></span></button>)}</section>}
  </main>;
}

function CategoryPicker({ label, categories, active, setActive, allowAll = true, selectorTitle }: { label: string; categories: { name: string; count: number }[]; active: string; setActive: (value: string) => void; allowAll?: boolean; selectorTitle?: string }) {
  const [open, setOpen] = useState(false);
  const total = categories.reduce((sum, category) => sum + category.count, 0);
  const title = selectorTitle ?? `选择${label}分类`;
  const activeLabel = allowAll && active === "全部" ? `全部${label}` : active;
  const options = allowAll ? [{ name: "全部", count: total }, ...categories] : categories;
  return <Dialog open={open} onOpenChange={setOpen}>
    <button aria-label={title} aria-expanded={open} onClick={() => setOpen(true)} className="focus-ring inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-2 text-[15px] font-semibold">
      <span className="truncate">{activeLabel}</span><ChevronDown size={16} className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}/>
    </button>
    <DialogContent aria-describedby={undefined} className="mx-auto flex max-h-[76dvh] max-w-[520px] flex-col rounded-t-[28px] border-x-0 border-b-0 px-0 pb-[max(18px,env(safe-area-inset-bottom))] sm:inset-x-0 sm:bottom-0 sm:top-auto sm:max-h-[76dvh] sm:w-full sm:rounded-t-[28px] sm:rounded-b-none">
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--line-strong)]"/>
      <div className="shrink-0 px-6 pb-4 pt-5"><DialogTitle className="text-[20px] font-semibold tracking-[-0.025em]">{title}</DialogTitle><p className="mt-1 text-[13px] text-[var(--muted)]">{allowAll ? `当前共 ${total} 项` : `共 ${categories.length} 个主题`}</p></div>
      <div data-category-options className="no-scrollbar min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 pb-3">
        {options.map((option) => {
          const selected = active === option.name;
          return <button data-category-option key={option.name} onClick={() => { setActive(option.name); setOpen(false); }} className={`focus-ring flex min-h-14 w-full items-center rounded-[16px] px-4 text-left ${selected ? "bg-[#edf2ee]" : "bg-white"}`}>
            <span className={`min-w-0 flex-1 text-[14px] ${selected ? "font-semibold text-[var(--text)]" : "text-[var(--muted)]"}`}>{allowAll && option.name === "全部" ? `全部${label}` : option.name}</span>
            <span className="ml-3 text-[12px] tabular-nums text-[var(--muted-2)]">{option.count}</span>
            <span className="ml-3 grid size-5 shrink-0 place-items-center">{selected && <Check size={16}/>}</span>
          </button>;
        })}
      </div>
    </DialogContent>
  </Dialog>;
}

function TopicGroupPicker({ explore, topic, setTopic }: { explore: ExploreProjection; topic: string; setTopic: (value: string) => void }) {
  const selectedGroup = explore.groups.find((group) => group.topics.some((entry) => entry.name === topic)) ?? explore.groups[0];
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState(selectedGroup?.name ?? explore.defaultGroup);
  const activeGroup = explore.groups.find((group) => group.name === groupName) ?? selectedGroup;
  const selectGroup = (group: ExploreGroup) => {
    setGroupName(group.name);
    if (group.topics[0]) setTopic(group.topics[0].name);
  };
  const selectTopic = (name: string) => { setTopic(name); setOpen(false); };
  return <Dialog open={open} onOpenChange={setOpen}>
    <button aria-label="选择探索主题" aria-expanded={open} onClick={() => setOpen(true)} className="focus-ring inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-2 text-[15px] font-semibold">
      <span className="truncate">{topic}</span><ChevronDown size={16} className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}/>
    </button>
    <DialogContent aria-describedby={undefined} className="mx-auto flex max-h-[76dvh] max-w-[520px] flex-col rounded-t-[28px] border-x-0 border-b-0 px-0 pb-[max(18px,env(safe-area-inset-bottom))] sm:inset-x-0 sm:bottom-0 sm:top-auto sm:max-h-[76dvh] sm:w-full sm:rounded-t-[28px] sm:rounded-b-none">
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--line-strong)]"/>
      <div className="shrink-0 px-6 pb-4 pt-5"><DialogTitle className="text-[20px] font-semibold tracking-[-0.025em]">选择探索主题</DialogTitle><p className="mt-1 text-[13px] text-[var(--muted)]">先选分组，再选主题</p></div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(138px,0.82fr)_1fr] border-t border-[var(--line)]">
        <div data-explore-groups className="no-scrollbar min-h-0 overflow-y-auto overscroll-contain border-r border-[var(--line)] bg-[#f7f9f7] py-2">
          {explore.groups.map((group) => {
            const active = activeGroup?.name === group.name;
            return <button data-explore-group aria-pressed={active} key={group.name} onClick={() => selectGroup(group)} className={`focus-ring flex h-12 w-full items-center whitespace-nowrap px-4 text-left text-[13px] font-medium ${active ? "bg-white text-[var(--text)]" : "text-[var(--muted)]"}`}><span>{group.name}</span></button>;
          })}
        </div>
        <div data-explore-topics className="no-scrollbar min-h-0 overflow-y-auto overscroll-contain py-2">
          {(activeGroup?.topics ?? []).map((entry) => {
            const active = topic === entry.name;
            return <button data-explore-topic aria-pressed={active} key={entry.name} onClick={() => selectTopic(entry.name)} className={`focus-ring flex min-h-12 w-full items-center gap-3 px-4 text-left ${active ? "bg-[#edf2ee]" : "bg-white"}`}><span className="min-w-0 flex-1 text-[14px] font-medium">{entry.name}</span><span className="font-mono text-[11px] text-[var(--muted-2)]">{entry.count}</span></button>;
          })}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

function CollectionPage({ release, view, items, onMenu, openItem }: { release: Release; view: View; items: KnowledgeItem[]; onMenu: () => void; openItem: (i: KnowledgeItem) => void }) {
  const [category, setCategory] = useState("全部"); const [search, setSearch] = useState("");
  const [resultIds, setResultIds] = useState<string[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))], [items]);
  const categoryOptions = useMemo(() => categories.map((name) => ({ name, count: items.filter((item) => item.category === name).length })), [categories, items]);
  const collectionLabel = view === "foods" ? "食物" : view === "nutrients" ? "营养素" : view === "supplements" ? "补充剂" : "收藏";
  useEffect(() => { if (category !== "全部" && !categories.includes(category)) setCategory("全部"); }, [categories, category]);
  useEffect(() => {
    let cancelled = false;
    if (!search.trim()) { setResultIds(null); setSearchFailed(false); return; }
    const timer = window.setTimeout(async () => {
      try {
        const collection = view === "foods" ? "食物" : view === "nutrients" ? "营养素" : view === "supplements" ? "补充剂" : undefined;
        const hits = await searchRelease(release, search, collection);
        if (!cancelled) { setResultIds(hits.map((hit) => hit.id)); setSearchFailed(false); }
      } catch { if (!cancelled) { setResultIds([]); setSearchFailed(true); } }
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [release.manifest.search.baseUrl, search, view]);
  const visible = useMemo(() => items.filter((item) => (category === "全部" || item.category === category) && (resultIds === null || resultIds.includes(item.id))), [items, category, resultIds]);
  return <main className="min-h-dvh pb-10"><TopBar onMenu={onMenu} center={<CategoryPicker label={collectionLabel} categories={categoryOptions} active={category} setActive={setCategory}/>}/><SearchField value={search} setValue={setSearch}/>
    {view !== "foods" && <p className="px-6 pb-5 text-[13px] text-[var(--muted)]">共 {visible.length} 项</p>}
    {visible.length === 0 ? <p className="px-6 py-16 text-center text-[14px] text-[var(--muted)]">{searchFailed ? "搜索暂时不可用，请检查网络或离线同步状态" : "没有找到相关知识"}</p> : <section className="grid grid-cols-2 gap-x-3 gap-y-5 px-4">{visible.map((item) => <article key={item.id} className="min-w-0"><button onClick={() => openItem(item)} className="block w-full text-left"><div className="relative aspect-[1/0.9] overflow-hidden rounded-[22px] bg-[#f2f5f3]"><Image src={item.image} alt={item.title} fill sizes="45vw" className="object-contain p-3" unoptimized/>{item.collection !== "食物" && <span className="absolute bottom-3 left-3 rounded-lg bg-white/88 px-2.5 py-1 text-[13px] font-bold backdrop-blur">{symbolBySlug[item.slug] ?? item.title.slice(0, 2)}</span>}</div><h2 className="mt-3 truncate px-1 text-[15px] font-semibold">{item.title}</h2><p className="mt-1 px-1 text-[12px] text-[var(--muted)]">{item.collection === "食物" ? `${item.food?.relationCount ?? 0} 种营养成分` : item.category}</p></button></article>)}</section>}</main>;
}

type ActiveDetailPage = { id: string; slot: KnowledgeSlot; title: string; pageIntro?: string };

function slotForEntry(item: KnowledgeItem, entry: NavigationEntry) {
  const slot = item.slots[entry.slotKey];
  if (!slot || !entry.groupIndexes) return slot;
  const selectedGroups = entry.groupIndexes.map((index) => slot.groups[index]).filter(Boolean);
  const groups = entry.id === "forms" ? selectedGroups.flatMap((group) => group.subgroups.length ? group.subgroups : [group]) : selectedGroups;
  const markdown = groups.map((group) => `## ${group.title}\n\n${group.markdown}`).join("\n\n");
  return { ...slot, markdown, text: groups.map((group) => group.text).join(" "), groups };
}

function navigationEntries(item: KnowledgeItem) {
  const order = item.collection === "营养素"
    ? ["effects", "food-sources", "acquisition", "deficiency", "safety", "dosage"]
    : item.collection === "补充剂"
      ? ["effects", "food-sources", "forms", "selection", "safety", "dosage"]
      : [];
  return [...(item.navigation ?? [])].sort((a, b) => {
    const aIndex = order.indexOf(a.id); const bIndex = order.indexOf(b.id);
    return (aIndex < 0 ? order.length : aIndex) - (bIndex < 0 ? order.length : bIndex);
  });
}

function navigationTitle(item: KnowledgeItem, entry: NavigationEntry) {
  const itemName = item.title.replace(/\s+/g, "");
  if (entry.id === "effects" && ["营养素", "补充剂"].includes(item.collection)) return `${itemName}的作用和益处`;
  if (item.collection === "营养素" && entry.id === "food-sources") return item.slug === "vitamin-d" ? "维生素 D 的来源" : `哪些食物富含${itemName}？`;
  if (entry.id === "deficiency") return `${item.title}${/[A-Za-z0-9]$/.test(item.title) ? " " : ""}缺乏与不足`;
  return entry.title;
}

function slotPageTitle(item: KnowledgeItem, page: ActiveDetailPage) {
  const titles: Record<string, string> = {
    overview: "是什么？", effects: "作用和益处", "food-sources": "食物来源",
    forms: "有哪些形式？", selection: "如何选择？",
    relations: "相关营养与成分", classification: "食物分类",
  };
  if (page.id === "deficiency") return `${item.title}${/[A-Za-z0-9]$/.test(item.title) ? " " : ""}缺乏与不足`;
  return titles[page.id] ?? page.title;
}

function detailIntro(item: KnowledgeItem) {
  if (item.collection === "食物") return "";
  if (item.slug === "vitamin-c") return "人体无法自行合成，需要持续从食物中获得。";
  if (item.slug === "fish-oil") return "鱼油是 EPA 和 DHA 等 ω-3 脂肪酸的常见补充来源。";
  const overview = item.slots.overview?.text.replace(/^介绍\s*/, "").split(/[。！？]/)[0];
  return `${overview || item.description.replace(/[。.]$/, "")}。`;
}

function HeroVisual({ item }: { item: KnowledgeItem }) {
  const vitaminCFoods = ["红甜椒", "针叶樱桃", "奇异果"];
  if (item.slug === "vitamin-c") return <div className="grid h-[232px] grid-cols-3 items-center gap-3 px-4 py-3">{vitaminCFoods.map((food) => <div key={food} className="relative h-full min-w-0"><Image src={`/api/v1/assets/food-images/${encodeURIComponent(food)}.webp`} alt={food} fill sizes="30vw" className="object-contain" unoptimized/></div>)}</div>;
  return <div className="relative h-[232px]"><Image src={item.image} alt={item.title} fill sizes="90vw" className="object-contain p-4" unoptimized/></div>;
}

function Detail({ item, favorite, back, toggleFavorite, openRelated, relatedItems }: { item: KnowledgeItem; favorite: boolean; back: () => void; toggleFavorite: () => void; openRelated: (title: string) => void; relatedItems: KnowledgeItem[] }) {
  const [activePage, setActivePage] = useState<ActiveDetailPage | null>(null);
  useEffect(() => { window.scrollTo(0, 0); }, [item.id, activePage?.title]);
  if (activePage) return <SlotPage item={item} page={activePage} back={() => setActivePage(null)} openRelated={openRelated} relatedItems={relatedItems}/>;
  const overview = item.slots.overview;
  const isFood = item.collection === "食物";
  const foodCategory = item.classification?.subgroup ?? item.category;
  const subtype = item.collection === "营养素" ? item.tags[1] ?? item.category : item.category;
  const heroBackground = isFood ? "bg-[#f1f2f8]" : item.collection === "营养素" ? "bg-[#e9e9f8]" : "bg-[#f3e9d8]";
  const intro = detailIntro(item);
  return <main data-detail-page className="mx-auto min-h-dvh w-full max-w-[520px] bg-white pb-12"><header className="sticky top-0 z-30 grid h-[64px] grid-cols-[48px_1fr_48px] items-center bg-white/94 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl"><button aria-label="返回" onClick={back} className="grid size-11 place-items-center"><ArrowLeft size={22}/></button><span/><button onClick={toggleFavorite} aria-label={favorite ? "取消收藏" : "收藏"} className="grid size-11 place-items-center"><Bookmark size={21} fill={favorite ? "currentColor" : "none"}/></button></header>
    <section className={heroBackground}><HeroVisual item={item}/></section>
    <section className="px-6 pb-1 pt-6"><h1 className="text-[36px] font-semibold leading-none tracking-[-0.05em]">{item.title}</h1><p className="mt-3 text-[14px] leading-6 text-[var(--muted)]">{isFood ? foodCategory : subtype}</p>{intro && <p className="mt-4 text-[15px] leading-7 text-[var(--text)]">{intro}</p>}{overview && <button onClick={() => setActivePage({ id: "overview", slot: overview, title: `${item.title}是什么？` })} className="mt-4 flex items-center gap-1 text-[14px] font-semibold text-[var(--accent)]">详细解释 <ChevronRight size={16}/></button>}</section>
    <section data-detail-navigation className="px-6 pt-7"><h2 className="mb-3 text-[14px] font-medium text-[var(--muted)]">你想了解什么？</h2>
      {isFood && <><DetailLink icon={Sparkles} color="#e7e8f7" title="含有哪些营养成分？" description={`查看 ${item.food?.relationCount ?? 0} 种相关营养成分`} onClick={() => setActivePage({ id: "relations", slot: { key: "relations", label: "营养关系", sourceTitle: "营养关系", text: "", markdown: "", groups: [] }, title: "含有哪些营养成分？", pageIntro: `按类型查看与${item.title}相关的营养与补充成分。` })}/><DetailLink icon={Utensils} color="#e4f0e9" title="食物分类" description="查看大类与细类" onClick={() => item.food?.classification && setActivePage({ id: "classification", slot: item.food.classification, title: "属于哪类食物？" })}/></>}
      {navigationEntries(item).map((entry) => {
        const slot = slotForEntry(item, entry); const presentation = entryPresentation[entry.id] ?? slotPresentation[entry.slotKey] ?? { icon: BookOpenCheck, color: "#edf0ed" };
        const title = navigationTitle(item, entry);
        return slot && <DetailLink key={entry.id} icon={presentation.icon} color={presentation.color} title={title} description={entry.description} onClick={() => setActivePage({ id: entry.id, slot, title, pageIntro: entry.pageIntro })}/>;
      })}</section>
  </main>;
}

function DetailLink({ icon: Icon, color, title, description, onClick }: { icon: typeof Apple; color: string; title: string; description: string; onClick: () => void }) {
  return <button onClick={onClick} className="relative flex min-h-[76px] w-full items-center gap-4 text-left after:absolute after:bottom-0 after:left-[60px] after:right-0 after:h-px after:bg-[var(--line)] last:after:hidden"><span className="grid size-11 shrink-0 place-items-center rounded-[15px]" style={{ background: color }}><Icon size={20}/></span><span className="min-w-0"><strong className="block text-[16px] font-semibold">{title}</strong><span className="mt-1 block truncate text-[13px] text-[var(--muted)]">{description}</span></span><ChevronRight size={18} className="ml-auto shrink-0 text-[var(--muted-2)]"/></button>;
}

function overviewMarkdown(markdown: string) {
  return markdown.replace(/^##\s+介绍\s*/u, "").replace(/\n##\s+相关概念[\s\S]*$/u, "").trim();
}

function groupSummary(group: SlotGroup) {
  const text = (group.summary || group.text).replace(/来源[:：]\s*\S+/g, "").replace(/\s+/g, " ").trim();
  const summary = text.split(/[。；]/)[0];
  return summary.length > 52 ? `${summary.slice(0, 52)}…` : summary;
}

function RelationIndex({ relations, relatedItems, openRelated }: { relations: { title: string; href: string }[]; relatedItems: KnowledgeItem[]; openRelated: (title: string) => void }) {
  const labels = ["维生素", "矿物质", "其他营养成分", "相关补充剂"];
  const grouped = new Map(labels.map((label) => [label, [] as { title: string; item?: KnowledgeItem }[]]));
  for (const relation of relations) {
    const related = relatedItems.find((entry) => entry.title === relation.title);
    const label = related?.collection === "补充剂" ? "相关补充剂" : related?.title.startsWith("维生素") ? "维生素" : related?.category.includes("矿物质") ? "矿物质" : "其他营养成分";
    grouped.get(label)?.push({ title: relation.title, item: related });
  }
  return <div className="mt-8 space-y-7">{labels.map((label) => {
    const entries = grouped.get(label) ?? [];
    return entries.length > 0 && <section key={label}><div className="mb-3 flex items-baseline justify-between"><h2 className="text-[15px] font-semibold">{label}</h2><span className="font-mono text-[11px] text-[var(--muted-2)]">{entries.length} 项</span></div><div className="grid grid-cols-2 gap-2">{entries.map(({ title, item: related }) => <button onClick={() => openRelated(title)} key={title} className="flex min-h-14 items-center gap-3 rounded-[14px] border border-[var(--line)] bg-white px-3 text-left"><span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)] text-[10px] font-semibold">{related ? symbolBySlug[related.slug] ?? title.slice(0, 1) : title.slice(0, 1)}</span><strong className="min-w-0 text-[13px] font-semibold">{title}</strong></button>)}</div></section>;
  })}</div>;
}

function TaxonomyBlock({ item }: { item: KnowledgeItem }) {
  const classification = item.classification;
  if (!classification) return null;
  return <div className="mt-8 rounded-[20px] border border-[var(--line)] bg-white px-5"><section className="py-5"><span className="text-[12px] font-medium text-[var(--muted)]">大类</span><strong className="mt-2 block text-[18px] leading-7">{classification.group}</strong>{classification.groupCode && <span className="mt-1 block font-mono text-[11px] text-[var(--muted-2)]">GIFT {classification.groupCode}</span>}</section><div className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-[#e7efe9] text-[var(--muted)]"><ChevronDown size={15}/></span><span className="h-px flex-1 bg-[var(--line)]"/></div><section className="py-5"><span className="text-[12px] font-medium text-[var(--muted)]">细类</span><strong className="mt-2 block text-[18px] leading-7">{classification.subgroup}</strong>{classification.subgroupCode && <span className="mt-1 block font-mono text-[11px] text-[var(--muted-2)]">GIFT {classification.subgroupCode}</span>}</section></div>;
}

function SelectionChecklist({ markdown }: { markdown: string }) {
  const items = markdown.split("\n").map((line) => line.trim()).filter((line) => /^-\s+/.test(line)).map((line) => line.replace(/^-\s+/, ""));
  if (!items.length) return <MarkdownBody markdown={markdown}/>;
  return <ol className="mt-4 divide-y divide-[var(--line)]">{items.map((text, index) => <li key={`${text}-${index}`} className="grid grid-cols-[32px_1fr] gap-3 py-4"><span className="pt-0.5 font-mono text-[11px] text-[var(--muted-2)]">{String(index + 1).padStart(2, "0")}</span><span className="text-[14px] leading-7 text-[var(--muted)]">{text}</span></li>)}</ol>;
}

const detailRailColors = ["#dce5ff", "#f2dddd", "#dfead8", "#f3e6c9", "#e0e7e4", "#e8e1f1"];

type DetailTab<T extends string> = { key: T; label: string; groups: SlotGroup[] };

function DetailTabs<T extends string>({ tabs, active, setActive }: { tabs: DetailTab<T>[]; active: T; setActive: (key: T) => void }) {
  return <div data-detail-tabs className="-mx-1 overflow-x-auto border-b border-[var(--line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><div role="tablist" className="flex min-w-max gap-7 px-1">{tabs.map((tab) => <button key={tab.key} role="tab" aria-selected={active === tab.key} onClick={() => setActive(tab.key)} className={`relative pb-3 text-[14px] font-semibold transition-colors after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full ${active === tab.key ? "text-[var(--text)] after:bg-[var(--text)]" : "text-[var(--muted)] after:bg-transparent"}`}>{tab.label}</button>)}</div></div>;
}

function compactListSuitable(group: SlotGroup) {
  const items = group.markdown.split("\n").map((line) => line.trim()).filter((line) => /^-\s+/.test(line)).map((line) => line.replace(/^-\s+/, ""));
  if (items.length < 4) return false;
  return items.filter((item) => item.length <= 18).length / items.length >= 0.7;
}

function ExpandedGroup({ group, index, compact = false }: { group: SlotGroup; index: number; compact?: boolean }) {
  return <section data-expanded-detail-section className="py-5 first:pt-0"><div className="flex items-center gap-4"><span aria-hidden="true" className="h-8 w-1 shrink-0 rounded-full" style={{ background: detailRailColors[index % detailRailColors.length] }}/><h2 className="text-[18px] font-semibold leading-7">{group.title}</h2></div><div className="ml-5"><MarkdownBody markdown={group.markdown} compact={compact}/></div></section>;
}

type DeficiencyRole = "symptoms" | "risk";

function DeficiencyContent({ groups }: { groups: SlotGroup[] }) {
  const symptomGroups = groups.filter((group) => group.deficiencyRole === "symptoms");
  const riskGroups = groups.filter((group) => group.deficiencyRole === "risk");
  const unclassifiedGroups = groups.filter((group) => !group.deficiencyRole);
  const tabs = [
    symptomGroups.length ? { key: "symptoms" as const, label: "缺乏体征和症状", groups: symptomGroups } : null,
    riskGroups.length ? { key: "risk" as const, label: "易缺乏人群", groups: riskGroups } : null,
  ].filter((tab): tab is DetailTab<DeficiencyRole> => Boolean(tab));
  const [active, setActive] = useState<DeficiencyRole>(tabs[0]?.key ?? "symptoms");
  const visibleGroups = tabs.find((tab) => tab.key === active)?.groups ?? tabs[0]?.groups ?? [];
  return <div className="mt-8">{tabs.length > 1 && <DetailTabs tabs={tabs} active={active} setActive={setActive}/>}<div role={tabs.length > 1 ? "tabpanel" : undefined} className={tabs.length > 1 ? "mt-7" : ""}>{visibleGroups.map((group, index) => <ExpandedGroup key={`${group.title}-${index}`} group={group} index={index}/>)}{unclassifiedGroups.map((group, index) => <ExpandedGroup key={`${group.title}-unclassified-${index}`} group={group} index={index + visibleGroups.length}/>)}</div></div>;
}

type SafetyRole = "overuse" | "drug" | "nutrient";

function safetyRole(group: SlotGroup): SafetyRole | null {
  const title = group.title.replace(/\s+/g, "");
  if (/高[钙钾]血症.*(?:体征|症状)|过量.*(?:体征|症状|副作用)|(?:服用过量|过量[/／]中毒)$/.test(title)) return "overuse";
  if (/与.*药物.*(?:相互作用|同服)|药物.*相互作用|发生相互作用的药物|会降低下列药物的作用/.test(title)) return "drug";
  if (/与其他营养素|其他营养素.*相互作用|与其他物质.*相互作用|补充剂会降低.*作用|营养协同|与(?:维生素|钙|镁|铁|锌|铜|硒|碘|钾|钠).*相互作用/.test(title)) return "nutrient";
  return null;
}

function SafetyContent({ groups }: { groups: SlotGroup[] }) {
  const tabs = [
    { key: "overuse" as const, label: "服用过量体征和症状", groups: groups.filter((group) => safetyRole(group) === "overuse") },
    { key: "drug" as const, label: "与药物的相互作用", groups: groups.filter((group) => safetyRole(group) === "drug") },
    { key: "nutrient" as const, label: "与其他营养素的相互作用", groups: groups.filter((group) => safetyRole(group) === "nutrient") },
  ].filter((tab) => tab.groups.length > 0);
  const [active, setActive] = useState<SafetyRole>(tabs[0]?.key ?? "overuse");
  const importantGroups = groups.filter((group) => safetyRole(group) === null);
  const tabbed = tabs.length > 1;
  const visibleSpecialGroups = tabbed ? tabs.find((tab) => tab.key === active)?.groups ?? [] : tabs.flatMap((tab) => tab.groups);
  return <div className="mt-8">
    {tabbed && <DetailTabs tabs={tabs} active={active} setActive={setActive}/>}
    <div role={tabbed ? "tabpanel" : undefined} className={tabbed ? "mt-7" : ""}>{visibleSpecialGroups.map((group, index) => <ExpandedGroup key={`${group.title}-${index}`} group={group} index={index} compact={compactListSuitable(group)}/>)}</div>
    {importantGroups.length > 0 && <div data-important-safety-sections className={`${tabbed || visibleSpecialGroups.length ? "mt-4 border-t border-[var(--line)] pt-7" : ""}`}>{importantGroups.map((group, index) => <ExpandedGroup key={`${group.title}-${index}`} group={group} index={index + visibleSpecialGroups.length}/>)}</div>}
  </div>;
}

function detailPageIntro(page: ActiveDetailPage) {
  if (page.id === "deficiency") {
    const roles = new Set(page.slot.groups.map((group) => group.deficiencyRole).filter((role): role is DeficiencyRole => Boolean(role)));
    if (roles.size === 0) return "了解缺乏与不足相关信息。";
    if (roles.size > 1) return "了解缺乏与不足的常见表现及相关人群。";
    return roles.has("symptoms") ? "了解缺乏与不足的常见表现。" : "了解可能导致缺乏与不足的相关因素。";
  }
  if (page.id === "safety") return "了解服用风险、禁忌人群及可能的相互作用。";
  return page.pageIntro;
}

function SlotPage({ item, page, back, openRelated, relatedItems }: { item: KnowledgeItem; page: ActiveDetailPage; back: () => void; openRelated: (title: string) => void; relatedItems: KnowledgeItem[] }) {
  const { slot } = page;
  const relations = slot.key === "relations" ? item.food?.relations ?? [] : [];
  const foodLinks = slot.key === "foodSources" ? slot.groups.flatMap((group) => group.links) : [];
  const supportingGroups = slot.key === "foodSources" ? slot.groups.filter((group) => group.links.length === 0) : slot.groups;
  const collapsible = supportingGroups.length >= 4;
  const [open, setOpen] = useState<number | null>(collapsible ? 0 : null);
  const pageIntro = detailPageIntro(page);
  return <main className="min-h-dvh pb-12"><header className="sticky top-0 z-30 grid h-[64px] grid-cols-[48px_1fr_48px] items-center bg-white/94 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl"><button aria-label="返回" onClick={back} className="grid size-11 place-items-center"><ArrowLeft size={22}/></button><span className="truncate text-center text-[14px] font-semibold">{item.title}</span><div/></header>
    <article className="px-6 pb-10 pt-7"><h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.045em]">{slotPageTitle(item, page)}</h1>{pageIntro && <p className="mt-4 text-[15px] leading-7 text-[var(--muted)]">{pageIntro}</p>}
      {relations.length > 0 && <RelationIndex relations={relations} relatedItems={relatedItems} openRelated={openRelated}/>}
      {page.id === "classification" && <TaxonomyBlock item={item}/>}
      {foodLinks.length > 0 && <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-5">{foodLinks.map((food) => <button onClick={() => openRelated(food.title)} key={`${food.href}-${food.title}`} className="text-left"><div className="relative aspect-[1/0.92] overflow-hidden rounded-[18px] bg-[var(--surface-2)]"><Image src={`/api/v1/assets/food-images/${encodeURIComponent(food.slug)}.webp`} alt={food.title} fill sizes="42vw" className="object-contain p-3" unoptimized/></div><strong className="mt-2 block text-[14px]">{food.title}</strong></button>)}</div>}
      {slot.key === "overview" ? <MarkdownBody markdown={overviewMarkdown(slot.markdown)}/> : page.id === "deficiency" && supportingGroups.length > 0 ? <DeficiencyContent groups={supportingGroups}/> : page.id === "safety" && supportingGroups.length > 0 ? <SafetyContent groups={supportingGroups}/> : slot.key === "dosage" && supportingGroups.length > 0 ? <div className="mt-8 space-y-9">{supportingGroups.map((group, index) => <section key={`${group.title}-${index}`}><div className="mb-4 flex items-center gap-4"><span className="h-8 w-1 shrink-0 rounded-full" style={{ background: detailRailColors[index % detailRailColors.length] }}/><h2 className="text-[18px] font-semibold leading-7">{dosageGroupTitle(group)}</h2></div><DosageGroup group={group}/></section>)}</div> : supportingGroups.length > 0 && !collapsible ? <div className="mt-8">{supportingGroups.map((group, index) => page.id === "selection" ? <section key={`${group.title}-${index}`} className="py-5 first:pt-0"><div className="flex items-center gap-4"><span className="h-8 w-1 shrink-0 rounded-full" style={{ background: detailRailColors[index % detailRailColors.length] }}/><h2 className="text-[18px] font-semibold leading-7">{group.title}</h2></div><div className="ml-5"><SelectionChecklist markdown={group.markdown}/></div></section> : <ExpandedGroup key={`${group.title}-${index}`} group={group} index={index}/>)}</div> : supportingGroups.length > 0 ? <div className="mt-7 divide-y divide-[var(--line)]">{supportingGroups.map((group, index) => <section key={`${group.title}-${index}`} className="py-2"><button onClick={() => setOpen(open === index ? null : index)} className="focus-ring flex min-h-[72px] w-full items-center gap-4 rounded-xl py-2 text-left outline-none"><span className="h-9 w-1 shrink-0 rounded-full" style={{ background: detailRailColors[index % detailRailColors.length] }}/><span className="min-w-0 flex-1"><strong className="block text-[17px]">{group.title}</strong><span className="mt-1 block truncate text-[13px] text-[var(--muted)]">{groupSummary(group)}</span></span><ChevronDown size={18} className={`ml-auto shrink-0 text-[var(--muted-2)] transition-transform ${open === index ? "rotate-180" : ""}`}/></button>{open === index && <div className="mb-4 ml-5 border-l border-[var(--line-strong)] pl-4"><MarkdownBody markdown={group.markdown}/></div>}</section>)}</div> : relations.length === 0 && foodLinks.length === 0 && page.id !== "classification" ? <MarkdownBody markdown={slot.markdown}/> : null}</article></main>;
}

function dosageGroupTitle(group: SlotGroup) {
  if (/\|[^\n]+\|/.test(group.markdown) && /每日(?:服用剂量|摄入量)/.test(group.title)) return "每日参考摄入量";
  return group.title;
}

function DosageGroup({ group }: { group: SlotGroup }) {
  const lines = group.markdown.split("\n");
  const headerIndex = lines.findIndex((line, index) => line.trim().startsWith("|") && /^\|?\s*:?-{3,}/.test(lines[index + 1]?.trim().replace(/^\|\s*/, "") ?? ""));
  const visibleMarkdown = (markdown: string) => markdown.split("\n").filter((line) => !/^>\s*\*\*(?:暂分为|用量信息类型)/.test(line.trim())).join("\n").trim();
  if (headerIndex < 0) return <div className="ml-5"><MarkdownBody markdown={visibleMarkdown(group.markdown)}/></div>;
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  const headers = cells(lines[headerIndex]);
  const firstRowIndex = headerIndex + 2;
  let tableEndIndex = firstRowIndex;
  while (tableEndIndex < lines.length && lines[tableEndIndex].trim().startsWith("|")) tableEndIndex += 1;
  const rows = lines.slice(firstRowIndex, tableEndIndex).map(cells);
  const preamble = visibleMarkdown(lines.slice(0, headerIndex).join("\n"));
  const trailing = visibleMarkdown(lines.slice(tableEndIndex).join("\n"));
  if (headers.length > 2) return <>{preamble && <div className="mb-4 ml-5"><MarkdownBody markdown={preamble}/></div>}<div data-reference-table className="overflow-x-auto border-y border-[var(--line-strong)]"><table className="w-full min-w-[440px] border-collapse"><thead><tr>{headers.map((header) => <th key={header} className="border-b border-[var(--line)] px-3 py-3 text-left text-[12px] font-medium text-[var(--muted)] first:pl-0 last:pr-0">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-b border-[var(--line)] last:border-0">{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className={`px-3 py-4 text-[14px] first:pl-0 last:pr-0 ${cellIndex === 0 ? "text-[var(--muted)]" : "font-semibold text-[var(--text)]"}`}>{cell}</td>)}</tr>)}</tbody></table></div>{trailing && <div className="ml-5"><MarkdownBody markdown={trailing}/></div>}</>;
  return <>{preamble && <div className="mb-4 ml-5"><MarkdownBody markdown={preamble}/></div>}<div data-reference-table className="border-y border-[var(--line-strong)]"><div className="grid grid-cols-[1fr_auto] gap-5 border-b border-[var(--line)] py-3 text-[12px] font-medium text-[var(--muted)]"><span>{headers[0]}</span><span>{headers[1]}</span></div><dl>{rows.map((row, index) => <div key={`${row[0]}-${index}`} className="grid min-h-[64px] grid-cols-[1fr_auto] items-center gap-5 border-b border-[var(--line)] py-3.5 last:border-0"><dt className="text-[14px] leading-6 text-[var(--muted)]">{row[0]}</dt><dd className="text-right text-[15px] font-semibold text-[var(--text)]">{row[1]}</dd></div>)}</dl></div>{trailing && <div className="ml-5"><MarkdownBody markdown={trailing}/></div>}</>;
}

function MarkdownBody({ markdown, compact = false }: { markdown: string; compact?: boolean }) {
  return <div className={`knowledge-markdown mt-5 text-[14px] leading-7 text-[var(--muted)] ${compact ? "knowledge-markdown--compact" : ""}`}><ReactMarkdown components={{ img: () => null, a: ({ children }) => <strong>{children}</strong> }}>{markdown}</ReactMarkdown></div>;
}

function Explore({ explore, items, onMenu, openItem }: { explore: ExploreProjection; items: KnowledgeItem[]; onMenu: () => void; openItem: (item: KnowledgeItem) => void }) {
  const [topic, setTopic] = useState(explore.defaultTopic);
  const related = items.filter((item) => item.topicTags.includes(topic));
  return <main className="min-h-dvh"><TopBar onMenu={onMenu} center={<TopicGroupPicker explore={explore} topic={topic} setTopic={setTopic}/>}/><section className="px-6 pb-12 pt-10"><div data-explore-active-topic className="mx-auto grid size-24 place-items-center rounded-full bg-[#172a21] text-center text-[16px] font-semibold text-white">{topic}</div><div className="mx-auto h-12 w-px bg-[var(--line-strong)]"/><div className="grid grid-cols-2 gap-3">{related.map((item) => <button key={item.id} onClick={() => openItem(item)} className="rounded-[20px] border bg-[var(--surface-2)] p-4 text-left"><span className="text-[12px] text-[var(--muted)]">{item.collection}</span><strong className="mt-2 block text-[15px]">{item.title}</strong></button>)}</div></section></main>;
}

function LegacyExplore({ items, onMenu, openItem }: { items: KnowledgeItem[]; onMenu: () => void; openItem: (item: KnowledgeItem) => void }) {
  const topics = useMemo(() => [...new Set(items.flatMap((item) => item.topicTags))], [items]);
  const [topic, setTopic] = useState(topics[0] ?? "");
  const related = items.filter((item) => item.topicTags.includes(topic));
  const topicOptions = useMemo(() => topics.map((name) => ({ name, count: items.filter((item) => item.topicTags.includes(name)).length })), [items, topics]);
  return <main className="min-h-dvh"><TopBar onMenu={onMenu} center={<CategoryPicker label="探索主题" selectorTitle="选择探索主题" categories={topicOptions} active={topic} setActive={setTopic} allowAll={false}/>}/><section className="px-6 pb-12 pt-10"><div data-explore-active-topic className="mx-auto grid size-24 place-items-center rounded-full bg-[#172a21] text-center text-[16px] font-semibold text-white">{topic}</div><div className="mx-auto h-12 w-px bg-[var(--line-strong)]"/><div className="grid grid-cols-2 gap-3">{related.map((item) => <button key={item.id} onClick={() => openItem(item)} className="rounded-[20px] border bg-[var(--surface-2)] p-4 text-left"><span className="text-[12px] text-[var(--muted)]">{item.collection}</span><strong className="mt-2 block text-[15px]">{item.title}</strong></button>)}</div></section></main>;
}

function Verification({ onMenu, marks }: { onMenu: () => void; marks: { name: string; description: string; image: string }[] }) {
  return <main className="min-h-dvh"><TopBar title="验证标志" onMenu={onMenu}/><p className="px-6 pb-5 pt-4 text-[14px] leading-6 text-[var(--muted)]">这些标志分别验证成分、污染物、生产过程或特定标准，不等同于产品功效。</p><section className="space-y-3 px-5 pb-10">{marks.map((mark) => <details key={mark.name} className="group rounded-[20px] border p-4"><summary className="flex cursor-pointer list-none items-center gap-4"><span className="relative block size-16 shrink-0"><Image src={mark.image} alt={mark.name} fill className="object-contain" unoptimized/></span><strong className="text-[15px]">{mark.name}</strong><ChevronDown size={17} className="ml-auto text-[var(--muted)] transition-transform group-open:rotate-180"/></summary><p className="mt-3 border-t pt-3 text-[14px] leading-7 text-[var(--muted)]">{mark.description}</p></details>)}</section></main>;
}

export function HandbookApp() {
  const initialLoadStarted = useRef(false);
  const privacyGeneration = useRef(0);
  const [account, setAccount] = useState<Account | null>(null); const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true); const [view, setView] = useState<View>("home"); const [drawer, setDrawer] = useState(false);
  const [selected, setSelected] = useState<KnowledgeItem | null>(null); const [search, setSearch] = useState(""); const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const accountKey = (accountId: string, key: string) => `account:${accountId}:${key}`;
  function clearRenderedPrivateState() {
    privacyGeneration.current += 1;
    setAccount(null); setRelease(null); setFavoriteIds(new Set()); setSelected(null);
    setView("home"); setDrawer(false); setSearch(""); setLoading(false);
  }
  async function acceptLogoutEvent() {
    clearRenderedPrivateState();
    await clearOfflineData();
  }
  function announceLogout() {
    const event = `${Date.now()}:${crypto.randomUUID?.() ?? Math.random()}`;
    localStorage.setItem("ihealth-logout-generation", event);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("ihealth-private-session");
      channel.postMessage({ type: "logout", event });
      channel.close();
    }
  }

  async function loadPrivateData(knownAccount?: Account | null) {
    const generation = privacyGeneration.current;
    if (!knownAccount && localStorage.getItem("ihealth-logout-pending") === "1") {
      try { await api("/api/v1/auth/logout", { method: "POST" }); localStorage.removeItem("ihealth-logout-pending"); }
      catch { setLoading(false); return; }
    }
    const cachedAccount = knownAccount ?? await readOffline<Account>("account");
    const cachedRelease = cachedAccount ? await readOffline<Release>(accountKey(cachedAccount.id, "release")) : null;
    const cachedFavorites = cachedAccount ? await readOffline<string[]>(accountKey(cachedAccount.id, "favorites")) : null;
    if (generation === privacyGeneration.current && cachedAccount && cachedRelease) {
      setAccount(cachedAccount); setRelease(cachedRelease); setFavoriteIds(new Set(cachedFavorites ?? [])); setLoading(false);
    }
    if (generation !== privacyGeneration.current) return;
    try {
      const me = await api<{ account: Account }>("/api/v1/auth/me");
      const freshRelease = await api<Release>("/api/v1/releases/current");
      if (!(await validRelease(freshRelease))) throw new Error("知识版本校验失败");
      await prefetchSearch(freshRelease);
      const queueKey = accountKey(me.account.id, "favorite-queue");
      const pending = await readOffline<FavoriteOperation[]>(queueKey) ?? [];
      const remaining: FavoriteOperation[] = [];
      for (const operation of pending) {
        if (operation.accountId !== me.account.id || generation !== privacyGeneration.current) continue;
        try { await api("/api/v1/favorites", { method: "PUT", body: JSON.stringify(operation) }); }
        catch { remaining.push(operation); }
      }
      if (generation !== privacyGeneration.current) return;
      await writeOffline(queueKey, remaining);
      const serverFavorites = await api<{ items: { objectId: string; deleted: boolean }[] }>("/api/v1/favorites");
      const ids = serverFavorites.items.filter((item) => !item.deleted).map((item) => item.objectId);
      if (generation !== privacyGeneration.current) return;
      await Promise.all([writeOffline("account", me.account), writeOffline(accountKey(me.account.id, "release"), freshRelease), writeOffline(accountKey(me.account.id, "favorites"), ids)]);
      setAccount(me.account); setRelease(freshRelease); setFavoriteIds(new Set(ids));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { await clearOfflineData(); setAccount(null); setRelease(null); setFavoriteIds(new Set()); }
      else if (!cachedAccount || !cachedRelease) { setAccount(null); setRelease(null); }
    }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void loadPrivateData();
  }, []);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === "ihealth-logout-generation" && event.newValue) void acceptLogoutEvent(); };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("ihealth-private-session") : null;
    if (channel) channel.onmessage = (event) => { if (event.data?.type === "logout") void acceptLogoutEvent(); };
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("storage", onStorage); channel?.close(); };
  }, []);
  useEffect(() => {
    if (!account) return;
    let checking = false;
    const revalidate = async () => {
      if (checking || !navigator.onLine || document.visibilityState === "hidden") return;
      checking = true;
      try { await api("/api/v1/auth/me"); }
      catch (error) {
        if (error instanceof ApiError && error.status === 401) { announceLogout(); await acceptLogoutEvent(); }
      } finally { checking = false; }
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => { window.removeEventListener("focus", revalidate); document.removeEventListener("visibilitychange", revalidate); };
  }, [account?.id]);
  async function login(success: Account) { setLoading(true); await loadPrivateData(success); }
  async function logout() {
    try { await api("/api/v1/auth/logout", { method: "POST" }); localStorage.removeItem("ihealth-logout-pending"); }
    catch { localStorage.setItem("ihealth-logout-pending", "1"); }
    announceLogout(); await acceptLogoutEvent();
  }
  async function toggleFavorite(item: KnowledgeItem) {
    if (!account) return;
    const accountId = account.id; const generation = privacyGeneration.current; const queueKey = accountKey(accountId, "favorite-queue");
    const next = new Set(favoriteIds); const favorite = !next.has(item.id); favorite ? next.add(item.id) : next.delete(item.id); setFavoriteIds(next);
    if (generation !== privacyGeneration.current) return;
    await writeOffline(accountKey(accountId, "favorites"), [...next]);
    if (generation !== privacyGeneration.current) return;
    const operation = { accountId, objectId: item.id, favorite, updatedAt: new Date().toISOString() };
    const queue = (await readOffline<FavoriteOperation[]>(queueKey) ?? []).filter((entry) => entry.objectId !== item.id);
    if (generation !== privacyGeneration.current) return;
    await writeOffline(queueKey, [...queue, operation]);
    try {
      await api("/api/v1/favorites", { method: "PUT", body: JSON.stringify(operation) });
      if (generation === privacyGeneration.current) await writeOffline(queueKey, queue);
    } catch {}
  }
  if (loading && !release) return <div className="grid min-h-dvh place-items-center text-[14px] text-[var(--muted)]">正在打开家庭知识…</div>;
  if (!account || !release) return <Login onSuccess={login}/>;
  const primary = release.objects.filter((item) => item.surface === "primary");
  const collection = view === "foods" ? "食物" : view === "nutrients" ? "营养素" : "补充剂";
  let collectionItems = primary.filter((item) => item.collection === collection);
  if (view === "foods") collectionItems.sort((a, b) => (b.food?.relationCount ?? 0) - (a.food?.relationCount ?? 0) || a.title.localeCompare(b.title, "zh-CN"));
  else collectionItems.sort((a, b) => (a.rawOrder ?? 999) - (b.rawOrder ?? 999));
  const openRelated = (title: string) => { const found = primary.find((item) => item.title === title); if (found) setSelected(found); };
  if (selected) return <Detail key={selected.id} item={selected} favorite={favoriteIds.has(selected.id)} back={() => setSelected(null)} toggleFavorite={() => toggleFavorite(selected)} openRelated={openRelated} relatedItems={primary}/>;
  return <div className="mx-auto min-h-dvh w-full max-w-[520px] bg-white"><Drawer open={drawer} view={view} account={account} close={() => setDrawer(false)} navigate={setView} logout={logout}/>
    {view === "home" && <Home release={release} onMenu={() => setDrawer(true)} navigate={setView} search={search} setSearch={setSearch} openItem={setSelected}/>}
    {["foods", "nutrients", "supplements"].includes(view) && <CollectionPage release={release} view={view} items={collectionItems} onMenu={() => setDrawer(true)} openItem={setSelected}/>}
    {view === "explore" && (release.explore
      ? <Explore explore={release.explore} items={primary.filter((item) => item.topicTags.length)} onMenu={() => setDrawer(true)} openItem={setSelected}/>
      : <LegacyExplore items={primary.filter((item) => item.topicTags.length)} onMenu={() => setDrawer(true)} openItem={setSelected}/>)}
    {view === "verification" && <Verification onMenu={() => setDrawer(true)} marks={release.objects.find((item) => item.title === "第三方验证标志")?.verificationMarks ?? []}/>}
    {view === "favorites" && <CollectionPage release={release} view={view} items={primary.filter((item) => favoriteIds.has(item.id))} onMenu={() => setDrawer(true)} openItem={setSelected}/>}
  </div>;
}
