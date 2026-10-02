import { useEffect, useState } from "react";
import { DEFAULT_KEYMAP, THEMES, useApp, type FitMode, type PageMode, type ReadDir } from "../store";
import { makeT } from "../lib/i18n";
import { Button, Confirm, Field, Icon, IconButton, Row, Segmented, Select, Slider, Toggle } from "./ui";
import { downloadJson, pickJsonFile } from "../lib/actions";
import { clearImageCaches, thumbCacheSize } from "../lib/sources";
import { linkFolder, refreshLibrary } from "../lib/libraryService";
import { cn } from "../utils/cn";

const APP_VERSION = "1.0.0";
const REPO = "https://github.com/your-name/kuro-manga";

function Section({
  title,
  icon,
  children,
  defaultOpen,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section className="mb-3 overflow-hidden rounded-2xl border border-line bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="tap flex w-full items-center gap-3 px-4 py-3 text-start"
      >
        <Icon name={icon} className="h-5 w-5 text-accent" />
        <span className="flex-1 text-sm font-semibold">{title}</span>
        <Icon name={open ? "up" : "down"} className="h-4 w-4 text-muted" />
      </button>
      {open && <div className="border-t border-line px-4 pb-4 pt-1">{children}</div>}
    </section>
  );
}

export default function SettingsPage() {
  const s = useApp();
  const st = s.settings;
  const t = makeT(st.lang);
  const [capture, setCapture] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<any>(null);
  const [catName, setCatName] = useState("");

  useEffect(() => {
    if (!capture) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.shiftKey && e.key.length > 1) parts.push("Shift");
      let k = e.key;
      if (k === "=") k = "+";
      if (k === "Control" || k === "Shift" || k === "Meta" || k === "Alt") return;
      parts.push(k.length === 1 ? k.toLowerCase() : k);
      s.set("keymap", { ...st.keymap, [capture]: parts.join("+") });
      setCapture(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capture, st.keymap, s]);

  const dupes = new Set(
    Object.values(st.keymap).filter((v, i, a) => a.indexOf(v) !== i),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-24 pt-3 sm:px-5">
      <div className="mb-4 flex items-center gap-2">
        <IconButton icon="back" label={t("back")} className="rtl:rotate-180" onClick={() => s.back()} />
        <h1 className="text-lg font-semibold">{t("settings")}</h1>
      </div>

      {/* ------------------------------ general --------------------------- */}
      <Section title={t("general")} icon="cog" defaultOpen>
        <Field label={t("language")}>
          <Segmented
            value={st.lang}
            onChange={(v) => s.set("lang", v)}
            options={[
              { value: "en", label: "English" },
              { value: "ar", label: "العربية" },
            ]}
          />
        </Field>
        <Field label={t("theme")}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {THEMES.map((th) => (
              <button
                key={th.id}
                onClick={() => s.set("theme", th.id)}
                className={cn(
                  "tap rounded-xl border px-2 py-2 text-xs transition",
                  st.theme === th.id ? "border-accent bg-accent/15" : "border-line bg-surface2",
                )}
              >
                {th.name}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("linkedFolder")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-surface2 px-3 py-2 text-sm">
              {s.lib.rootName || "—"}
            </span>
            <Button variant="soft" onClick={() => linkFolder()}>
              <Icon name="folder" className="h-4 w-4" /> {t("linkFolder")}
            </Button>
            <Button variant="soft" onClick={() => refreshLibrary()}>
              <Icon name="refresh" className="h-4 w-4" /> {t("refresh")}
            </Button>
          </div>
        </Field>
        <Row label={t("showGroupTiles")}>
          <Toggle checked={st.showGroupTiles} onChange={(v) => s.set("showGroupTiles", v)} />
        </Row>
      </Section>

      {/* ---------------------------- categories -------------------------- */}
      <Section title={t("categories")} icon="list">
        <div className="space-y-2">
          {s.categories.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2">
              <input
                value={c.name}
                onChange={(e) => s.renameCategory(c.id, e.target.value)}
                className="flex-1 rounded-xl border border-line bg-surface2 px-3 py-2 text-sm outline-none"
              />
              <IconButton icon="up" label="up" onClick={() => s.moveCategory(c.id, -1)} disabled={i === 0} />
              <IconButton
                icon="down"
                label="down"
                onClick={() => s.moveCategory(c.id, 1)}
                disabled={i === s.categories.length - 1}
              />
              <IconButton icon="trash" label={t("delete")} onClick={() => s.deleteCategory(c.id)} />
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder={t("newCategory")}
              className="flex-1 rounded-xl border border-line bg-surface2 px-3 py-2 text-sm outline-none"
            />
            <Button
              variant="primary"
              onClick={() => {
                if (catName.trim()) s.addCategory(catName.trim());
                setCatName("");
              }}
            >
              <Icon name="plus" className="h-4 w-4" /> {t("addCategory")}
            </Button>
          </div>
        </div>
      </Section>

      {/* -------------------------- reader defaults ----------------------- */}
      <Section title={t("readerDefaults")} icon="book">
        <Field label={t("mode")}>
          <Segmented<PageMode>
            value={st.mode}
            onChange={(v) => s.set("mode", v)}
            options={[
              { value: "single", label: t("single") },
              { value: "double", label: t("double") },
              { value: "webtoon", label: t("webtoon") },
            ]}
          />
        </Field>
        <Field label={t("direction")}>
          <Segmented<ReadDir>
            value={st.direction}
            onChange={(v) => s.set("direction", v)}
            options={[
              { value: "rtl", label: t("rtl") },
              { value: "ltr", label: t("ltr") },
              { value: "vertical", label: t("vertical") },
            ]}
          />
        </Field>
        <Field label={t("fit")}>
          <Segmented<FitMode>
            value={st.fit}
            onChange={(v) => s.set("fit", v)}
            options={[
              { value: "screen", label: t("fitScreen") },
              { value: "width", label: "100%" },
              { value: "height", label: t("fitHeight") },
              { value: "original", label: t("original") },
            ]}
          />
        </Field>
        <Row label={t("firstPageAlone")}>
          <Toggle checked={st.firstPageAlone} onChange={(v) => s.set("firstPageAlone", v)} />
        </Row>
        <Row label={`${t("gap")} · ${st.gap}px`}>
          <Slider value={st.gap} min={0} max={48} onChange={(v) => s.set("gap", v)} className="w-40" />
        </Row>
        <Row label={`${t("maxWidth")} · ${st.webtoonMaxWidth}px`}>
          <Slider
            value={st.webtoonMaxWidth}
            min={400}
            max={1600}
            step={20}
            onChange={(v) => s.set("webtoonMaxWidth", v)}
            className="w-40"
          />
        </Row>
        <Row label={`${t("scrollSpeed")} · ${st.webtoonSpeed}`}>
          <Slider
            value={st.webtoonSpeed}
            min={10}
            max={200}
            onChange={(v) => s.set("webtoonSpeed", v)}
            className="w-40"
          />
        </Row>
      </Section>

      {/* --------------------------- zoom & input ------------------------- */}
      <Section title={t("zoomInput")} icon="sliders">
        <Row label={`${t("zoomSensitivity")} · ${Math.round(st.zoomStep * 100)}%`}>
          <Slider
            value={Math.round(st.zoomStep * 100)}
            min={1}
            max={20}
            onChange={(v) => s.set("zoomStep", v / 100)}
            className="w-40"
          />
        </Row>
        <Row label={`${t("minZoom")} · ${Math.round(st.minZoom * 100)}%`}>
          <Slider
            value={Math.round(st.minZoom * 100)}
            min={10}
            max={90}
            onChange={(v) => s.set("minZoom", v / 100)}
            className="w-40"
          />
        </Row>
        <Field label={t("tapZoneLayout")}>
          <Segmented
            value={st.tapZones}
            onChange={(v) => s.set("tapZones", v)}
            options={[
              { value: "default", label: t("normal") },
              { value: "reversed", label: t("reversed") },
              { value: "off", label: t("off") },
            ]}
          />
        </Field>
        <Row label={`${t("tapZoneSize")} · ${st.tapZoneSize}%`}>
          <Slider
            value={st.tapZoneSize}
            min={15}
            max={35}
            onChange={(v) => s.set("tapZoneSize", v)}
            className="w-40"
          />
        </Row>
        <Row label={t("swipeEnabled")}>
          <Toggle checked={st.swipe} onChange={(v) => s.set("swipe", v)} />
        </Row>
        <Row label={t("volumeKeys")}>
          <Toggle checked={st.volumeKeys} onChange={(v) => s.set("volumeKeys", v)} />
        </Row>
        <Row label={t("smartScroll")}>
          <Toggle checked={st.smartScroll} onChange={(v) => s.set("smartScroll", v)} />
        </Row>
        <Row label={t("scrollPastEnd")}>
          <Toggle checked={st.scrollPastEnd} onChange={(v) => s.set("scrollPastEnd", v)} />
        </Row>
      </Section>

      {/* ------------------------- page-turn direction -------------------- */}
      <Section title={t("turnDirection")} icon="forward">
        <Segmented
          value={st.turnDirection}
          onChange={(v) => s.set("turnDirection", v)}
          options={[
            { value: "follow", label: t("follow") },
            { value: "right", label: t("forceRight") },
            { value: "left", label: t("forceLeft") },
          ]}
        />
        <Row label={t("invertTap")}>
          <Toggle checked={st.invertTap} onChange={(v) => s.set("invertTap", v)} />
        </Row>
        <Row label={t("invertSwipe")}>
          <Toggle checked={st.invertSwipe} onChange={(v) => s.set("invertSwipe", v)} />
        </Row>
        <Row label={t("invertKeys")}>
          <Toggle checked={st.invertKeys} onChange={(v) => s.set("invertKeys", v)} />
        </Row>
        <Row label={t("invertWheel")}>
          <Toggle checked={st.invertWheel} onChange={(v) => s.set("invertWheel", v)} />
        </Row>
        <Field label={t("transition")}>
          <Segmented
            value={st.transition}
            onChange={(v) => s.set("transition", v)}
            options={[
              { value: "slide", label: t("slide") },
              { value: "fade", label: t("fade") },
              { value: "none", label: t("instant") },
            ]}
          />
        </Field>
        <Row label={`${t("speed")} · ${st.transitionSpeed}ms`}>
          <Slider
            value={st.transitionSpeed}
            min={60}
            max={600}
            step={20}
            onChange={(v) => s.set("transitionSpeed", v)}
            className="w-40"
          />
        </Row>
      </Section>

      {/* ------------------------------- light ---------------------------- */}
      <Section title={t("light")} icon="sun">
        <Row label={`${t("brightness")} · ${st.brightness}%`}>
          <Slider value={st.brightness} min={30} max={130} onChange={(v) => s.set("brightness", v)} className="w-40" />
        </Row>
        <Row label={`${t("dim")} · ${st.dim}%`}>
          <Slider value={st.dim} min={0} max={80} onChange={(v) => s.set("dim", v)} className="w-40" />
        </Row>
        <Row label={`${t("warmth")} · ${st.warmth}%`}>
          <Slider value={st.warmth} min={0} max={80} onChange={(v) => s.set("warmth", v)} className="w-40" />
        </Row>
        <Row label={st.lang === "ar" ? "تذكُّر القيم بين المجلدات" : "Remember between volumes"}>
          <Toggle checked={st.rememberLight} onChange={(v) => s.set("rememberLight", v)} />
        </Row>
      </Section>

      {/* ---------------------------- shortcuts --------------------------- */}
      <Section title={t("shortcuts")} icon="grid">
        <div className="space-y-1">
          {Object.keys(DEFAULT_KEYMAP).map((action) => (
            <div key={action} className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm">{action.replace(/([A-Z])/g, " $1")}</span>
              <div className="flex items-center gap-2">
                {dupes.has(st.keymap[action]) && (
                  <span className="text-[11px] text-amber-400">⚠ {t("duplicateKey")}</span>
                )}
                <button
                  onClick={() => setCapture(action)}
                  className={cn(
                    "tap min-w-24 rounded-lg border px-3 py-1.5 font-mono text-xs",
                    capture === action ? "border-accent bg-accent/20" : "border-line bg-surface2",
                  )}
                >
                  {capture === action ? "…" : st.keymap[action]}
                </button>
              </div>
            </div>
          ))}
          <Button variant="soft" className="mt-2" onClick={() => s.set("keymap", { ...DEFAULT_KEYMAP })}>
            {t("restoreDefaults")}
          </Button>
        </div>
      </Section>

      {/* --------------------------- performance -------------------------- */}
      <Section title={t("performance")} icon="layers">
        <Field label={t("prerender")}>
          <Segmented
            value={st.prerender}
            onChange={(v) => s.set("prerender", v)}
            options={[
              { value: "volume", label: t("wholeVolume") },
              { value: "window", label: t("windowAround") },
            ]}
          />
        </Field>
        {st.prerender === "window" && (
          <Row label={`${t("windowSize")} · ${st.windowSize}`}>
            <Slider
              value={st.windowSize}
              min={6}
              max={120}
              onChange={(v) => s.set("windowSize", v)}
              className="w-40"
            />
          </Row>
        )}
        <Row label={`${t("renderQuality")} · ${st.renderQuality}%`}>
          <Slider
            value={st.renderQuality}
            min={50}
            max={100}
            onChange={(v) => s.set("renderQuality", v)}
            className="w-40"
          />
        </Row>
        <Row label={t("hwAccel")}>
          <Toggle checked={st.hwAccel} onChange={(v) => s.set("hwAccel", v)} />
        </Row>
        <Row label={`${t("thumbCache")} · ${st.thumbCacheMB} MB`}>
          <Slider
            value={st.thumbCacheMB}
            min={20}
            max={500}
            step={10}
            onChange={(v) => s.set("thumbCacheMB", v)}
            className="w-40"
          />
        </Row>
        <Row label={`${thumbCacheSize()} cached thumbnails`}>
          <Button
            variant="soft"
            onClick={() => {
              clearImageCaches();
              s.toast(t("cacheCleared"));
            }}
          >
            {t("clearCache")}
          </Button>
        </Row>
      </Section>

      {/* ----------------------------- library ---------------------------- */}
      <Section title={t("libraryGroup")} icon="grid">
        <Field label={t("defaultSort")}>
          <Select
            value={st.sortBy}
            onChange={(v) => s.set("sortBy", v)}
            options={[
              { value: "name", label: t("sortName") },
              { value: "added", label: t("sortAdded") },
              { value: "lastRead", label: t("sortLastRead") },
            ]}
          />
        </Field>
        <Field label={t("density")}>
          <Segmented
            value={st.density}
            onChange={(v) => s.set("density", v)}
            options={[
              { value: "comfortable", label: t("comfortable") },
              { value: "compact", label: t("compact") },
            ]}
          />
        </Field>
        <Row label={t("autoMarkRead")}>
          <Toggle checked={st.autoMarkRead} onChange={(v) => s.set("autoMarkRead", v)} />
        </Row>
      </Section>

      {/* ------------------------------- data ----------------------------- */}
      <Section title={t("data")} icon="download">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="soft"
            onClick={() => downloadJson(s.exportData(), `kuro-manga-backup-${Date.now()}.json`)}
          >
            <Icon name="download" className="h-4 w-4" /> {t("backup")}
          </Button>
          <Button
            variant="soft"
            onClick={async () => {
              const data = await pickJsonFile();
              if (data) setConfirmRestore(data);
            }}
          >
            <Icon name="up" className="h-4 w-4" /> {t("restore")}
          </Button>
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            <Icon name="trash" className="h-4 w-4" /> {t("resetAll")}
          </Button>
        </div>
      </Section>

      {/* ------------------------------ about ----------------------------- */}
      <Section title={t("about")} icon="book">
        <Row label={t("version")} hint={`Kuro Manga ${APP_VERSION} · Tauri 2.0 shell`} />
        <Row
          label={t("licenses")}
          hint="React (MIT) · Zustand (MIT) · Tailwind CSS (MIT) · Tauri (MIT/Apache-2.0) · zip reading via the platform DecompressionStream"
        />
        <Row label={t("repo")}>
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="tap rounded-xl bg-surface2 px-3 py-2 text-sm text-accent"
          >
            github.com/your-name/kuro-manga
          </a>
        </Row>
      </Section>

      <Confirm
        open={confirmReset}
        text={t("resetQ")}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          s.resetAll();
          setConfirmReset(false);
          s.toast(t("cacheCleared"));
        }}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
      />
      <Confirm
        open={!!confirmRestore}
        text={t("restoreQ")}
        onCancel={() => setConfirmRestore(null)}
        onConfirm={() => {
          s.importData(confirmRestore);
          setConfirmRestore(null);
          s.toast(t("backupRestored"));
        }}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
      />
    </div>
  );
}
