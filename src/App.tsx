import { useEffect } from "react";
import { useApp } from "./store";
import LibraryPage from "./components/Library";
import SeriesPage from "./components/SeriesPage";
import Reader from "./components/Reader";
import SettingsPage from "./components/SettingsPage";
import HistoryPage from "./components/HistoryPage";
import { Toasts } from "./components/ui";
import { setPageBudget } from "./lib/sources";

export default function App() {
  const route = useApp((s) => s.route);
  const theme = useApp((s) => s.settings.theme);
  const lang = useApp((s) => s.settings.lang);
  const thumbCacheMB = useApp((s) => s.settings.thumbCacheMB);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const light = theme === "light" || theme === "sunrise" || theme === "sepia";
    document.documentElement.style.colorScheme = light ? "light" : "dark";
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  useEffect(() => {
    // rough budget: a rendered page at display size ≈ 0.5 MB
    setPageBudget(Math.round((thumbCacheMB * 2) / 1));
  }, [thumbCacheMB]);

  // immersive full-screen behaviour (status/nav bars hidden on Android WebView)
  useEffect(() => {
    const el = document.documentElement as any;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", getComputedStyle(el).getPropertyValue("--bg").trim() || "#101114");
  }, [theme]);

  return (
    <div className="min-h-screen bg-bg text-ink">
      {route.name === "library" && <LibraryPage />}
      {route.name === "series" && <SeriesPage seriesId={route.seriesId} />}
      {route.name === "reader" && <Reader key={route.volumeId} volumeId={route.volumeId} />}
      {route.name === "settings" && <SettingsPage />}
      {route.name === "history" && <HistoryPage />}
      <Toasts />
    </div>
  );
}
