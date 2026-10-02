import { buildLibrary, supportsDirectoryPicker, treeFromFileList } from "./scan";
import type { DirNode } from "./types";
import { buildDemoLibrary } from "./demo";
import { useApp } from "../store";
import { makeT } from "./i18n";

let rootHandle: any = null;
let lastSignature = "";
let watcherTimer: number | null = null;

function signature(node: DirNode): string {
  const parts: string[] = [];
  const walk = (n: DirNode) => {
    n.files.forEach((f) => parts.push(f.path + ":" + f.size));
    n.dirs.forEach(walk);
  };
  walk(node);
  return parts.sort().join("|");
}

async function walkHandle(handle: any): Promise<DirNode> {
  const walk = async (dir: any, path: string): Promise<DirNode> => {
    const node: DirNode = { name: dir.name, path, dirs: [], files: [] };
    for await (const [name, child] of dir.entries()) {
      if (name.startsWith(".") || name.toLowerCase() === "__macosx") continue;
      const p = path ? `${path}/${name}` : name;
      if (child.kind === "directory") node.dirs.push(await walk(child, p));
      else
        node.files.push({
          name,
          path: p,
          size: 0,
          getFile: () => child.getFile(),
        });
    }
    return node;
  };
  return walk(handle, "");
}

async function applyTree(tree: DirNode, announce = false) {
  const st = useApp.getState();
  const t = makeT(st.settings.lang);
  st.setLibStatus("scanning", { phase: "walking", series: 0, volumes: 0, current: "" });
  const lib = await buildLibrary(tree, (p) => useApp.getState().setLibStatus("scanning", p));
  useApp.getState().setLibrary(lib);
  lastSignature = signature(tree);
  if (announce) useApp.getState().toast(t("libraryUpdated"));
}

export async function linkFolder() {
  const st = useApp.getState();
  const t = makeT(st.settings.lang);
  try {
    if (supportsDirectoryPicker()) {
      rootHandle = await (window as any).showDirectoryPicker({ id: "manga-root", mode: "read" });
      const tree = await walkHandle(rootHandle);
      await applyTree(tree, true);
      startWatcher();
    } else {
      const picked = await pickViaInput();
      if (!picked.length) return;
      rootHandle = null;
      await applyTree(treeFromFileList(picked), true);
    }
  } catch (e: any) {
    if (e?.name !== "AbortError") useApp.getState().toast(t("fileUnreadable"));
    if (useApp.getState().libStatus === "scanning") useApp.getState().setLibStatus("none");
  }
}

function pickViaInput(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    (input as any).webkitdirectory = true;
    (input as any).directory = true;
    input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export async function refreshLibrary() {
  const st = useApp.getState();
  if (rootHandle) {
    const tree = await walkHandle(rootHandle);
    await applyTree(tree, true);
  } else if (st.lib.rootName === "Demo Library") {
    loadDemoLibrary();
  } else {
    await linkFolder();
  }
}

export function loadDemoLibrary() {
  const st = useApp.getState();
  st.setLibStatus("scanning", { phase: "indexing", series: 0, volumes: 0, current: "" });
  const lib = buildDemoLibrary();
  st.setLibrary(lib);
  st.toast(makeT(st.settings.lang)("libraryUpdated"));
}

/** Poll-based filesystem watcher (the Tauri build uses a native notify watcher). */
export function startWatcher() {
  if (watcherTimer) window.clearInterval(watcherTimer);
  if (!rootHandle) return;
  watcherTimer = window.setInterval(async () => {
    if (!rootHandle) return;
    if (useApp.getState().route.name === "reader") return;
    try {
      const tree = await walkHandle(rootHandle);
      if (signature(tree) !== lastSignature) await applyTree(tree, true);
    } catch {
      /* ignore transient errors */
    }
  }, 15000);
}

export function hasLinkedFolder() {
  return !!rootHandle;
}
