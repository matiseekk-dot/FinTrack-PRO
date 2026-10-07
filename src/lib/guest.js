// Tryb bez konta (2.13.0): dane tylko na urządzeniu, logowanie później łączy je z kontem.

/**
 * Dane z trybu bez konta + dane konta, przy pierwszym logowaniu. Wpisy i dane modułów — suma
 * obu (po id); przy tym samym id, ustawieniach i kontach wygrywa konto (ono już działa na innych
 * urządzeniach). Moduły — wszystkie włączone po obu stronach.
 * mergeSnapshots(a, b): suma tablic po id z pierwszeństwem `a` — dlatego konto idzie pierwsze.
 */
export function mergeGuestIntoAccount(guest, account, mergeSnapshots) {
  const m = mergeSnapshots(account, guest);
  if (Array.isArray(account.modules) && Array.isArray(guest.modules)) m.modules = [...new Set([...account.modules, ...guest.modules])];
  if (account.prefs) m.prefs = account.prefs;
  return m;
}
