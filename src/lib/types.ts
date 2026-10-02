export interface FileRef {
  name: string;
  path: string;
  size: number;
  getFile: () => Promise<File>;
}

export interface DirNode {
  name: string;
  path: string;
  dirs: DirNode[];
  files: FileRef[];
}

export type VolumeKind = "cbz" | "folder" | "loose";

export interface ComicMeta {
  title?: string;
  series?: string;
  summary?: string;
  writer?: string;
  genre?: string;
}

export interface Volume {
  id: string;
  seriesId: string;
  name: string;
  kind: VolumeKind;
  pageCount?: number;
  error?: string;
  meta?: ComicMeta;
}

export interface Series {
  id: string;
  name: string;
  groupId: string | null;
  volumeIds: string[];
  meta?: ComicMeta;
  description?: string;
}

export interface Group {
  id: string;
  name: string; // '#' already stripped
  parentId: string | null;
  seriesIds: string[];
  groupIds: string[];
}

export interface Library {
  rootName: string;
  groups: Record<string, Group>;
  series: Record<string, Series>;
  volumes: Record<string, Volume>;
  rootGroupIds: string[];
  rootSeriesIds: string[];
  scannedAt: number;
}

export const emptyLibrary = (): Library => ({
  rootName: "",
  groups: {},
  series: {},
  volumes: {},
  rootGroupIds: [],
  rootSeriesIds: [],
  scannedAt: 0,
});
