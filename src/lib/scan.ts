import type { DirNode, FileRef, Group, Library, Series, Volume } from "./types";
import { emptyLibrary } from "./types";
import { CbzSource, FolderSource, registry } from "./sources";
import { ext, isImageName, isJunk, looksLikeCover, natCompare, natSort, stripExt } from "./util";

/* ------------------------------------------------------------------ */
/* Getting a tree: File System Access API or <input webkitdirectory>    */
/* ------------------------------------------------------------------ */

export const supportsDirectoryPicker = () =>
  typeof (window as any).showDirectoryPicker === "function";

export async function pickDirectoryTree(
  onCount?: (n: number) => void,
): Promise<DirNode | null> {
  const handle = await (window as any).showDirectoryPicker({ id: "manga-root", mode: "read" });
  if (!handle) return null;
  let count = 0;
  const walk = async (dir: any, path: string): Promise<DirNode> => {
    const node: DirNode = { name: dir.name, path, dirs: [], files: [] };
    for await (const [name, child] of dir.entries()) {
      if (isJunk(name)) continue;
      const childPath = path ? `${path}/${name}` : name;
      if (child.kind === "directory") {
        node.dirs.push(await walk(child, childPath));
      } else {
        count++;
        if (count % 50 === 0) onCount?.(count);
        node.files.push({
          name,
          path: childPath,
          size: 0,
          getFile: () => child.getFile(),
        });
      }
    }
    return node;
  };
  return walk(handle, "");
}

export function treeFromFileList(files: File[]): DirNode {
  const root: DirNode = { name: "", path: "", dirs: [], files: [] };
  for (const f of files) {
    const rel = (f as any).webkitRelativePath || f.name;
    const parts: string[] = rel.split("/").filter(Boolean);
    if (!root.name && parts.length > 1) root.name = parts[0];
    const segs = parts.length > 1 ? parts.slice(1) : parts;
    if (segs.some(isJunk)) continue;
    let node = root;
    for (let i = 0; i < segs.length - 1; i++) {
      let next = node.dirs.find((d) => d.name === segs[i]);
      if (!next) {
        next = { name: segs[i], path: segs.slice(0, i + 1).join("/"), dirs: [], files: [] };
        node.dirs.push(next);
      }
      node = next;
    }
    const name = segs[segs.length - 1];
    node.files.push({
      name,
      path: segs.join("/"),
      size: f.size,
      getFile: async () => f,
    });
  }
  return root;
}

/* ------------------------------------------------------------------ */
/* Library construction — the parsing rules                             */
/* ------------------------------------------------------------------ */

const isGroupName = (n: string) => n.trim().startsWith("#");
const groupDisplayName = (n: string) => n.trim().replace(/^#+\s*/, "").trim() || "Group";

const hasDirectImages = (d: DirNode) => d.files.some((f) => isImageName(f.name));
const cbzFiles = (d: DirNode) => d.files.filter((f) => ext(f.name) === "cbz");

export interface ScanProgress {
  phase: "walking" | "indexing" | "done";
  series: number;
  volumes: number;
  current: string;
}

export async function buildLibrary(
  root: DirNode,
  onProgress?: (p: ScanProgress) => void,
): Promise<Library> {
  registry.reset();
  const lib = emptyLibrary();
  lib.rootName = root.name || "Library";
  const progress: ScanProgress = { phase: "indexing", series: 0, volumes: 0, current: "" };

  const addVolume = (v: Volume) => {
    lib.volumes[v.id] = v;
    progress.volumes++;
  };

  const readTextFile = async (f?: FileRef) => {
    if (!f) return undefined;
    try {
      return (await (await f.getFile()).text()).trim();
    } catch {
      return undefined;
    }
  };

  const makeSeries = async (dir: DirNode, groupId: string | null): Promise<Series> => {
    const id = `s_${dir.path || dir.name}`;
    const series: Series = { id, name: dir.name, groupId, volumeIds: [] };
    progress.series++;
    progress.current = dir.name;
    onProgress?.({ ...progress });

    const cbz = cbzFiles(dir);
    const imageSubdirs = dir.dirs.filter(hasDirectImages);
    const directImages = dir.files.filter((f) => isImageName(f.name));

    const coverFile =
      dir.files.find((f) => isImageName(f.name) && looksLikeCover(f.name)) ?? undefined;

    // --- volumes ---------------------------------------------------
    const vols: Volume[] = [];
    for (const f of cbz) {
      const vid = `v_${f.path}`;
      registry.sources.set(vid, new CbzSource(vid, f));
      vols.push({ id: vid, seriesId: id, name: stripExt(f.name), kind: "cbz" });
    }
    for (const sub of imageSubdirs) {
      const vid = `v_${sub.path}`;
      const pages = sub.files.filter((f) => isImageName(f.name));
      registry.sources.set(vid, new FolderSource(vid, pages));
      vols.push({
        id: vid,
        seriesId: id,
        name: sub.name,
        kind: "folder",
        pageCount: pages.length,
      });
    }
    if (!cbz.length && !imageSubdirs.length && directImages.length) {
      const vid = `v_${dir.path}__single`;
      const pages =
        directImages.length > 1 && coverFile
          ? directImages
          : directImages;
      registry.sources.set(vid, new FolderSource(vid, pages));
      vols.push({
        id: vid,
        seriesId: id,
        name: dir.name,
        kind: "loose",
        pageCount: pages.length,
      });
    }

    natSort(vols, (v) => v.name).forEach((v) => {
      addVolume(v);
      series.volumeIds.push(v.id);
    });

    // --- optional metadata ----------------------------------------
    const detailsJson = dir.files.find((f) => f.name.toLowerCase() === "details.json");
    const descTxt = dir.files.find((f) => f.name.toLowerCase() === "description.txt");
    if (detailsJson) {
      const txt = await readTextFile(detailsJson);
      try {
        const j = JSON.parse(txt || "{}");
        series.meta = {
          title: j.title,
          summary: j.summary ?? j.description,
          writer: j.writer ?? j.author,
          genre: Array.isArray(j.genres) ? j.genres.join(", ") : j.genre,
        };
        series.description = series.meta.summary;
      } catch {
        /* ignore */
      }
    } else if (descTxt) {
      series.description = await readTextFile(descTxt);
    }

    // --- cover ------------------------------------------------------
    if (coverFile) {
      registry.covers.set(id, () => coverFile.getFile());
    } else if (series.volumeIds.length) {
      const first = series.volumeIds[0];
      registry.covers.set(id, async () => {
        const src = registry.sources.get(first)!;
        await src.list();
        return src.load(0);
      });
    }
    for (const vid of series.volumeIds) {
      registry.covers.set(vid, async () => {
        const src = registry.sources.get(vid)!;
        await src.list();
        return src.load(0);
      });
    }
    return series;
  };

  const makeLooseCbzSeries = (f: FileRef, groupId: string | null): Series => {
    const id = `s_${f.path}`;
    const vid = `v_${f.path}`;
    registry.sources.set(vid, new CbzSource(vid, f));
    const name = stripExt(f.name);
    addVolume({ id: vid, seriesId: id, name, kind: "cbz" });
    const getter = async () => {
      const src = registry.sources.get(vid)!;
      await src.list();
      return src.load(0);
    };
    registry.covers.set(id, getter);
    registry.covers.set(vid, getter);
    return { id, name, groupId, volumeIds: [vid] };
  };

  const processLevel = async (node: DirNode, groupId: string | null) => {
    const seriesIds: string[] = [];
    const groupIds: string[] = [];

    for (const dir of [...node.dirs].sort((a, b) => natCompare(a.name, b.name))) {
      if (isGroupName(dir.name)) {
        const gid = `g_${dir.path || dir.name}`;
        const group: Group = {
          id: gid,
          name: groupDisplayName(dir.name),
          parentId: groupId,
          seriesIds: [],
          groupIds: [],
        };
        lib.groups[gid] = group;
        groupIds.push(gid);
        const cover = dir.files.find((f) => isImageName(f.name) && looksLikeCover(f.name));
        if (cover) registry.covers.set(gid, () => cover.getFile());
        const inner = await processLevel(dir, gid);
        group.seriesIds = inner.seriesIds;
        group.groupIds = inner.groupIds;
      } else {
        const s = await makeSeries(dir, groupId);
        if (s.volumeIds.length) {
          lib.series[s.id] = s;
          seriesIds.push(s.id);
        }
      }
    }

    for (const f of cbzFiles(node)) {
      const s = makeLooseCbzSeries(f, groupId);
      lib.series[s.id] = s;
      seriesIds.push(s.id);
    }

    return { seriesIds, groupIds };
  };

  const top = await processLevel(root, null);
  lib.rootSeriesIds = top.seriesIds;
  lib.rootGroupIds = top.groupIds;
  lib.scannedAt = Date.now();
  onProgress?.({ ...progress, phase: "done" });
  return lib;
}

/** Resolve (and cache) the page count of a volume, flagging unreadable files. */
export async function ensurePageCount(v: Volume): Promise<Volume> {
  if (v.pageCount != null || v.error) return v;
  const src = registry.sources.get(v.id);
  if (!src) return { ...v, error: "missing" };
  try {
    const pages = await src.list();
    const meta = (await src.meta?.()) ?? undefined;
    return { ...v, pageCount: pages.length, meta: meta ?? undefined };
  } catch (e: any) {
    return { ...v, error: e?.message || "could not be read" };
  }
}

export function allSeriesOfGroup(lib: Library, groupId: string | null): string[] {
  if (groupId === null) return lib.rootSeriesIds;
  return lib.groups[groupId]?.seriesIds ?? [];
}

export function groupPath(lib: Library, groupId: string | null): Group[] {
  const out: Group[] = [];
  let g = groupId ? lib.groups[groupId] : null;
  while (g) {
    out.unshift(g);
    g = g.parentId ? lib.groups[g.parentId] : null;
  }
  return out;
}
