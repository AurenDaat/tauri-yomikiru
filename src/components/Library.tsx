import { useMemo, useState } from "react";
import { useApp } from "../store";
import { makeT } from "../lib/i18n";
import { Button, Cover, Icon, IconButton, Modal, ProgressBar, Segmented, Spinner } from "./ui";
import { groupPath } from "../lib/scan";
import { linkFolder, loadDemoLibrary, refreshLibrary } from "../lib/libraryService";
import { natCompare } from "../lib/util";
import { registry } from "../lib/sources";
import { cn } from "../utils/cn";
import type { Series } from "../lib/types";

export default function LibraryPage() {
  const s = useApp();
  const t = makeT(s.settings.lang);
  const [menuSeries, setMenuSeries] = useState<Series | null>(null);
  const lib = s.lib;

  const crumbs = groupPath(lib, s.groupId);
  const searching = s.query.trim().length > 0;

  const visibleSeries = useMemo(() => {
    const all = Object.values(lib.series);
    let list = searching
      ? all
      : all.filter((x) => (s.groupId ? x.groupId === s.groupId : x.groupId === null));
    if (searching) {
      const q = s.query.trim().toLowerCase();
      list = list.filter((x) => {
        if (x.name.toLowerCase().includes(q)) return true;
        if ((x.meta?.writer ?? "").toLowerCase().includes(q)) return true;
        if ((x.meta?.title ?? "").toLowerCase().includes(q)) return true;
        return x.volumeIds.some((v) => lib.volumes[v]?.name.toLowerCase().includes(q));
      });
    }
    if (s.activeCategory)
      list = list.filter((x) => (s.assignments[x.id] ?? []).includes(s.activeCategory!));
    const sortBy = s.settings.sortBy;
    const lastRead = (id: string) =>
      Math.max(0, ...lib.series[id].volumeIds.map((v) => s.progress[v]?.updatedAt ?? 0));
    return [...list].sort((a, b) => {
      if (sortBy === "added") return (s.addedAt[b.id] ?? 0) - (s.addedAt[a.id] ?? 0);
      if (sortBy === "lastRead") return lastRead(b.id) - lastRead(a.id);
      return natCompare(a.name, b.name);
    });
  }, [lib, s.groupId, s.query, s.activeCategory, s.assignments, s.settings.sortBy, s.progress, s.addedAt, searching]);

  const visibleGroups = useMemo(() => {
    if (searching) return [];
    const ids = s.groupId ? lib.groups[s.groupId]?.groupIds ?? [] : lib.rootGroupIds;
    return ids.map((g) => lib.groups[g]).filter(Boolean);
  }, [lib, s.groupId, searching]);

  const continueList = s.history.slice(0, 12).filter((h) => lib.volumes[h.volumeId]);

  const compact = s.settings.density === "compact";

  return (
    <div className="mx-auto w-full max-w-7xl px-3 pb-24 pt-3 sm:px-5">
      {/* search + actions */}
      <div className="sticky top-0 z-20 -mx-3 mb-3 bg-bg/90 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Icon name="book" className="h-5 w-5" />
          </div>
          <div className="text-base font-semibold tracking-tight">{t("appName")}</div>
          <div className="ms-auto text-xs text-muted">
            {Object.keys(lib.series).length} {t("series")} ·{" "}
            {Object.keys(lib.volumes).length} {t("volumes")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2">
            <Icon name="search" className="h-4 w-4 text-muted" />
            <input
              value={s.query}
              onChange={(e) => s.setQuery(e.target.value)}
              placeholder={t("search")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
            {s.query && <IconButton icon="close" label="clear" onClick={() => s.setQuery("")} />}
          </div>
          <IconButton icon="refresh" label={t("refresh")} onClick={() => refreshLibrary()} />
          <IconButton icon="clock" label={t("history")} onClick={() => s.nav({ name: "history" })} />
          <IconButton icon="cog" label={t("settings")} onClick={() => s.nav({ name: "settings" })} />
        </div>
      </div>

      {/* breadcrumb */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <button
          className="tap rounded-lg px-2 py-1 hover:bg-surface2"
          onClick={() => s.setGroup(null)}
        >
          {lib.rootName || t("library")}
        </button>
        {crumbs.map((g) => (
          <span key={g.id} className="flex items-center gap-2">
            <Icon name="forward" className="h-3.5 w-3.5 rtl:rotate-180" />
            <button
              className="tap rounded-lg px-2 py-1 text-ink hover:bg-surface2"
              onClick={() => s.setGroup(g.id)}
            >
              {g.name}
            </button>
          </span>
        ))}
        {s.groupId && (
          <Button
            variant="soft"
            className="ms-auto"
            onClick={() => s.setGroup(lib.groups[s.groupId!]?.parentId ?? null)}
          >
            <Icon name="back" className="h-4 w-4 rtl:rotate-180" />
            {t("back")}
          </Button>
        )}
      </div>

      {/* category tabs + sort */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <Tab active={!s.activeCategory} onClick={() => s.setCategory(null)} label={t("all")} />
        {s.categories.map((c) => (
          <Tab
            key={c.id}
            active={s.activeCategory === c.id}
            onClick={() => s.setCategory(c.id)}
            label={c.name}
          />
        ))}
        <div className="ms-auto shrink-0">
          <Segmented
            value={s.settings.sortBy}
            onChange={(v) => s.set("sortBy", v)}
            options={[
              { value: "name", label: t("sortName") },
              { value: "added", label: t("sortAdded") },
              { value: "lastRead", label: t("sortLastRead") },
            ]}
          />
        </div>
      </div>

      {s.libStatus === "scanning" && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <Spinner />
          <div className="text-sm">
            <div>{t("scanning")}</div>
            <div className="text-xs text-muted">
              {s.scan?.series ?? 0} {t("series")} · {s.scan?.volumes ?? 0} {t("volumes")}{" "}
              {s.scan?.current ? `· ${s.scan.current}` : ""}
            </div>
          </div>
        </div>
      )}

      {s.libStatus === "none" ? (
        <EmptyLink />
      ) : (
        <>
          {continueList.length > 0 && !searching && (
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-muted">{t("continueReading")}</h2>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {continueList.map((h) => {
                  const vol = lib.volumes[h.volumeId];
                  const ser = lib.series[h.seriesId];
                  const pr = s.progress[h.volumeId];
                  return (
                    <button
                      key={h.volumeId}
                      onClick={() => s.nav({ name: "reader", volumeId: h.volumeId })}
                      className="tap w-32 shrink-0 text-start"
                    >
                      <Cover cacheKey={h.volumeId} className="aspect-[2/3] w-32" width={200} />
                      <div className="mt-1.5 truncate text-xs font-medium">{ser?.name}</div>
                      <div className="truncate text-[11px] text-muted">{vol?.name}</div>
                      <ProgressBar
                        className="mt-1"
                        value={pr && pr.total ? (pr.page + 1) / pr.total : 0}
                      />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {visibleGroups.length === 0 && visibleSeries.length === 0 ? (
            <EmptyState title={t("emptyLibrary")} hint={t("emptyLibraryHint")} />
          ) : (
            <div
              className={cn(
                "grid gap-3",
                compact
                  ? "grid-cols-3 sm:grid-cols-5 lg:grid-cols-8"
                  : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6",
              )}
            >
              {visibleGroups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => s.setGroup(g.id)}
                  className="tap group text-start"
                >
                  <GroupTile groupId={g.id} />
                  <div className="mt-1.5 flex items-center gap-1 truncate text-sm font-medium">
                    <Icon name="folder" className="h-4 w-4 text-accent" />
                    <span className="truncate">{g.name}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {g.seriesIds.length} {t("series")}
                  </div>
                </button>
              ))}

              {visibleSeries.map((ser) => {
                const cats = s.assignments[ser.id] ?? [];
                const override = s.coverOverrides[ser.id];
                return (
                  <div key={ser.id} className="group relative">
                    <button
                      onClick={() => s.nav({ name: "series", seriesId: ser.id })}
                      className="tap w-full text-start"
                    >
                      <Cover
                        cacheKey={override ? `${ser.id}|${override.volumeId}#${override.page}` : ser.id}
                        getter={
                          override
                            ? async () => {
                                const src = registry.sources.get(override.volumeId)!;
                                await src.list();
                                return src.load(override.page);
                              }
                            : undefined
                        }
                        className="aspect-[2/3] w-full"
                      />
                      <div className="mt-1.5 line-clamp-2 text-sm font-medium leading-tight">
                        {ser.name}
                      </div>
                      <div className="text-xs text-muted">
                        {ser.volumeIds.length} {t("volumes")}
                      </div>
                    </button>
                    <button
                      onClick={() => setMenuSeries(ser)}
                      className="tap absolute end-1 top-1 rounded-lg bg-black/50 p-1 text-white opacity-0 transition group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                      aria-label="menu"
                    >
                      <Icon name="dots" className="h-4 w-4" />
                    </button>
                    {cats.length > 0 && (
                      <div className="pointer-events-none absolute start-1 top-1 flex gap-1">
                        {cats.slice(0, 2).map((c) => (
                          <span
                            key={c}
                            className="rounded-md bg-accent/90 px-1.5 py-0.5 text-[10px] font-medium text-onaccent"
                          >
                            {s.categories.find((x) => x.id === c)?.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={!!menuSeries}
        onClose={() => setMenuSeries(null)}
        title={menuSeries?.name ?? ""}
      >
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase text-muted">{t("categories")}</div>
          {s.categories.length === 0 && (
            <p className="text-sm text-muted">{t("newCategory")} → {t("settings")}</p>
          )}
          {s.categories.map((c) => {
            const on = (s.assignments[menuSeries!.id] ?? []).includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => s.toggleAssignment(menuSeries!.id, c.id)}
                className="tap flex w-full items-center justify-between rounded-xl bg-surface2 px-3 py-2 text-sm"
              >
                {c.name}
                {on && <Icon name="check" className="h-4 w-4 text-accent" />}
              </button>
            );
          })}
          <Button
            variant="soft"
            className="w-full"
            onClick={() => {
              const name = prompt(t("newCategory"));
              if (name) s.addCategory(name);
            }}
          >
            <Icon name="plus" className="h-4 w-4" /> {t("addCategory")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "tap shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition",
        active ? "bg-accent text-onaccent" : "bg-surface2 text-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

function GroupTile({ groupId }: { groupId: string }) {
  const lib = useApp((s) => s.lib);
  const showTiles = useApp((s) => s.settings.showGroupTiles);
  const g = lib.groups[groupId];
  const hasOwnCover = registry.covers.has(groupId);
  const firstSeries = g.seriesIds.slice(0, 4);
  if (hasOwnCover) return <Cover cacheKey={groupId} className="aspect-[2/3] w-full" />;
  if (!showTiles || firstSeries.length === 0)
    return (
      <div className="flex aspect-[2/3] w-full items-center justify-center rounded-xl bg-surface2">
        <Icon name="folder" className="h-10 w-10 text-muted" />
      </div>
    );
  return (
    <div className="grid aspect-[2/3] w-full grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl bg-surface2">
      {firstSeries.map((id) => (
        <Cover key={id} cacheKey={id} rounded="rounded-none" className="h-full w-full" width={160} />
      ))}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line py-16 text-center">
      <Icon name="book" className="mb-3 h-10 w-10 text-muted" />
      <div className="text-base font-medium">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>
    </div>
  );
}

function EmptyLink() {
  const s = useApp();
  const t = makeT(s.settings.lang);
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15">
        <Icon name="folder" className="h-8 w-8 text-accent" />
      </div>
      <div className="text-lg font-semibold">{t("noFolder")}</div>
      <p className="mt-2 max-w-md text-sm text-muted">{t("noFolderHint")}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={() => linkFolder()}>
          <Icon name="folder" className="h-4 w-4" /> {t("linkFolder")}
        </Button>
        <Button variant="soft" onClick={() => loadDemoLibrary()}>
          <Icon name="book" className="h-4 w-4" /> {t("loadDemo")}
        </Button>
      </div>
    </div>
  );
}
