// Lekkie szyfrowanie localStorage - AES-GCM z kluczem device-unique
// Notes: to NIE jest idealna ochrona (klucz leży w tej samej przeglądarce),
// ale chroni przed trywialnym wglądem (ktoś z dostępem do DevTools)
// i znacząco utrudnia analizę dump'a dysku.

const DEVICE_KEY = "ft_device_id";

async function getDeviceKey() {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    // Generuj device-unique ID raz (256-bit random)
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    deviceId = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  // Pochodzi z deviceId klucz AES-GCM
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(deviceId),
    { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: encoder.encode("fintrack-salt-v1"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false, ["encrypt", "decrypt"]
  );
}

async function encryptString(plaintext) {
  try {
    if (!window.crypto?.subtle) return plaintext; // fallback dla niesupported browsers
    const key = await getDeviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(plaintext)
    );
    // Zapisuj jako base64: IV + ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return "enc:v1:" + btoa(String.fromCharCode(...combined));
  } catch (e) {
    console.error("[FT] encrypt failed", e);
    return plaintext;
  }
}

async function decryptString(ciphertext) {
  try {
    if (!ciphertext || typeof ciphertext !== "string") return ciphertext;
    if (!ciphertext.startsWith("enc:v1:")) return ciphertext; // nie zaszyfrowane
    const key = await getDeviceKey();
    const combined = Uint8Array.from(atob(ciphertext.slice(7)), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("[FT] decrypt failed", e);
    return null;
  }
}

// Pure sync fallback check (dla SSR lub starych browserów)
function isSupported() {
  return !!(window.crypto?.subtle);
}

export { encryptString, decryptString, isSupported };
