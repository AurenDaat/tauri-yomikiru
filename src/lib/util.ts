/** Natural ordering: "vol 2" < "vol 10", "10.5" between 10 and 11. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function natCompare(a: string, b: string): number {
  // Intl numeric collation handles integers; patch decimals explicitly.
  const ra = /(\d+(?:\.\d+)?)/g;
  const pa = a.split(ra);
  const pb = b.split(ra);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const xa = pa[i] ?? "";
    const xb = pb[i] ?? "";
    const na = parseFloat(xa);
    const nb = parseFloat(xb);
    if (!isNaN(na) && !isNaN(nb) && /^\d/.test(xa) && /^\d/.test(xb)) {
      if (na !== nb) return na - nb;
    } else {
      const c = collator.compare(xa, xb);
      if (c !== 0) return c;
    }
  }
  return 0;
}

export function natSort<T>(items: T[], key: (t: T) => string): T[] {
  return [...items].sort((a, b) => natCompare(key(a), key(b)));
}

export const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp", "jfif"];

export function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function isImageName(name: string): boolean {
  return IMAGE_EXT.includes(ext(name));
}

export function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? name : name.slice(0, i);
}

const JUNK = [
  "thumbs.db",
  "desktop.ini",
  ".ds_store",
  "__macosx",
  ".nomedia",
  "comicinfo.xml",
];

export function isJunk(name: string): boolean {
  const l = name.toLowerCase();
  return l.startsWith(".") || JUNK.includes(l);
}

/** a file named approximately "cover" */
export function looksLikeCover(name: string): boolean {
  const base = stripExt(name).toLowerCase().replace(/[\s_\-.]/g, "");
  return (
    base === "cover" ||
    base === "folder" ||
    base === "poster" ||
    base.startsWith("cover") ||
    base === "thumbnail"
  );
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function formatDate(ts: number, locale: string): string {
  try {
    return new Date(ts).toLocaleString(locale === "ar" ? "ar" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
  }
}

export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
