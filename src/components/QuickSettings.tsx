import { useApp, type FitMode, type PageMode, type ReadDir } from "../store";
import { makeT } from "../lib/i18n";
import { Button, Field, Icon, IconButton, Row, Segmented, Slider, Toggle } from "./ui";
import { clamp } from "../lib/util";

export default function QuickSettings({
  onClose,
  seriesId,
  thumbsOpen,
  setThumbsOpen,
}: {
  onClose: () => void;
  seriesId: string;
  thumbsOpen: boolean;
  setThumbsOpen: (v: boolean) => void;
}) {
  const s = useApp();
  const t = makeT(s.settings.lang);
  const st = s.settings;
  const dir = s.seriesSettings[seriesId]?.direction ?? st.direction;

  const setDir = (d: ReadDir) =>
    useApp.setState((x) => ({
      seriesSettings: { ...x.seriesSettings, [seriesId]: { ...x.seriesSettings[seriesId], direction: d } },
    }));

  const setZoom = (z: number) => {
    s.setMany({ zoom: clamp(Math.round(z * 100) / 100, st.minZoom, 1), fit: "manual" });
  };

  return (
    <div className="pointer-events-auto absolute end-2 top-14 z-40 max-h-[75vh] w-[21rem] max-w-[92vw] overflow-y-auto rounded-2xl border border-line bg-surface/97 p-3 shadow-2xl backdrop-blur scroll-thin">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("quickSettings")}</h3>
        <IconButton icon="close" label={t("close")} onClick={onClose} />
      </div>

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
          value={dir}
          onChange={setDir}
          options={[
            { value: "rtl", label: "RTL" },
            { value: "ltr", label: "LTR" },
            { value: "vertical", label: t("vertical") },
          ]}
        />
      </Field>

      <Field label={t("turnDirection")}>
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
        <Segmented
          value={st.transition}
          onChange={(v) => s.set("transition", v)}
          options={[
            { value: "slide", label: t("slide") },
            { value: "fade", label: t("fade") },
            { value: "none", label: t("instant") },
          ]}
        />
        <Row label={`${t("speed")} · ${st.transitionSpeed}ms`}>
          <Slider
            value={st.transitionSpeed}
            min={60}
            max={600}
            step={20}
            onChange={(v) => s.set("transitionSpeed", v)}
            className="w-32"
          />
        </Row>
      </Field>

      {st.mode === "double" && (
        <Field label={t("doubleOptions")}>
          <Row label={t("firstPageAlone")}>
            <Toggle checked={st.firstPageAlone} onChange={(v) => s.set("firstPageAlone", v)} />
          </Row>
          <Row label={`${t("gap")} · ${st.gap}px`}>
            <Slider value={st.gap} min={0} max={48} onChange={(v) => s.set("gap", v)} className="w-32" />
          </Row>
        </Field>
      )}

      {st.mode === "webtoon" && (
        <Field label={t("webtoonOptions")}>
          <Row label={`${t("scrollSpeed")} · ${st.webtoonSpeed}`}>
            <Slider
              value={st.webtoonSpeed}
              min={10}
              max={200}
              onChange={(v) => s.set("webtoonSpeed", v)}
              className="w-32"
            />
          </Row>
          <Row label={`${t("gap")} · ${st.webtoonGap}px`}>
            <Slider
              value={st.webtoonGap}
              min={0}
              max={60}
              onChange={(v) => s.set("webtoonGap", v)}
              className="w-32"
            />
          </Row>
          <Row label={`${t("maxWidth")} · ${st.webtoonMaxWidth}px`}>
            <Slider
              value={st.webtoonMaxWidth}
              min={400}
              max={1600}
              step={20}
              onChange={(v) => s.set("webtoonMaxWidth", v)}
              className="w-32"
            />
          </Row>
        </Field>
      )}

      <Field label={t("fit")}>
        <Segmented<FitMode>
          value={st.fit === "manual" ? "manual" : st.fit}
          onChange={(v) => s.set("fit", v)}
          options={[
            { value: "screen", label: t("fitScreen") },
            { value: "width", label: "100%" },
            { value: "height", label: t("fitHeight") },
            { value: "original", label: t("original") },
          ]}
        />
      </Field>

      <Field label={t("zoom")}>
        <div className="flex items-center gap-2">
          <IconButton icon="minus" label="-" onClick={() => setZoom(st.zoom - st.zoomStep)} />
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface2 px-2 py-1">
            <input
              type="number"
              min={Math.round(st.minZoom * 100)}
              max={100}
              value={Math.round(st.zoom * 100)}
              onChange={(e) => setZoom((parseFloat(e.target.value) || 0) / 100)}
              className="w-14 bg-transparent text-center text-sm outline-none"
            />
            <span className="text-xs text-muted">%</span>
          </div>
          <IconButton icon="plus" label="+" onClick={() => setZoom(st.zoom + st.zoomStep)} />
          <Button variant="soft" onClick={() => s.set("fit", "screen")}>
            {t("resetZoom")}
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted">100% = page width equals screen width.</p>
      </Field>

      <Field label={t("light")}>
        <Row label={`${t("brightness")} · ${st.brightness}%`}>
          <Slider
            value={st.brightness}
            min={30}
            max={130}
            onChange={(v) => s.set("brightness", v)}
            className="w-32"
          />
        </Row>
        <Row label={`${t("dim")} · ${st.dim}%`}>
          <Slider value={st.dim} min={0} max={80} onChange={(v) => s.set("dim", v)} className="w-32" />
        </Row>
        <Row label={`${t("warmth")} · ${st.warmth}%`}>
          <Slider value={st.warmth} min={0} max={80} onChange={(v) => s.set("warmth", v)} className="w-32" />
        </Row>
      </Field>

      <Field label={t("display")}>
        <Row label={t("showPageIndicator")}>
          <Toggle
            checked={st.showPageIndicator}
            onChange={(v) => s.set("showPageIndicator", v)}
          />
        </Row>
        <Row label={t("toggleThumbs")}>
          <Toggle checked={thumbsOpen} onChange={setThumbsOpen} />
        </Row>
      </Field>

      <div className="pt-1 text-[11px] text-muted">
        <Icon name="sliders" className="me-1 inline h-3 w-3" />
        {t("readerDefaults")} → {t("settings")}
      </div>
    </div>
  );
}
