// Wspólne primitives dla TripsView i HobbyView.
//
// Wcześniej (pre-v1.4): te same 4 komponenty/style były skopiowane w obu plikach.
// Teraz jeden moduł — gdy zmieniasz styl, zmienia się w obu miejscach. Żaden
// drift wizualny ("trips wyglądają inaczej niż hobby") niemożliwy.
//
// Funkcjonalność identyczna jak przed refactorem — tylko źródło importu się zmienia.

import { fmtShort } from "../utils.js";

// Statystyka (label + value w boxie). Używana w Trip/Hobby cards i details.
function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#060b14", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600, color, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

// Mniejszy wariant Stat (w HobbyCard, gdzie 4 metryki na jednej linii).
function MiniStat({ label, value, color }) {
  return (
    <div style={{ background: "#060b14", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color, marginTop: 3 }}>
        {value}
      </div>
    </div>
  );
}

// Styl małych przycisków akcji (Edit/Archive/Delete) w detail headerach.
const iconBtn = {
  background: "#0a1120", border: "1px solid #1a2744", borderRadius: 8,
  padding: "6px 8px", cursor: "pointer", color: "#94a3b8",
  display: "flex", alignItems: "center", justifyContent: "center",
};

// Wykres słupkowy rok-do-roku.
//   - showValues: true → label kwoty nad słupkiem (HobbyView style)
//   - showValues: false → tylko słupek + rok pod spodem (TripsView style)
//   - color: jeden kolor (HobbyView) lub gradient (TripsView, gdy nie podany)
function YoYBars({ data, color, showValues = false }) {
  const max = Math.max(...data.map(d => d.total), 1);
  const barFill = color || "linear-gradient(180deg,#3b82f6,#1e40af)";
  const height = showValues ? 60 : 50;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height }}>
      {data.map(d => {
        const h = (d.total / max) * 100;
        return (
          <div key={d.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {showValues && (
              <div style={{ fontSize: 9, color: "#64748b", fontFamily: "'DM Mono', monospace" }}>
                {fmtShort(d.total)}
              </div>
            )}
            <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
              <div style={{
                width: "100%", height: `${h}%`, minHeight: showValues ? 3 : 2,
                background: barFill,
                borderRadius: "4px 4px 0 0",
                opacity: showValues ? 0.85 : 1,
              }}/>
            </div>
            <div style={{ fontSize: 9, color: "#475569", fontFamily: "'DM Mono', monospace" }}>
              {String(d.year).slice(2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Picker koloru z palety. `colors` to lista hex stringów.
function ColorPicker({ colors, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {colors.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Kolor ${c}`}
          style={{
            width: 28, height: 28, borderRadius: 8, cursor: "pointer",
            background: c,
            border: value === c ? "2px solid #e2e8f0" : "2px solid transparent",
          }}
        />
      ))}
    </div>
  );
}

export { Stat, MiniStat, iconBtn, YoYBars, ColorPicker };
