import { useState } from "react";
import { useApp } from "../store";
import { makeT } from "../lib/i18n";
import { Button, Confirm, Cover, Icon, IconButton, ProgressBar } from "./ui";
import { formatDate } from "../lib/util";

export default function HistoryPage() {
  const s = useApp();
  const t = makeT(s.settings.lang);
  const [confirm, setConfirm] = useState(false);
  const items = s.history.filter((h) => s.lib.volumes[h.volumeId]);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-24 pt-3 sm:px-5">
      <div className="mb-4 flex items-center gap-2">
        <IconButton icon="back" label={t("back")} className="rtl:rotate-180" onClick={() => s.back()} />
        <h1 className="flex-1 text-lg font-semibold">{t("history")}</h1>
        {items.length > 0 && (
          <Button variant="danger" onClick={() => setConfirm(true)}>
            <Icon name="trash" className="h-4 w-4" /> {t("clearHistory")}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center text-muted">
          {t("historyEmpty")}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((h) => {
            const vol = s.lib.volumes[h.volumeId];
            const ser = s.lib.series[h.seriesId];
            return (
              <button
                key={h.volumeId + h.at}
                onClick={() => s.nav({ name: "reader", volumeId: h.volumeId })}
                className="tap flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-2 text-start hover:border-accent/50"
              >
                <Cover cacheKey={h.volumeId} className="h-20 w-14" width={160} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{ser?.name}</div>
                  <div className="truncate text-xs text-muted">{vol?.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{formatDate(h.at, s.settings.lang)}</div>
                  <ProgressBar className="mt-1.5 max-w-xs" value={h.total ? (h.page + 1) / h.total : 0} />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {h.page + 1}/{h.total}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Confirm
        open={confirm}
        text={t("areYouSure")}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          s.clearHistory();
          setConfirm(false);
        }}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
      />
    </div>
  );
}
