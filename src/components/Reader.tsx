import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { makeT } from "../lib/i18n";
import { registry, renderPage, type RenderedPage } from "../lib/sources";
import { clamp } from "../lib/util";
import { Button, Cover, Icon, IconButton, Modal, ProgressBar, Spinner } from "./ui";
import QuickSettings from "./QuickSettings";
import { copyBlob, saveBlob, shareBlob } from "../lib/actions";
import { cn } from "../utils/cn";

interface Dim {
  w: number;
  h: number;
}

const DEFAULT_DIM: Dim = { w: 900, h: 1300 };

export default function Reader({ volumeId }: { volumeId: string }) {
  const s = useApp();
  const st = s.settings;
  const t = makeT(st.lang);
  const vol = s.lib.volumes[volumeId];
  const series = vol ? s.lib.series[vol.seriesId] : undefined;
  const source = registry.sources.get(volumeId);

  /* ------------------------------ state ------------------------------ */
  const [pages, setPages] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [urls, setUrls] = useState<Record<number, RenderedPage>>({});
  const [preparedCount, setPreparedCount] = useState(0);
  const [skipGate, setSkipGate] = useState(false);
  const [gateArmed, setGateArmed] = useState(true);
  const [uiVisible, setUiVisible] = useState(true);
  const [thumbsOpen, setThumbsOpen] = useState(st.thumbsPanel);
  const [drawer, setDrawer] = useState(false);
  const [quick, setQuick] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [endCard, setEndCard] = useState(false);
  const [offsetY, setOffsetY] = useState(0);
  const [turn, setTurn] = useState<{ n: number; dir: 1 | -1 }>({ n: 0, dir: 1 });

  const dims = useRef<Map<number, Dim>>(new Map());
  const [dimsVersion, setDimsVersion] = useState(0);
  const areaRef = useRef<HTMLDivElement>(null);
  const webtoonRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1024, h: 768 });

  const total = pages?.length ?? vol?.pageCount ?? 0;
  const dir = (series && s.seriesSettings[series.id]?.direction) ?? st.direction;
  const rtl = dir === "rtl";

  /* --------------------------- measurements --------------------------- */
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /* ------------------------------ loading ----------------------------- */
  useEffect(() => {
    let alive = true;
    setPages(null);
    setLoadError(null);
    setUrls({});
    setPreparedCount(0);
    setSkipGate(false);
    setGateArmed(true);
    setEndCard(false);
    setOffsetY(0);
    dims.current = new Map();
    if (!source) {
      setLoadError("missing");
      return;
    }
    source
      .list()
      .then((list) => {
        if (!alive) return;
        setPages(list);
        const saved = useApp.getState().progress[volumeId];
        setCurrent(clamp(saved?.page ?? 0, 0, Math.max(0, list.length - 1)));
      })
      .catch((e) => alive && setLoadError(e?.message || "could not be read"));
    return () => {
      alive = false;
    };
  }, [volumeId, source]);

  /* --------------------------- layout helpers -------------------------- */
  const dimOf = useCallback((i: number) => dims.current.get(i) ?? DEFAULT_DIM, [dimsVersion]);

  const isWide = useCallback(
    (i: number) => {
      const d = dims.current.get(i);
      return d ? d.w > d.h * 1.05 : false;
    },
    [dimsVersion],
  );

  /** double-page spreads with automatic wide-page detection */
  const spreads = useMemo(() => {
    if (st.mode !== "double" || !total) return null;
    const out: number[][] = [];
    let i = 0;
    while (i < total) {
      if ((i === 0 && st.firstPageAlone) || isWide(i)) {
        out.push([i]);
        i += 1;
        continue;
      }
      if (i + 1 < total && !isWide(i + 1)) {
        out.push([i, i + 1]);
        i += 2;
      } else {
        out.push([i]);
        i += 1;
      }
    }
    return out;
  }, [st.mode, st.firstPageAlone, total, dimsVersion, isWide]);

  const activeIdxs = useMemo(() => {
    if (st.mode !== "double" || !spreads) return [current];
    return spreads.find((sp) => sp.includes(current)) ?? [current];
  }, [spreads, current, st.mode]);

  const naturalSize = useMemo(() => {
    let w = 0;
    let h = 0;
    activeIdxs.forEach((i) => {
      const d = dimOf(i);
      w += d.w;
      h = Math.max(h, d.h);
    });
    return { w: w || DEFAULT_DIM.w, h: h || DEFAULT_DIM.h };
  }, [activeIdxs, dimOf]);

  /**
   * zoom = fraction of the screen width the page (or spread) occupies.
   * 100% == page edges touch the screen edges. Never above 1.
   */
  const zoom = useMemo(() => {
    const { w, h } = naturalSize;
    const W = size.w;
    const H = size.h;
    if (st.fit === "manual") return clamp(st.zoom, st.minZoom, 1);
    if (st.fit === "width") return 1;
    if (st.fit === "original") return clamp(Math.min(1, w / Math.max(1, W)), st.minZoom, 1);
    // screen / height
    return clamp(Math.min(1, (H * w) / (h * Math.max(1, W))), st.minZoom, 1);
  }, [st.fit, st.zoom, st.minZoom, naturalSize, size]);

  const displayW = Math.max(1, size.w * zoom);
  const displayH = (displayW * naturalSize.h) / naturalSize.w;
  const overflow = Math.max(0, displayH - size.h);

  useEffect(() => {
    setOffsetY((o) => clamp(o, -overflow, 0));
  }, [overflow, current]);

  /* ----------------------------- rendering ---------------------------- */
  const dpr = st.hwAccel ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const targetWidthFor = useCallback(
    (i: number) => {
      const d = dims.current.get(i);
      let z = 1;
      if (d) {
        if (st.fit === "manual") z = clamp(st.zoom, st.minZoom, 1);
        else if (st.fit === "width") z = 1;
        else if (st.fit === "original") z = Math.min(1, d.w / Math.max(1, size.w));
        else z = Math.min(1, (size.h * d.w) / (d.h * Math.max(1, size.w)));
      }
      const share = st.mode === "double" ? 0.5 : 1;
      return Math.max(420, Math.round(size.w * z * share * dpr));
    },
    [st.fit, st.zoom, st.minZoom, st.mode, size, dpr, dimsVersion],
  );

  const layoutKey = `${volumeId}|${st.mode}|${st.fit}|${st.zoom}|${st.gap}|${st.firstPageAlone}|${dir}|${Math.round(size.w / 40)}|${Math.round(size.h / 40)}|${st.renderQuality}`;

  const renderOne = useCallback(
    async (i: number) => {
      if (!source) return null;
      const r = await renderPage(source, i, targetWidthFor(i), st.renderQuality / 100);
      if (r.width) {
        const prev = dims.current.get(i);
        if (!prev || prev.w !== r.width) {
          dims.current.set(i, { w: r.width, h: r.height });
          setDimsVersion((v) => v + 1);
        }
      }
      setUrls((u) => (u[i]?.url === r.url ? u : { ...u, [i]: r }));
      return r;
    },
    [source, targetWidthFor, st.renderQuality],
  );

  /** background pre-render: current page first, then outward (next before previous) */
  useEffect(() => {
    if (!pages || !source) return;
    let cancelled = false;
    setPreparedCount(0);
    const start = current;
    const order: number[] = [start];
    const scope =
      st.prerender === "window" ? Math.max(4, Math.round(st.windowSize / 2)) : pages.length;
    for (let d = 1; d <= scope; d++) {
      if (start + d < pages.length) order.push(start + d);
      if (start - d >= 0) order.push(start - d);
    }
    (async () => {
      let done = 0;
      for (const i of order) {
        if (cancelled) return;
        try {
          await renderOne(i);
        } catch {
          /* skip unreadable page */
        }
        done++;
        if (done % 2 === 0 || done === order.length) setPreparedCount(done);
      }
      setPreparedCount(order.length);
      if (!cancelled) setGateArmed(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, pages]);

  /** make sure the visible page(s) are ready immediately after a turn */
  useEffect(() => {
    if (!pages) return;
    activeIdxs.forEach((i) => {
      if (!urls[i]) renderOne(i).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdxs.join(","), pages, layoutKey]);

  const scopeTotal =
    st.prerender === "window"
      ? Math.min(total, Math.max(4, st.windowSize))
      : total;
  const activeReady = activeIdxs.every((i) => !!urls[i]);
  const gateOpen =
    skipGate ||
    (st.prerender === "window" ? activeReady : !gateArmed && activeReady);

  /* ----------------------------- progress ----------------------------- */
  useEffect(() => {
    if (!pages || !vol) return;
    s.saveProgress(volumeId, vol.seriesId, current, pages.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, pages, volumeId]);

  /* ---------------------------- navigation ---------------------------- */
  const siblings = series?.volumeIds ?? [];
  const volIndex = siblings.indexOf(volumeId);

  const openVolume = useCallback(
    (id?: string) => {
      if (!id) return;
      useApp.setState({ route: { name: "reader", volumeId: id } });
      setDrawer(false);
      setEndCard(false);
    },
    [],
  );

  const goTo = useCallback(
    (page: number, from: "start" | "end" = "start") => {
      const next = clamp(page, 0, Math.max(0, total - 1));
      setCurrent(next);
      // forward keeps the top of the page, backward lands on its bottom
      setOffsetY(from === "start" ? 0 : -999999);
      setEndCard(false);
    },
    [total],
  );

  useEffect(() => {
    if (offsetY === -999999) setOffsetY(-overflow);
  }, [offsetY, overflow]);

  const step = useCallback(
    (delta: 1 | -1) => {
      if (st.mode === "double" && spreads) {
        const idx = spreads.findIndex((sp) => sp.includes(current));
        const target = idx + delta;
        if (target < 0) {
          setEndCard(true);
          return;
        }
        if (target >= spreads.length) {
          setEndCard(true);
          return;
        }
        goTo(spreads[target][0], delta === 1 ? "start" : "end");
        setTurn((x) => ({ n: x.n + 1, dir: delta }));
        return;
      }
      const next = current + delta;
      if (next < 0 || next >= total) {
        setEndCard(true);
        return;
      }
      goTo(next, delta === 1 ? "start" : "end");
      setTurn((x) => ({ n: x.n + 1, dir: delta }));
    },
    [current, total, st.mode, spreads, goTo],
  );

  /** physical side -> logical direction, honouring every inversion setting */
  const sideIsNext = useCallback(
    (side: "left" | "right", kind: "tap" | "swipe" | "key") => {
      let nextSide: "left" | "right";
      if (st.turnDirection === "right") nextSide = "right";
      else if (st.turnDirection === "left") nextSide = "left";
      else nextSide = rtl ? "left" : "right";
      let isNext = side === nextSide;
      if (kind === "tap" && st.invertTap) isNext = !isNext;
      if (kind === "swipe" && st.invertSwipe) isNext = !isNext;
      if (kind === "key" && st.invertKeys) isNext = !isNext;
      return isNext;
    },
    [st.turnDirection, st.invertTap, st.invertSwipe, st.invertKeys, rtl],
  );

  /* ------------------------------ zooming ----------------------------- */
  const applyZoom = useCallback(
    (z: number) => {
      s.setMany({ zoom: clamp(Math.round(z * 1000) / 1000, st.minZoom, 1), fit: "manual" });
    },
    [st.minZoom, s],
  );

  /* ------------------------- wheel / pointer --------------------------- */
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (st.mode === "webtoon") return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const notches = clamp(e.deltaY / 100, -3, 3);
        applyZoom(zoom - notches * st.zoomStep);
        return;
      }
      e.preventDefault();
      const down = (st.invertWheel ? -1 : 1) * (e.deltaY > 0 ? 1 : -1);
      if (overflow > 0) {
        const o = offsetRef.current;
        const atEdge = (down > 0 && o <= -overflow + 0.5) || (down < 0 && o >= -0.5);
        if (atEdge && st.scrollPastEnd) {
          step(down > 0 ? 1 : -1);
          return;
        }
        setOffsetY(clamp(o - down * 90, -overflow, 0));
      } else {
        step(down > 0 ? 1 : -1);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, overflow, st.mode, st.zoomStep, st.invertWheel, st.scrollPastEnd, applyZoom, step]);

  const offsetRef = useRef(0);
  useEffect(() => {
    offsetRef.current = offsetY;
  }, [offsetY]);

  const ptr = useRef({ x: 0, y: 0, t: 0, moved: false, startOffset: 0, lastTap: 0, timer: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    ptr.current = {
      x: e.clientX,
      y: e.clientY,
      t: Date.now(),
      moved: false,
      startOffset: offsetY,
      lastTap: ptr.current.lastTap,
      timer: window.setTimeout(() => {
        ptr.current.moved = true;
        setSheet(true);
      }, 650),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = ptr.current;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      window.clearTimeout(p.timer);
      p.moved = true;
    }
    if (overflow > 0 && Math.abs(dy) > Math.abs(dx) && e.buttons) {
      setOffsetY(clamp(p.startOffset + dy, -overflow, 0));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = ptr.current;
    window.clearTimeout(p.timer);
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const dt = Date.now() - p.t;
    const W = size.w;

    if (st.mode === "webtoon") {
      // only the interface toggle is available while scrolling a long strip
      if (!p.moved && dt < 400) setUiVisible((v) => !v);
      return;
    }

    // swipe
    if (st.swipe && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) && dt < 700) {
      const side = dx < 0 ? "right" : "left"; // swiping left reveals the right side
      step(sideIsNext(side, "swipe") ? 1 : -1);
      return;
    }
    if (dir === "vertical" && st.swipe && Math.abs(dy) > 70 && dt < 700 && overflow === 0) {
      const up = dy < 0;
      step((st.invertSwipe ? !up : up) ? 1 : -1);
      return;
    }
    if (p.moved || dt > 500) return;

    // double tap toggles current fit <-> 100%
    const now = Date.now();
    if (now - p.lastTap < 300) {
      ptr.current.lastTap = 0;
      if (st.fit === "width" || (st.fit === "manual" && zoom >= 0.999)) s.set("fit", "screen");
      else s.set("fit", "width");
      return;
    }
    ptr.current.lastTap = now;

    if (st.tapZones === "off") {
      setUiVisible((v) => !v);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const inset = W * 0.04;
    const band = (W * st.tapZoneSize) / 100;
    const reversed = st.tapZones === "reversed";
    const leftZone = x > inset && x < inset + band;
    const rightZone = x < W - inset && x > W - inset - band;
    if (leftZone || rightZone) {
      let side: "left" | "right" = leftZone ? "left" : "right";
      if (reversed) side = side === "left" ? "right" : "left";
      const next = sideIsNext(side, "tap");
      if (st.smartScroll && overflow > 0) {
        const atBottom = offsetY <= -overflow + 1;
        const atTop = offsetY >= -1;
        if (next && !atBottom) {
          setOffsetY((o) => clamp(o - size.h * 0.9, -overflow, 0));
          return;
        }
        if (!next && !atTop) {
          setOffsetY((o) => clamp(o + size.h * 0.9, -overflow, 0));
          return;
        }
      }
      step(next ? 1 : -1);
      return;
    }
    setUiVisible((v) => !v);
  };

  /* ---------------------------- keyboard ------------------------------ */
  useEffect(() => {
    const chord = (e: KeyboardEvent) => {
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.shiftKey && e.key.length > 1) parts.push("Shift");
      let k = e.key;
      if (k === "=") k = "+";
      parts.push(k.length === 1 ? k.toLowerCase() : k);
      return parts.join("+");
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const c = chord(e);
      const km = st.keymap;
      const act = Object.keys(km).find((a) => km[a].toLowerCase() === c.toLowerCase());
      const prevent = () => e.preventDefault();
      switch (act) {
        case "nextPage":
          prevent();
          step(sideIsNext(km.nextPage === "ArrowLeft" ? "left" : "right", "key") ? 1 : -1);
          return;
        case "prevPage":
          prevent();
          step(sideIsNext(km.prevPage === "ArrowLeft" ? "left" : "right", "key") ? 1 : -1);
          return;
        case "nextVolume":
          prevent();
          openVolume(siblings[volIndex + 1]);
          return;
        case "prevVolume":
          prevent();
          openVolume(siblings[volIndex - 1]);
          return;
        case "toggleUI":
          prevent();
          setUiVisible((v) => !v);
          return;
        case "toggleThumbs":
          prevent();
          setThumbsOpen((v) => {
            s.set("thumbsPanel", !v);
            return !v;
          });
          return;
        case "zoomIn":
          prevent();
          applyZoom(zoom + st.zoomStep);
          return;
        case "zoomOut":
          prevent();
          applyZoom(zoom - st.zoomStep);
          return;
        case "resetZoom":
          prevent();
          s.set("fit", "screen");
          return;
        case "cycleMode":
          prevent();
          s.set("mode", st.mode === "single" ? "double" : st.mode === "double" ? "webtoon" : "single");
          return;
        case "cycleDirection":
          prevent();
          if (series)
            useApp.setState((x) => ({
              seriesSettings: {
                ...x.seriesSettings,
                [series.id]: {
                  ...x.seriesSettings[series.id],
                  direction: dir === "rtl" ? "ltr" : dir === "ltr" ? "vertical" : "rtl",
                },
              },
            }));
          return;
        case "bookmark":
          prevent();
          s.toggleBookmark(volumeId, current);
          return;
        case "fullscreen":
          prevent();
          toggleFullscreen();
          return;
      }
      // built-ins
      if (e.key === "Escape") {
        if (quick || drawer || bookmarksOpen || sheet) {
          setQuick(false);
          setDrawer(false);
          setBookmarksOpen(false);
          setSheet(false);
        } else s.back();
        return;
      }
      if (e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        step(1);
      } else if (e.key === "PageUp") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "Home") {
        goTo(0);
      } else if (e.key === "End") {
        goTo(total - 1);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (overflow > 0) {
          e.preventDefault();
          setOffsetY((o) => clamp(o + (e.key === "ArrowDown" ? -80 : 80), -overflow, 0));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [st, zoom, overflow, step, sideIsNext, current, total, dir, series, siblings, volIndex, quick, drawer, bookmarksOpen, sheet, applyZoom, goTo, openVolume, s, volumeId]);

  /* ----------------------------- webtoon ------------------------------ */
  useEffect(() => {
    if (st.mode !== "webtoon") return;
    const el = webtoonRef.current;
    if (!el) return;
    const onScroll = () => {
      const kids = Array.from(el.querySelectorAll("[data-page]")) as HTMLElement[];
      const y = el.scrollTop + el.clientHeight * 0.35;
      for (let i = kids.length - 1; i >= 0; i--) {
        if (kids[i].offsetTop <= y) {
          const idx = parseInt(kids[i].dataset.page!, 10);
          if (idx !== current) setCurrent(idx);
          break;
        }
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [st.mode, current, pages]);

  /* --------------------------- misc helpers --------------------------- */
  const toggleFullscreen = () => {
    const d: any = document;
    if (!d.fullscreenElement) d.documentElement.requestFullscreen?.().catch(() => {});
    else d.exitFullscreen?.();
  };

  const currentBlob = useCallback(async () => {
    if (!source) throw new Error("no source");
    return await source.load(current);
  }, [source, current]);

  const overlayStyle: React.CSSProperties = {
    filter: `brightness(${st.brightness}%)`,
  };

  if (!vol)
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Button onClick={() => s.back()}>{t("back")}</Button>
      </div>
    );

  const bookmarks = s.bookmarks[volumeId] ?? [];
  const ordered = rtl ? [...activeIdxs].reverse() : activeIdxs;
  const topY = overflow > 0 ? offsetY : (size.h - displayH) / 2;

  return (
    <div className="fixed inset-0 flex select-none overflow-hidden" style={{ background: "var(--reader-bg)" }}>
      {/* ------------------------- thumbnails panel ------------------------ */}
      {uiVisible && thumbsOpen && (
        <ThumbPanel
          volumeId={volumeId}
          total={total}
          current={current}
          onPick={(i) => goTo(i)}
        />
      )}

      {/* ----------------------------- page area --------------------------- */}
      <div className="relative min-w-0 flex-1">
        <div
          ref={areaRef}
          className={cn(
            "absolute inset-0 overflow-hidden",
            st.mode === "webtoon" ? "touch-pan-y" : "touch-none",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onContextMenu={(e) => {
            e.preventDefault();
            setSheet(true);
          }}
        >
          {loadError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/80">
              <Icon name="close" className="h-10 w-10 text-red-400" />
              <div>{t("fileUnreadable")}</div>
              <Button variant="soft" onClick={() => s.back()}>
                {t("backToSeries")}
              </Button>
            </div>
          ) : st.mode === "webtoon" ? (
            <div
              ref={webtoonRef}
              className="h-full w-full overflow-y-auto no-scrollbar"
              style={overlayStyle}
            >
              <div
                className="mx-auto flex flex-col items-center"
                style={{ gap: st.webtoonGap, width: Math.min(st.webtoonMaxWidth, size.w * zoom) }}
              >
                {Array.from({ length: total }, (_, i) => (
                  <WebtoonPage
                    key={i}
                    index={i}
                    url={urls[i]?.url}
                    dim={dims.current.get(i)}
                    onNeed={() => renderOne(i).catch(() => {})}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              <div
                className="absolute start-1/2 will-change-transform"
                style={{
                  width: displayW,
                  transform: `translateX(-50%) translateY(${topY}px)`,
                  ...overlayStyle,
                }}
              >
              <div
                key={`${turn.n}-${st.transition}`}
                className="flex w-full"
                style={{
                  gap: activeIdxs.length > 1 ? st.gap : 0,
                  animation:
                    st.transition === "none"
                      ? undefined
                      : `${st.transition === "fade" ? "rdr-fade" : turn.dir === 1 ? "rdr-next" : "rdr-prev"} ${st.transitionSpeed}ms ease-out`,
                }}
              >
                {ordered.map((i) => {
                  const d = dims.current.get(i) ?? DEFAULT_DIM;
                  const wShare = (d.w / naturalSize.w) * displayW;
                  return (
                    <div
                      key={i}
                      style={{ width: activeIdxs.length > 1 ? wShare : displayW }}
                      className="relative"
                    >
                      {urls[i] ? (
                        <img
                          src={urls[i].url}
                          alt=""
                          draggable={false}
                          className="block w-full"
                          style={{ height: "auto" }}
                        />
                      ) : (
                        <div
                          className="flex items-center justify-center bg-black/20"
                          style={{ aspectRatio: `${d.w}/${d.h}` }}
                        >
                          <Spinner />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            </>
          )}

          {/* light overlays (instant, no re-render) */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: `rgba(0,0,0,${st.dim / 100})` }}
          />
          <div
            className="pointer-events-none absolute inset-0 mix-blend-multiply"
            style={{ background: `rgba(255,170,60,${st.warmth / 100})` }}
          />

          {/* tap-zone hint (only while the UI is visible) */}
          {uiVisible && st.tapZones !== "off" && st.mode !== "webtoon" && (
            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute top-0 h-full bg-white/[0.04]"
                style={{ left: `${4}%`, width: `${st.tapZoneSize}%` }}
              />
              <div
                className="absolute top-0 h-full bg-white/[0.04]"
                style={{ right: `${4}%`, width: `${st.tapZoneSize}%` }}
              />
            </div>
          )}

          {/* preparing gate */}
          {!gateOpen && !loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white">
              <Spinner className="h-8 w-8" />
              <div className="text-sm">{t("preparingPages")}</div>
              <div className="w-56">
                <ProgressBar value={scopeTotal ? preparedCount / scopeTotal : 0} />
              </div>
              <div className="text-xs text-white/60">
                {Math.min(preparedCount, scopeTotal)} / {scopeTotal}
              </div>
              <Button variant="soft" onClick={() => setSkipGate(true)}>
                {t("startReading")}
              </Button>
            </div>
          )}

          {/* end of volume */}
          {endCard && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 text-white">
              <div className="text-lg font-semibold">
                {current >= total - 1 ? t("endOfVolume") : t("firstPage")}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="soft" onClick={() => openVolume(siblings[volIndex - 1])} disabled={volIndex <= 0}>
                  <Icon name="back" className="h-4 w-4 rtl:rotate-180" /> {t("prevVolume")}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => openVolume(siblings[volIndex + 1])}
                  disabled={volIndex >= siblings.length - 1}
                >
                  {t("nextVolume")} <Icon name="forward" className="h-4 w-4 rtl:rotate-180" />
                </Button>
                <Button variant="soft" onClick={() => s.back()}>
                  {t("backToSeries")}
                </Button>
              </div>
              <Button variant="ghost" onClick={() => setEndCard(false)}>
                {t("close")}
              </Button>
            </div>
          )}
        </div>

        {/* ------------------------------ top bar ---------------------------- */}
        {uiVisible && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40">
            <div className="pointer-events-auto flex items-center gap-1 bg-gradient-to-b from-black/80 to-transparent px-2 py-2 text-white">
              <IconButton
                icon="back"
                label={t("back")}
                className="rtl:rotate-180"
                onClick={() => s.back()}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{series?.name}</div>
                <div className="truncate text-xs text-white/60">{vol.name}</div>
              </div>
              {st.showPageIndicator && (
                <div className="rounded-full bg-black/40 px-3 py-1 text-xs tabular-nums">
                  {Math.min(current + 1, total)} / {total}
                </div>
              )}
              <IconButton
                icon="columns"
                label={t("thumbnails")}
                active={thumbsOpen}
                onClick={() => {
                  setThumbsOpen((v) => {
                    s.set("thumbsPanel", !v);
                    return !v;
                  });
                }}
              />
              <IconButton icon="layers" label={t("volumes")} active={drawer} onClick={() => setDrawer((v) => !v)} />
              <IconButton
                icon="bookmark"
                label={t("bookmark")}
                active={bookmarks.includes(current)}
                onClick={() => s.toggleBookmark(volumeId, current)}
                onDoubleClick={() => setBookmarksOpen(true)}
              />
              <IconButton icon="list" label={t("bookmarks")} onClick={() => setBookmarksOpen(true)} />
              <IconButton icon="sliders" label={t("quickSettings")} active={quick} onClick={() => setQuick((v) => !v)} />
              <IconButton icon="expand" label={t("fullscreen")} onClick={toggleFullscreen} />
            </div>
          </div>
        )}

        {/* ----------------------------- bottom bar -------------------------- */}
        {uiVisible && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
            <div className="pointer-events-auto flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-6 text-white">
              <IconButton
                icon="back"
                label={t("prevVolume")}
                className="rtl:rotate-180"
                onClick={() => openVolume(siblings[volIndex - 1])}
              />
              <IconButton
                icon="up"
                label={t("page")}
                className="rotate-[-90deg]"
                onClick={() => step(-1)}
              />
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, total - 1)}
                  value={current}
                  onChange={(e) => goTo(parseInt(e.target.value, 10))}
                  className="w-full accent-[var(--accent)]"
                  style={{ direction: rtl ? "rtl" : "ltr" }}
                />
                <span className="w-16 shrink-0 text-center text-xs tabular-nums">
                  {Math.min(current + 1, total)}/{total}
                </span>
              </div>
              <IconButton
                icon="down"
                label={t("page")}
                className="rotate-[-90deg]"
                onClick={() => step(1)}
              />
              <IconButton
                icon="forward"
                label={t("nextVolume")}
                className="rtl:rotate-180"
                onClick={() => openVolume(siblings[volIndex + 1])}
              />
            </div>
          </div>
        )}

        {uiVisible && quick && (
          <QuickSettings
            onClose={() => setQuick(false)}
            seriesId={series?.id ?? ""}
            thumbsOpen={thumbsOpen}
            setThumbsOpen={(v) => {
              setThumbsOpen(v);
              s.set("thumbsPanel", v);
            }}
          />
        )}
      </div>

      {/* --------------------------- volumes drawer -------------------------- */}
      {uiVisible && drawer && (
        <div className="absolute inset-y-0 end-0 z-40 w-72 max-w-[80vw] overflow-y-auto border-s border-line bg-surface/95 p-2 backdrop-blur scroll-thin">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-semibold">{t("volumes")}</span>
            <IconButton icon="close" label={t("close")} onClick={() => setDrawer(false)} />
          </div>
          {siblings.map((id) => {
            const v = s.lib.volumes[id];
            const pr = s.progress[id];
            return (
              <button
                key={id}
                onClick={() => openVolume(id)}
                className={cn(
                  "tap mb-1 flex w-full items-center gap-2 rounded-xl p-2 text-start",
                  id === volumeId ? "bg-accent/20 ring-1 ring-[var(--accent)]" : "hover:bg-surface2",
                )}
              >
                <Cover cacheKey={id} className="h-16 w-11" width={120} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{v?.name}</div>
                  <div className="text-xs text-muted">
                    {v?.pageCount ? `${v.pageCount} ${t("pages")}` : ""}
                  </div>
                  {pr && pr.total > 0 && (
                    <ProgressBar className="mt-1" value={(pr.page + 1) / pr.total} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ---------------------------- bookmarks ----------------------------- */}
      <Modal open={bookmarksOpen} onClose={() => setBookmarksOpen(false)} title={t("bookmarks")}>
        {bookmarks.length === 0 ? (
          <p className="text-sm text-muted">{t("noBookmarks")}</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {bookmarks.map((b) => (
              <button
                key={b}
                className="tap"
                onClick={() => {
                  goTo(b);
                  setBookmarksOpen(false);
                }}
              >
                <Cover
                  cacheKey={`${volumeId}#${b}`}
                  getter={() => source!.load(b)}
                  className="aspect-[2/3] w-full"
                  width={120}
                />
                <div className="mt-1 text-center text-xs">{b + 1}</div>
              </button>
            ))}
          </div>
        )}
        {bookmarks.length > 0 && (
          <Button variant="danger" className="mt-3 w-full" onClick={() => s.clearBookmarks(volumeId)}>
            {t("clearBookmarksQ")}
          </Button>
        )}
      </Modal>

      {/* --------------------------- page actions --------------------------- */}
      <Modal open={sheet} onClose={() => setSheet(false)} title={`${t("page")} ${current + 1}`}>
        <div className="space-y-2">
          <Button
            variant="soft"
            className="w-full justify-start"
            onClick={async () => {
              try {
                await saveBlob(await currentBlob(), `${series?.name}-${vol.name}-${current + 1}.jpg`);
                s.toast(t("savedToGallery"));
              } catch {
                s.toast(t("fileUnreadable"));
              }
              setSheet(false);
            }}
          >
            <Icon name="download" className="h-4 w-4" /> {t("saveToGallery")}
          </Button>
          <Button
            variant="soft"
            className="w-full justify-start"
            onClick={async () => {
              try {
                await copyBlob(await currentBlob());
                s.toast(t("copied"));
              } catch {
                s.toast(t("fileUnreadable"));
              }
              setSheet(false);
            }}
          >
            <Icon name="copy" className="h-4 w-4" /> {t("copy")}
          </Button>
          <Button
            variant="soft"
            className="w-full justify-start"
            onClick={async () => {
              try {
                await shareBlob(await currentBlob(), `${series?.name} ${vol.name} ${current + 1}`);
              } catch {
                s.toast(t("fileUnreadable"));
              }
              setSheet(false);
            }}
          >
            <Icon name="share" className="h-4 w-4" /> {t("share")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------------------- sub components ---------------------------- */

function ThumbPanel({
  volumeId,
  total,
  current,
  onPick,
}: {
  volumeId: string;
  total: number;
  current: number;
  onPick: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector(`[data-thumb="${current}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);
  const source = registry.sources.get(volumeId);
  return (
    <div
      ref={ref}
      className="z-30 h-full w-28 shrink-0 overflow-y-auto border-e border-black/40 bg-black/50 p-2 scroll-thin sm:w-32"
    >
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          data-thumb={i}
          onClick={() => onPick(i)}
          className={cn(
            "tap mb-2 w-full rounded-lg p-1 transition",
            i === current ? "bg-accent/30 ring-1 ring-[var(--accent)]" : "hover:bg-white/10",
          )}
        >
          <Cover
            cacheKey={`${volumeId}#${i}`}
            getter={source ? () => source.load(i) : undefined}
            className="aspect-[2/3] w-full"
            width={140}
          />
          <div className="mt-1 text-center text-[11px] text-white/70">{i + 1}</div>
        </button>
      ))}
    </div>
  );
}

function WebtoonPage({
  index,
  url,
  dim,
  onNeed,
}: {
  index: number;
  url?: string;
  dim?: Dim;
  onNeed: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && onNeed()),
      { rootMargin: "1200px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} data-page={index} className="w-full">
      {url ? (
        <img src={url} alt="" draggable={false} className="block w-full" />
      ) : (
        <div
          className="flex w-full items-center justify-center bg-black/20"
          style={{ aspectRatio: `${dim?.w ?? 900}/${dim?.h ?? 1300}` }}
        >
          <Spinner />
        </div>
      )}
    </div>
  );
}
