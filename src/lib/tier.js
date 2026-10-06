// Status PRO z dawnej płatnej wersji FinTrack PRO.
//
// Od 2.6.0 Sidegig jest w całości darmowy — nie ma limitów ani zakupów. Zapis statusu
// zostaje tylko po to, żeby nie zgubić danych użytkownika: synchronizuje się przez
// Firestore (SYNC_KEYS: proStatus) i trafia do kopii, ale niczego już nie odblokowuje.

const PRO_KEY = "ft_pro_status";

/**
 * Zwraca raw payload z localStorage żeby App mógł go syncować przez Firestore.
 * Bez wywoływania getProStatus() bo ten sprawdza expiresAt i mógłby zwrócić null
 * dla wygasłej licencji którą i tak chcemy zachować w sync.
 */
function getProStatusRaw() {
  try {
    const raw = localStorage.getItem(PRO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Ustaw status PRO z remote sync (Firestore). Używane gdy user zaloguje się
 * na drugim urządzeniu - powinien dostać swoje PRO bez ponownej aktywacji.
 * v1.3.0: ignoruje pole licenseKey ze starych payloads (graceful degradation).
 */
function setProStatusFromRemote(remoteData) {
  if (!remoteData || typeof remoteData !== "object") return;
  if (!remoteData.type || !remoteData.since) return;
  // Nie nadpisuj jeśli lokalna aktywacja jest świeższa
  const local = getProStatusRaw();
  if (local && local.since && remoteData.since && local.since >= remoteData.since) return;
  // Sanitization: usuwamy stare licenseKey, normalizujemy source
  const clean = {
    type: remoteData.type,
    since: remoteData.since,
    expiresAt: remoteData.expiresAt || null,
    source: remoteData.source || "unknown",
  };
  localStorage.setItem(PRO_KEY, JSON.stringify(clean));
}

export { getProStatusRaw, setProStatusFromRemote };
