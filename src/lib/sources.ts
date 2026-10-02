import { extractEntry, extractText, readZipIndex, type ZipEntry } from "./zip";
import { isImageName, isJunk, natCompare } from "./util";
import type { ComicMeta, FileRef } from "./types";

/**
 * Page-source layer. The reader only ever talks to this interface, so new
 * archive formats (CBR/CB7/...) can be added later without touching the reader.
 */
export interface PageSource {
  readonly id: string;
  readonly kind: string;
  /** natural-sorted page names (full internal path for archives) */
  list(): Promise<string[]>;
  /** extract a single page on demand */
  load(index: number): Promise<Blob>;
  meta?(): Promise<ComicMeta | null>;
}

/* ------------------------------------------------------------------ */
/* CBZ                                                                 */
/* ------------------------------------------------------------------ */
export class CbzSource implements PageSource {
  readonly kind = "cbz";
  private entries: ZipEntry[] | null = null;
  private pages: ZipEntry[] = [];
  private indexing: Promise<string[]> | null = null;
  private comic: ComicMeta | null | undefined;

  constructor(readonly id: string, private ref: FileRef) {}

  private async index(): Promise<string[]> {
    if (!this.indexing) {
      this.indexing = (async () => {
        const file = await this.ref.getFile();
        this.entries = await readZipIndex(file);
        this.pages = this.entries
          .filter((e) => !e.name.endsWith("/") && isImageName(e.name) && !isJunk(baseName(e.name)))
          .sort((a, b) => natCompare(a.name, b.name));
        if (!this.pages.length) throw new Error("no readable pages in archive");
        return this.pages.map((p) => p.name);
      })();
    }
    return this.indexing;
  }

  list() {
    return this.index();
  }

  async load(index: number): Promise<Blob> {
    await this.index();
    const e = this.pages[index];
    if (!e) throw new Error("page out of range");
    const file = await this.ref.getFile();
    return extractEntry(file, e);
  }

  async meta(): Promise<ComicMeta | null> {
    if (this.comic !== undefined) return this.comic;
    try {
      await this.index();
      const info = this.entries?.find((e) => /comicinfo\.xml$/i.test(e.name));
      if (!info) return (this.comic = null);
      const xml = await extractText(await this.ref.getFile(), info);
      this.comic = parseComicInfo(xml);
    } catch {
      this.comic = null;
    }
    return this.comic;
  }
}

function baseName(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}

export function parseComicInfo(xml: string): ComicMeta {
  const pick = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
    return m ? m[1].trim() : undefined;
  };
  return {
    title: pick("Title"),
    series: pick("Series"),
    summary: pick("Summary"),
    writer: pick("Writer") || pick("Penciller"),
    genre: pick("Genre"),
  };
}

/* ------------------------------------------------------------------ */
/* Plain image folder                                                  */
/* ------------------------------------------------------------------ */
export class FolderSource implements PageSource {
  readonly kind = "folder";
  constructor(readonly id: string, private files: FileRef[]) {
    this.files = [...files].sort((a, b) => natCompare(a.name, b.name));
  }
  async list() {
    return this.files.map((f) => f.name);
  }
  async load(index: number) {
    const f = this.files[index];
    if (!f) throw new Error("page out of range");
    return await f.getFile();
  }
}

/* ------------------------------------------------------------------ */
/* Demo (procedurally drawn pages — used when no folder is linked)     */
/* ------------------------------------------------------------------ */
export class DemoSource implements PageSource {
  readonly kind = "demo";
  constructor(
    readonly id: string,
    private pages: number,
    private seed: number,
    private label: string,
  ) {}
  async list() {
    return Array.from({ length: this.pages }, (_, i) => `${this.label}/${String(i + 1).padStart(3, "0")}.png`);
  }
  async load(index: number) {
    return drawDemoPage(this.seed + index * 37, index + 1, this.pages, this.label);
  }
}

const palettes = [
  ["#f2efe7", "#1b1b1f", "#d94f4f"],
  ["#eef3f7", "#13202b", "#2f7fb8"],
  ["#f7f1e8", "#241a12", "#b4712a"],
  ["#eef7f1", "#10241a", "#2f9e6b"],
  ["#f6eef7", "#1f1326", "#8a4fd9"],
];

async function drawDemoPage(seed: number, page: number, total: number, label: string): Promise<Blob> {
  const W = 900;
  const wide = seed % 11 === 0 && page > 1; // occasional double spread
  const H = wide ? 650 : 1300;
  const canvas = document.createElement("canvas");
  canvas.width = wide ? 1500 : W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const pal = palettes[seed % palettes.length];
  ctx.fillStyle = pal[0];
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let rnd = seed * 2654435761;
  const rand = () => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    return rnd / 0x7fffffff;
  };

  const cols = wide ? 3 : 2;
  const rows = page === 1 ? 1 : 2 + Math.floor(rand() * 2);
  const m = 36;
  const gw = (canvas.width - m * (cols + 1)) / cols;
  const gh = (canvas.height - m * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rows > 1 && rand() < 0.12) continue;
      const x = m + c * (gw + m);
      const y = m + r * (gh + m);
      ctx.fillStyle = pal[1];
      ctx.globalAlpha = 0.06 + rand() * 0.1;
      ctx.fillRect(x, y, gw, gh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pal[1];
      ctx.lineWidth = 5;
      ctx.strokeRect(x, y, gw, gh);
      // abstract "art"
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, gw, gh);
      ctx.clip();
      ctx.strokeStyle = pal[2];
      ctx.lineWidth = 2 + rand() * 6;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(x + rand() * gw, y + rand() * gh);
        ctx.lineTo(x + rand() * gw, y + rand() * gh);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = pal[2];
      ctx.beginPath();
      ctx.arc(x + gw * rand(), y + gh * rand(), 30 + rand() * 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.fillStyle = pal[1];
  ctx.font = "600 34px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, canvas.width / 2, canvas.height - 46);
  ctx.font = "500 26px system-ui, sans-serif";
  ctx.globalAlpha = 0.65;
  ctx.fillText(`${page} / ${total}`, canvas.width / 2, canvas.height - 14);

  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.82));
}

/* ------------------------------------------------------------------ */
/* Runtime registry (non-serialisable handles live only in memory)     */
/* ------------------------------------------------------------------ */
export type BlobGetter = () => Promise<Blob>;

export const registry = {
  sources: new Map<string, PageSource>(),
  covers: new Map<string, BlobGetter>(),
  reset() {
    this.sources.clear();
    this.covers.clear();
    clearImageCaches();
  },
};

/* ------------------------------------------------------------------ */
/* Image caches: thumbnails + rendered pages (never full resolution)   */
/* ------------------------------------------------------------------ */
const thumbCache = new Map<string, Promise<string>>();
const thumbUrls: string[] = [];

export function clearImageCaches() {
  for (const u of thumbUrls) URL.revokeObjectURL(u);
  thumbUrls.length = 0;
  thumbCache.clear();
  pageCache.forEach((p) => p.then((r) => URL.revokeObjectURL(r.url)).catch(() => {}));
  pageCache.clear();
  pageOrder.length = 0;
}

export function thumbCacheSize() {
  return thumbCache.size;
}

async function downscale(blob: Blob, width: number, quality = 0.8) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, width / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const out = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
  return { blob: out, width: bmp.width, height: bmp.height, w, h };
}

/** Cached, downscaled thumbnail URL. Never decodes at full resolution twice. */
export function getThumb(key: string, getter: BlobGetter, width = 320): Promise<string> {
  const ck = `${key}@${width}`;
  let p = thumbCache.get(ck);
  if (!p) {
    p = (async () => {
      const blob = await getter();
      try {
        const { blob: small } = await downscale(blob, width);
        const url = URL.createObjectURL(small);
        thumbUrls.push(url);
        return url;
      } catch {
        const url = URL.createObjectURL(blob);
        thumbUrls.push(url);
        return url;
      }
    })();
    thumbCache.set(ck, p);
    p.catch(() => thumbCache.delete(ck));
  }
  return p;
}

export interface RenderedPage {
  url: string;
  width: number; // natural size
  height: number;
}

const pageCache = new Map<string, Promise<RenderedPage>>();
const pageOrder: string[] = [];
let pageBudget = 220;

export function setPageBudget(n: number) {
  pageBudget = Math.max(20, n);
}

export function pageCacheKey(sourceId: string, index: number, targetWidth: number) {
  return `${sourceId}#${index}@${Math.round(targetWidth / 64) * 64}`;
}

export function isPageReady(sourceId: string, index: number, targetWidth: number) {
  return pageCache.has(pageCacheKey(sourceId, index, targetWidth));
}

/** Decode + render a page at (approximately) display size. */
export function renderPage(
  src: PageSource,
  index: number,
  targetWidth: number,
  quality = 0.85,
): Promise<RenderedPage> {
  const key = pageCacheKey(src.id, index, targetWidth);
  let p = pageCache.get(key);
  if (!p) {
    p = (async () => {
      const blob = await src.load(index);
      try {
        const r = await downscale(blob, Math.max(360, Math.round(targetWidth)), quality);
        const url = URL.createObjectURL(r.blob);
        return { url, width: r.width, height: r.height };
      } catch {
        const url = URL.createObjectURL(blob);
        return { url, width: 0, height: 0 };
      }
    })();
    pageCache.set(key, p);
    pageOrder.push(key);
    p.catch(() => {
      pageCache.delete(key);
    });
    while (pageOrder.length > pageBudget) {
      const old = pageOrder.shift()!;
      const op = pageCache.get(old);
      pageCache.delete(old);
      op?.then((r) => URL.revokeObjectURL(r.url)).catch(() => {});
    }
  }
  return p;
}
