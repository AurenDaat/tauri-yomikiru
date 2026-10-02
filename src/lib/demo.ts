import { DemoSource, registry } from "./sources";
import type { Group, Library, Series, Volume } from "./types";
import { emptyLibrary } from "./types";
import { hashString } from "./util";

interface DemoSeriesSpec {
  name: string;
  volumes: { name: string; pages: number }[];
  writer?: string;
  summary?: string;
  genre?: string;
}

const mk = (name: string, count: number, pages: number[], extra: Partial<DemoSeriesSpec> = {}): DemoSeriesSpec => ({
  name,
  volumes: Array.from({ length: count }, (_, i) => ({
    name: `Volume ${i + 1}`,
    pages: pages[i % pages.length],
  })),
  ...extra,
});

const ROOT: DemoSeriesSpec[] = [
  mk("Chainsaw Devil", 3, [28, 34, 22], {
    writer: "T. Fujiwara",
    genre: "Action, Dark Fantasy",
    summary:
      "Denzo hunts devils to pay off a debt he never agreed to. A sample series generated locally so you can try the reader without linking a folder.",
  }),
  mk("Quiet Coffee Shop", 2, [18, 24], {
    writer: "M. Aoki",
    genre: "Slice of Life",
    summary: "Small stories told over cups of coffee.",
  }),
];

const ACTION: DemoSeriesSpec[] = [
  mk("One Punch Man", 4, [30, 26, 32, 20], {
    writer: "ONE",
    genre: "Action, Comedy",
    summary: "A hero who wins every fight with a single punch — and is bored by it.",
  }),
  mk("Berserk", 3, [40, 36, 30], {
    writer: "K. Miura",
    genre: "Dark Fantasy",
    summary: "The Black Swordsman walks a road paved with causality.",
  }),
];

const CLASSICS: DemoSeriesSpec[] = [
  mk("Astro Boy", 2, [24, 20], { writer: "O. Tezuka", genre: "Classic, Sci-Fi" }),
];

const WEBTOON: DemoSeriesSpec[] = [
  {
    name: "Tower of Glass",
    genre: "Webtoon, Fantasy",
    writer: "SIU-like",
    summary: "A vertical-scroll style series — try Webtoon mode in the reader.",
    volumes: [
      { name: "Chapter 1", pages: 14 },
      { name: "Chapter 2", pages: 16 },
      { name: "Chapter 9", pages: 12 },
      { name: "Chapter 10", pages: 15 },
      { name: "Chapter 10.5", pages: 6 },
      { name: "Chapter 11", pages: 18 },
    ],
  },
];

export function buildDemoLibrary(): Library {
  registry.reset();
  const lib = emptyLibrary();
  lib.rootName = "Demo Library";

  const addSeries = (spec: DemoSeriesSpec, groupId: string | null): Series => {
    const id = `s_demo_${spec.name}`;
    const series: Series = {
      id,
      name: spec.name,
      groupId,
      volumeIds: [],
      meta: { writer: spec.writer, genre: spec.genre, summary: spec.summary },
      description: spec.summary,
    };
    spec.volumes.forEach((v) => {
      const vid = `v_demo_${spec.name}_${v.name}`;
      const vol: Volume = {
        id: vid,
        seriesId: id,
        name: v.name,
        kind: "cbz",
        pageCount: v.pages,
      };
      registry.sources.set(
        vid,
        new DemoSource(vid, v.pages, hashString(vid) % 9973, `${spec.name} · ${v.name}`),
      );
      const getter = async () => registry.sources.get(vid)!.load(0);
      registry.covers.set(vid, getter);
      lib.volumes[vid] = vol;
      series.volumeIds.push(vid);
    });
    registry.covers.set(id, async () => registry.sources.get(series.volumeIds[0])!.load(0));
    lib.series[id] = series;
    return series;
  };

  const addGroup = (name: string, parentId: string | null, specs: DemoSeriesSpec[]): Group => {
    const id = `g_demo_${name}`;
    const g: Group = { id, name, parentId, seriesIds: [], groupIds: [] };
    lib.groups[id] = g;
    specs.forEach((s) => g.seriesIds.push(addSeries(s, id).id));
    if (parentId) lib.groups[parentId].groupIds.push(id);
    return g;
  };

  ROOT.forEach((s) => lib.rootSeriesIds.push(addSeries(s, null).id));
  const action = addGroup("Action", null, ACTION);
  addGroup("Classics", action.id, CLASSICS);
  const web = addGroup("Webtoons", null, WEBTOON);
  lib.rootGroupIds.push(action.id, web.id);

  // a loose .cbz sitting directly in the root folder -> single-volume series
  const looseId = "s_demo_loose";
  const looseVol = "v_demo_loose";
  registry.sources.set(looseVol, new DemoSource(looseVol, 12, 4242, "Night Bus (oneshot)"));
  registry.covers.set(looseVol, async () => registry.sources.get(looseVol)!.load(0));
  registry.covers.set(looseId, async () => registry.sources.get(looseVol)!.load(0));
  lib.volumes[looseVol] = {
    id: looseVol,
    seriesId: looseId,
    name: "Night Bus",
    kind: "cbz",
    pageCount: 12,
  };
  lib.series[looseId] = {
    id: looseId,
    name: "Night Bus",
    groupId: null,
    volumeIds: [looseVol],
  };
  lib.rootSeriesIds.push(looseId);

  // one deliberately unreadable volume to show the graceful error state
  const badId = "v_demo_bad";
  lib.volumes[badId] = {
    id: badId,
    seriesId: "s_demo_Berserk",
    name: "Volume 4 (damaged)",
    kind: "cbz",
    error: "could not be read",
  };
  lib.series["s_demo_Berserk"].volumeIds.push(badId);

  lib.scannedAt = Date.now();
  return lib;
}
