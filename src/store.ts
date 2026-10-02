import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Library, Volume } from "./lib/types";
import { emptyLibrary } from "./lib/types";
import type { Lang } from "./lib/i18n";
import { uid } from "./lib/util";
import type { ScanProgress } from "./lib/scan";

export const THEMES = [
  { id: "dark", name: "Dark" },
  { id: "light", name: "Light" },
  { id: "sunrise", name: "Sunrise" },
  { id: "ember", name: "Ember Night" },
  { id: "eclipse", name: "Eclipse" },
  { id: "sepia", name: "Sepia" },
  { id: "amoled", name: "True Black" },
  { id: "forest", name: "Forest" },
  { id: "ocean", name: "Ocean" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];

export type PageMode = "single" | "double" | "webtoon";
export type ReadDir = "rtl" | "ltr" | "vertical";
/** "manual" = user typed / wheel-zoomed to a fixed percentage. */
export type FitMode = "screen" | "width" | "height" | "original" | "manual";

export interface Settings {
  lang: Lang;
  theme: ThemeId;
  showGroupTiles: boolean;
  // reader defaults
  mode: PageMode;
  direction: ReadDir;
  fit: FitMode;
  firstPageAlone: boolean;
  gap: number;
  webtoonGap: number;
  webtoonMaxWidth: number;
  webtoonSpeed: number;
  // zoom & input
  zoom: number;
  zoomStep: number;
  minZoom: number;
  tapZones: "default" | "reversed" | "off";
  tapZoneSize: number;
  swipe: boolean;
  volumeKeys: boolean;
  smartScroll: boolean;
  scrollPastEnd: boolean;
  // page turn
  turnDirection: "follow" | "right" | "left";
  invertTap: boolean;
  invertSwipe: boolean;
  invertKeys: boolean;
  invertWheel: boolean;
  transition: "slide" | "fade" | "none";
  transitionSpeed: number;
  // light
  brightness: number;
  dim: number;
  warmth: number;
  rememberLight: boolean;
  // performance
  prerender: "volume" | "window";
  windowSize: number;
  renderQuality: number;
  hwAccel: boolean;
  thumbCacheMB: number;
  // library
  sortBy: "name" | "added" | "lastRead";
  density: "comfortable" | "compact";
  autoMarkRead: boolean;
  // reader ui state
  showPageIndicator: boolean;
  thumbsPanel: boolean;
  keymap: Record<string, string>;
}

export const DEFAULT_KEYMAP: Record<string, string> = {
  nextPage: "ArrowRight",
  prevPage: "ArrowLeft",
  nextVolume: "]",
  prevVolume: "[",
  toggleUI: "h",
  toggleThumbs: "t",
  zoomIn: "Ctrl++",
  zoomOut: "Ctrl+-",
  resetZoom: "Ctrl+0",
  cycleMode: "m",
  cycleDirection: "d",
  bookmark: "b",
  fullscreen: "f",
};

export const DEFAULT_SETTINGS: Settings = {
  lang: "en",
  theme: "dark",
  showGroupTiles: true,
  mode: "single",
  direction: "rtl",
  fit: "screen",
  firstPageAlone: true,
  gap: 8,
  webtoonGap: 0,
  webtoonMaxWidth: 900,
  webtoonSpeed: 60,
  zoom: 1,
  zoomStep: 0.05,
  minZoom: 0.25,
  tapZones: "default",
  tapZoneSize: 28,
  swipe: true,
  volumeKeys: true,
  smartScroll: false,
  scrollPastEnd: false,
  turnDirection: "follow",
  invertTap: false,
  invertSwipe: false,
  invertKeys: false,
  invertWheel: false,
  transition: "slide",
  transitionSpeed: 220,
  brightness: 100,
  dim: 0,
  warmth: 0,
  rememberLight: true,
  prerender: "volume",
  windowSize: 40,
  renderQuality: 85,
  hwAccel: true,
  thumbCacheMB: 120,
  sortBy: "name",
  density: "comfortable",
  autoMarkRead: true,
  showPageIndicator: true,
  thumbsPanel: false,
  keymap: { ...DEFAULT_KEYMAP },
};

export interface ProgressEntry {
  page: number;
  total: number;
  updatedAt: number;
  read: boolean;
}
export interface HistoryEntry {
  volumeId: string;
  seriesId: string;
  at: number;
  page: number;
  total: number;
}
export interface Category {
  id: string;
  name: string;
}
export interface CoverOverride {
  volumeId: string;
  page: number;
}
export interface SeriesSettings {
  direction?: ReadDir;
}

export type Route =
  | { name: "library" }
  | { name: "series"; seriesId: string }
  | { name: "reader"; volumeId: string }
  | { name: "history" }
  | { name: "settings" };

export interface Toast {
  id: string;
  text: string;
}

interface AppState {
  settings: Settings;
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  setMany: (p: Partial<Settings>) => void;

  progress: Record<string, ProgressEntry>;
  bookmarks: Record<string, number[]>;
  categories: Category[];
  assignments: Record<string, string[]>;
  descriptions: Record<string, string>;
  coverOverrides: Record<string, CoverOverride>;
  seriesSettings: Record<string, SeriesSettings>;
  history: HistoryEntry[];
  addedAt: Record<string, number>;

  // runtime (not persisted)
  lib: Library;
  libStatus: "none" | "scanning" | "ready";
  scan: ScanProgress | null;
  groupId: string | null;
  activeCategory: string | null;
  query: string;
  route: Route;
  stack: Route[];
  toasts: Toast[];

  nav: (r: Route) => void;
  back: () => void;
  setLibrary: (lib: Library) => void;
  setLibStatus: (s: AppState["libStatus"], scan?: ScanProgress | null) => void;
  updateVolume: (v: Volume) => void;
  setGroup: (id: string | null) => void;
  setCategory: (id: string | null) => void;
  setQuery: (q: string) => void;

  saveProgress: (volumeId: string, seriesId: string, page: number, total: number) => void;
  setRead: (volumeId: string, read: boolean, total?: number) => void;
  toggleBookmark: (volumeId: string, page: number) => void;
  clearBookmarks: (volumeId: string) => void;
  clearHistory: () => void;

  addCategory: (name: string) => void;
  renameCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
  moveCategory: (id: string, dir: -1 | 1) => void;
  toggleAssignment: (seriesId: string, catId: string) => void;

  setDescription: (seriesId: string, text: string) => void;
  setCoverOverride: (key: string, o: CoverOverride | null) => void;

  toast: (text: string) => void;
  dropToast: (id: string) => void;
  resetAll: () => void;
  importData: (data: any) => void;
  exportData: () => any;
}

const PERSIST_KEYS = [
  "settings",
  "progress",
  "bookmarks",
  "categories",
  "assignments",
  "descriptions",
  "coverOverrides",
  "seriesSettings",
  "history",
  "addedAt",
] as const;

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      settings: { ...DEFAULT_SETTINGS },
      set: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
      setMany: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),

      progress: {},
      bookmarks: {},
      categories: [
        { id: "c_reading", name: "Reading" },
        { id: "c_fav", name: "Favorites" },
      ],
      assignments: {},
      descriptions: {},
      coverOverrides: {},
      seriesSettings: {},
      history: [],
      addedAt: {},

      lib: emptyLibrary(),
      libStatus: "none",
      scan: null,
      groupId: null,
      activeCategory: null,
      query: "",
      route: { name: "library" },
      stack: [],
      toasts: [],

      nav: (r) => set((s) => ({ route: r, stack: [...s.stack, s.route] })),
      back: () =>
        set((s) => {
          const stack = [...s.stack];
          const prev = stack.pop() ?? { name: "library" as const };
          return { route: prev, stack };
        }),
      setLibrary: (lib) =>
        set((s) => {
          const addedAt = { ...s.addedAt };
          const now = Date.now();
          Object.keys(lib.series).forEach((id) => {
            if (!addedAt[id]) addedAt[id] = now;
          });
          return { lib, libStatus: "ready", scan: null, addedAt, groupId: null };
        }),
      setLibStatus: (libStatus, scan = null) => set({ libStatus, scan }),
      updateVolume: (v) =>
        set((s) => ({ lib: { ...s.lib, volumes: { ...s.lib.volumes, [v.id]: v } } })),
      setGroup: (groupId) => set({ groupId }),
      setCategory: (activeCategory) => set({ activeCategory }),
      setQuery: (query) => set({ query }),

      saveProgress: (volumeId, seriesId, page, total) =>
        set((s) => {
          const prev = s.progress[volumeId];
          const read = prev?.read || (s.settings.autoMarkRead && page >= total - 1);
          const entry: ProgressEntry = { page, total, updatedAt: Date.now(), read };
          const history = [
            { volumeId, seriesId, at: Date.now(), page, total },
            ...s.history.filter((h) => h.volumeId !== volumeId),
          ].slice(0, 100);
          return { progress: { ...s.progress, [volumeId]: entry }, history };
        }),
      setRead: (volumeId, read, total) =>
        set((s) => {
          const prev = s.progress[volumeId];
          return {
            progress: {
              ...s.progress,
              [volumeId]: {
                page: read ? (total ?? prev?.total ?? 1) - 1 : 0,
                total: total ?? prev?.total ?? 0,
                updatedAt: Date.now(),
                read,
              },
            },
          };
        }),
      toggleBookmark: (volumeId, page) =>
        set((s) => {
          const list = s.bookmarks[volumeId] ?? [];
          const next = list.includes(page)
            ? list.filter((p) => p !== page)
            : [...list, page].sort((a, b) => a - b);
          return { bookmarks: { ...s.bookmarks, [volumeId]: next } };
        }),
      clearBookmarks: (volumeId) =>
        set((s) => {
          const b = { ...s.bookmarks };
          delete b[volumeId];
          return { bookmarks: b };
        }),
      clearHistory: () => set({ history: [] }),

      addCategory: (name) =>
        set((s) => ({ categories: [...s.categories, { id: uid("c"), name }] })),
      renameCategory: (id, name) =>
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, name } : c)),
        })),
      deleteCategory: (id) =>
        set((s) => {
          const assignments: Record<string, string[]> = {};
          Object.entries(s.assignments).forEach(([k, v]) => {
            assignments[k] = v.filter((c) => c !== id);
          });
          return {
            categories: s.categories.filter((c) => c.id !== id),
            assignments,
            activeCategory: s.activeCategory === id ? null : s.activeCategory,
          };
        }),
      moveCategory: (id, dir) =>
        set((s) => {
          const list = [...s.categories];
          const i = list.findIndex((c) => c.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= list.length) return {};
          [list[i], list[j]] = [list[j], list[i]];
          return { categories: list };
        }),
      toggleAssignment: (seriesId, catId) =>
        set((s) => {
          const cur = s.assignments[seriesId] ?? [];
          const next = cur.includes(catId)
            ? cur.filter((c) => c !== catId)
            : [...cur, catId];
          return { assignments: { ...s.assignments, [seriesId]: next } };
        }),

      setDescription: (seriesId, text) =>
        set((s) => ({ descriptions: { ...s.descriptions, [seriesId]: text } })),
      setCoverOverride: (key, o) =>
        set((s) => {
          const next = { ...s.coverOverrides };
          if (o) next[key] = o;
          else delete next[key];
          return { coverOverrides: next };
        }),

      toast: (text) => {
        const id = uid("t");
        set((s) => ({ toasts: [...s.toasts, { id, text }] }));
        setTimeout(() => get().dropToast(id), 2600);
      },
      dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      resetAll: () =>
        set({
          settings: { ...DEFAULT_SETTINGS },
          progress: {},
          bookmarks: {},
          categories: [],
          assignments: {},
          descriptions: {},
          coverOverrides: {},
          seriesSettings: {},
          history: [],
        }),
      exportData: () => {
        const s = get();
        const out: any = { app: "kuro-manga", version: 1, exportedAt: Date.now() };
        PERSIST_KEYS.forEach((k) => (out[k] = (s as any)[k]));
        return out;
      },
      importData: (data) => {
        const patch: any = {};
        PERSIST_KEYS.forEach((k) => {
          if (data && data[k] !== undefined) patch[k] = data[k];
        });
        if (patch.settings)
          patch.settings = { ...DEFAULT_SETTINGS, ...patch.settings, keymap: { ...DEFAULT_KEYMAP, ...(patch.settings.keymap || {}) } };
        set(patch);
      },
    }),
    {
      name: "kuro-manga-db",
      partialize: (s) => {
        const out: any = {};
        PERSIST_KEYS.forEach((k) => (out[k] = (s as any)[k]));
        return out;
      },
      merge: (persisted: any, current) => {
        const next = { ...current, ...(persisted || {}) };
        next.settings = {
          ...DEFAULT_SETTINGS,
          ...(persisted?.settings || {}),
          keymap: { ...DEFAULT_KEYMAP, ...(persisted?.settings?.keymap || {}) },
        };
        return next;
      },
    },
  ),
);

export const useT = () => {
  const lang = useApp((s) => s.settings.lang);
  return lang;
};
