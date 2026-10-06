// Android app (Capacitor) vs. the web/PWA build. Native plugins are imported
// lazily, so the web bundle only carries @capacitor/core.

import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

const isNative = Capacitor.isNativePlatform();

// Strony statyczne (polityka prywatności, regulamin) są na stronie www —
// aplikacja natywna serwuje tylko samą apkę, bez ścieżki /FinTrack-PRO/.
const SITE_URL = "https://matiseekk-dot.github.io/FinTrack-PRO/";

function sitePage(file) {
  return isNative ? SITE_URL + file : `/FinTrack-PRO/${file}`;
}

/** Opens an external page: Chrome Custom Tab on Android, new tab on the web. */
async function openExternal(url) {
  if (!isNative) { window.open(url, "_blank", "noopener"); return; }
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url, toolbarColor: "#060b14" });
}

/** Props for an <a> to an external page; on Android the tap goes through openExternal. */
function linkProps(url) {
  return {
    href: url, target: "_blank", rel: "noopener noreferrer",
    onClick: isNative ? (e) => { e.preventDefault(); openExternal(url); } : undefined,
  };
}

/**
 * Hands a generated file to the user. WebView downloads go nowhere, so on
 * Android the file is written to the app cache and opened in the share sheet
 * (Drive, Files, Gmail…). Give either `base64` or `text`.
 * Returns false when the user dismissed the share sheet.
 */
async function shareFile({ filename, base64, text, title }) {
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const { uri } = await Filesystem.writeFile({
    path: filename,
    directory: Directory.Cache,
    ...(base64 != null ? { data: base64 } : { data: text, encoding: Encoding.UTF8 }),
  });
  try {
    await Share.share({ title: title || filename, dialogTitle: title || filename, files: [uri] });
    return true;
  } catch (e) {
    if (/cancel/i.test(String(e && e.message))) return false;
    throw e;
  }
}

/**
 * One-time native setup: dark system bars, hide the splash once React has
 * painted, route the Android back button to `onBack` and app-icon shortcuts
 * to `onShortcut(id)` (also the one the app was launched from).
 */
async function initNative({ onBack, onShortcut }) {
  if (!isNative) return;
  if (onShortcut) {
    const { AppShortcuts } = await import("@capawesome/capacitor-app-shortcuts");
    AppShortcuts.addListener("click", (e) => e && e.shortcutId && onShortcut(e.shortcutId)).catch(() => {});
  }
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});
  const { App } = await import("@capacitor/app");
  App.addListener("backButton", () => {
    if (!onBack()) App.minimizeApp();
  });
  const { SplashScreen } = await import("@capacitor/splash-screen");
  SplashScreen.hide().catch(() => {});
}

/**
 * Skróty po przytrzymaniu ikony aplikacji: [{ id, title, icon }] — icon to nazwa
 * obrazka w res/drawable (ic_sc_*). Ustawiane od nowa, gdy zmieniają się moduły.
 */
async function setAppShortcuts(items) {
  if (!isNative) return;
  const { AppShortcuts } = await import("@capawesome/capacitor-app-shortcuts");
  await AppShortcuts.set({
    shortcuts: items.map(i => ({ id: i.id, title: i.title, description: i.title, androidIcon: i.icon })),
  }).catch(() => {});
}

/**
 * Udostępnia tekst (np. rozliczenie wyjazdu): arkusz udostępniania w aplikacji i w
 * przeglądarkach, które go mają; w pozostałych kopiuje do schowka. Zwraca "shared" | "copied" | null.
 */
async function shareText(text, title) {
  try {
    if (isNative) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, dialogTitle: title });
      return "shared";
    }
    if (navigator.share) { await navigator.share({ title, text }); return "shared"; }
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch (e) {
    if (/cancel|abort/i.test(String(e && (e.message || e.name)))) return null;
    try { await navigator.clipboard.writeText(text); return "copied"; } catch { return null; }
  }
}

export { isNative, sitePage, openExternal, linkProps, shareFile, initNative, setAppShortcuts, shareText };
