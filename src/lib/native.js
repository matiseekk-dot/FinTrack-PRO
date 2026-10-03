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
 * painted, route the Android back button to `onBack`.
 */
async function initNative({ onBack }) {
  if (!isNative) return;
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});
  const { App } = await import("@capacitor/app");
  App.addListener("backButton", () => {
    if (!onBack()) App.minimizeApp();
  });
  const { SplashScreen } = await import("@capacitor/splash-screen");
  SplashScreen.hide().catch(() => {});
}

export { isNative, sitePage, openExternal, linkProps, shareFile, initNative };
