import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import { makeT } from "../lib/i18n";
import { Button, Confirm, Cover, Icon, IconButton, Modal, ProgressBar, Spinner } from "./ui";
import { ensurePageCount } from "../lib/scan";
import { registry } from "../lib/sources";
import { copyBlob, saveBlob, shareBlob } from "../lib/actions";
import { cn } from "../utils/cn";

export default function SeriesPage({ seriesId }: { seriesId: string }) {
  const s = useApp();
  const t = makeT(s.settings.lang);
  const lib = s.lib;
  const series = lib.series[seriesId];
  const [lightbox, setLightbox] = useState<{ key: string; title: string; volumeId: string } | null>(null);
  const [editDesc, setEditDesc] = useState(false);
  const [draft, setDraft] = useState("");
  const [menuVol, setMenuVol] = useState<string | null>(null);
  const [confirmCover, setConfirmCover] = useState(false);

  // resolve page counts lazily, a few at a time, never blocking the UI
  useEffect(() => {
    if (!series) return;
    let cancelled = false;
    (async () => {
      for (const id of series.volumeIds) {
        if (cancelled) return;
        const v = useApp.getState().lib.volumes[id];
        if (!v || v.pageCount != null || v.error) continue;
        const next = await ensurePageCount(v);
        if (cancelled) return;
        if (next !== v) useApp.getState().updateVolume(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seriesId, series]);

  const lastRead = useMemo(() => {
    if (!series) return null;
    let best: { id: string; at: number } | null = null;
    series.volumeIds.forEach((id) => {
      const p = s.progress[id];
      if (p && (!best || p.updatedAt > best.at)) best = { id, at: p.updatedAt };
    });
    return best as { id: string; at: number } | null;
  }, [series, s.progress]);

  if (!series)
    return (
      <div className="p-8 text-center text-muted">
        <Button onClick={() => s.back()}>{t("back")}</Button>
      </div>
    );

  const desc = s.descriptions[seriesId] ?? series.description ?? series.meta?.summary ?? "";
  const override = s.coverOverrides[seriesId];
  const coverGetter = override
    ? async () => {
        const src = registry.sources.get(override.volumeId)!;
        await src.list();
        return src.load(override.page);
      }
    : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-24 pt-3 sm:px-5">
      <div className="mb-3 flex items-center gap-2">
        <IconButton icon="back" label={t("back")} onClick={() => s.back()} className="rtl:rotate-180" />
        <div className="truncate text-sm text-muted">{t("series")}</div>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-56">
          <button
            className="tap w-full"
            onClick={() =>
              setLightbox({
                key: override ? `${seriesId}|ov` : seriesId,
                title: series.name,
                volumeId: series.volumeIds[0],
              })
            }
          >
            <Cover
              cacheKey={override ? `${seriesId}|${override.volumeId}#${override.page}` : seriesId}
              getter={coverGetter}
              className="aspect-[2/3] w-full"
              width={480}
            />
          </button>
          {override && (
            <Button variant="soft" className="mt-2 w-full" onClick={() => setConfirmCover(true)}>
              {t("removeCoverOverride")}
            </Button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight">{series.name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {series.meta?.writer && (
              <span>
                {t("writer")}: <span className="text-ink">{series.meta.writer}</span>
              </span>
            )}
            {series.meta?.genre && (
              <span>
                {t("genre")}: <span className="text-ink">{series.meta.genre}</span>
              </span>
            )}
            <span>
              {series.volumeIds.length} {t("volumes")}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {s.categories.map((c) => {
              const on = (s.assignments[seriesId] ?? []).includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => s.toggleAssignment(seriesId, c.id)}
                  className={cn(
                    "tap rounded-full px-3 py-1 text-xs font-medium transition",
                    on ? "bg-accent text-onaccent" : "bg-surface2 text-muted",
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-surface p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted">{t("description")}</span>
              <IconButton
                icon="sliders"
                label={t("editDescription")}
                onClick={() => {
                  setDraft(desc);
                  setEditDesc(true);
                }}
              />
            </div>
            <p data-selectable="true" className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
              {desc || <span className="text-muted">{t("addDescription")}</span>}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() =>
                s.nav({
                  name: "reader",
                  volumeId: lastRead?.id ?? series.volumeIds[0],
                })
              }
            >
              <Icon name="book" className="h-4 w-4" />
              {lastRead ? t("continueFrom") : t("startReading")}
            </Button>
          </div>
        </div>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">{t("volumes")}</h2>
      {series.volumeIds.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">
          {t("noVolumes")}
        </div>
      )}
      <div className="space-y-2">
        {series.volumeIds.map((vid) => {
          const v = lib.volumes[vid];
          if (!v) return null;
          const pr = s.progress[vid];
          const pct = pr && pr.total ? (pr.page + 1) / pr.total : 0;
          return (
            <div
              key={vid}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-line bg-surface p-2 transition",
                v.error ? "opacity-60" : "hover:border-accent/50",
              )}
            >
              <button
                className="tap shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!v.error) setLightbox({ key: vid, title: v.name, volumeId: vid });
                }}
              >
                <Cover cacheKey={vid} className="h-20 w-14" width={160} />
              </button>
              <button
                className="min-w-0 flex-1 text-start"
                onClick={() => !v.error && s.nav({ name: "reader", volumeId: vid })}
              >
                <div className="truncate text-sm font-medium">{v.name}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {v.error ? (
                    <span className="text-red-400">⚠ {t("fileUnreadable")}</span>
                  ) : v.pageCount != null ? (
                    `${v.pageCount} ${t("pages")}`
                  ) : (
                    <Spinner className="h-3 w-3" />
                  )}
                  {pr?.read && <span className="ms-2 text-accent">✓ {t("read")}</span>}
                </div>
                {pct > 0 && !pr?.read && <ProgressBar className="mt-1.5 max-w-xs" value={pct} />}
              </button>
              <IconButton icon="dots" label="menu" onClick={() => setMenuVol(vid)} />
            </div>
          );
        })}
      </div>

      {/* volume menu */}
      <Modal open={!!menuVol} onClose={() => setMenuVol(null)} title={lib.volumes[menuVol ?? ""]?.name}>
        <div className="space-y-2">
          <Button
            variant="soft"
            className="w-full justify-start"
            onClick={() => {
              const v = lib.volumes[menuVol!];
              s.setRead(menuVol!, !s.progress[menuVol!]?.read, v.pageCount ?? 0);
              setMenuVol(null);
            }}
          >
            <Icon name="check" className="h-4 w-4" />
            {s.progress[menuVol ?? ""]?.read ? t("markUnread") : t("markRead")}
          </Button>
          <Button
            variant="soft"
            className="w-full justify-start"
            onClick={() => {
              s.setCoverOverride(seriesId, { volumeId: menuVol!, page: 0 });
              s.toast(t("coverChanged"));
              setMenuVol(null);
            }}
          >
            <Icon name="eye" className="h-4 w-4" />
            {t("setAsCover")}
          </Button>
          <Button
            variant="danger"
            className="w-full justify-start"
            onClick={() => {
              s.clearBookmarks(menuVol!);
              setMenuVol(null);
            }}
          >
            <Icon name="trash" className="h-4 w-4" />
            {t("clearBookmarksQ")}
          </Button>
        </div>
      </Modal>

      {/* cover lightbox */}
      <Lightbox
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        title={lightbox?.title ?? ""}
        getter={
          lightbox
            ? registry.covers.get(lightbox.key.split("|")[0]) ?? coverGetter
            : undefined
        }
      />

      <Modal open={editDesc} onClose={() => setEditDesc(false)} title={t("editDescription")}>
        <textarea
          data-selectable="true"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={7}
          className="w-full rounded-xl border border-line bg-surface2 p-3 text-sm outline-none"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="soft" onClick={() => setEditDesc(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              s.setDescription(seriesId, draft);
              setEditDesc(false);
            }}
          >
            {t("save")}
          </Button>
        </div>
      </Modal>

      <Confirm
        open={confirmCover}
        text={t("areYouSure")}
        onCancel={() => setConfirmCover(false)}
        onConfirm={() => {
          s.setCoverOverride(seriesId, null);
          setConfirmCover(false);
          s.toast(t("coverChanged"));
        }}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
      />
    </div>
  );
}

export function Lightbox({
  open,
  onClose,
  title,
  getter,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  getter?: () => Promise<Blob>;
}) {
  const s = useApp();
  const t = makeT(s.settings.lang);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!open || !getter) return;
    let alive = true;
    let objectUrl = "";
    getter().then((b) => {
      if (!alive) return;
      setBlob(b);
      objectUrl = URL.createObjectURL(b);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [open, getter]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/85 p-4"
      onClick={onClose}
    >
      <div className="max-h-[70vh] overflow-hidden rounded-xl" onClick={(e) => e.stopPropagation()}>
        {url ? (
          <img src={url} alt={title} className="max-h-[70vh] w-auto object-contain" />
        ) : (
          <Spinner />
        )}
      </div>
      <div className="text-sm text-white/80">{title}</div>
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="soft"
          onClick={async () => {
            if (!blob) return;
            await saveBlob(blob, `${title}.jpg`);
            s.toast(t("savedToGallery"));
          }}
        >
          <Icon name="download" className="h-4 w-4" /> {t("saveToGallery")}
        </Button>
        <Button
          variant="soft"
          onClick={async () => {
            if (!blob) return;
            try {
              await copyBlob(blob);
              s.toast(t("copied"));
            } catch {
              s.toast(t("fileUnreadable"));
            }
          }}
        >
          <Icon name="copy" className="h-4 w-4" /> {t("copy")}
        </Button>
        <Button
          variant="soft"
          onClick={async () => {
            if (!blob) return;
            await shareBlob(blob, title);
          }}
        >
          <Icon name="share" className="h-4 w-4" /> {t("share")}
        </Button>
      </div>
    </div>
  );
}
