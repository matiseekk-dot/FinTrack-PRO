import { useState } from "react";

function RatingPrompt({ onDismiss }) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);

  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 500,
      background: "#000000aa", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "0 24px", fontFamily: "'Space Grotesk', sans-serif",
    }}>
      <div style={{
        background: "#0d1628", borderRadius: 24, padding: "28px 24px",
        width: "min(100vw, 360px)", border: "1px solid #1e3a5f",
        boxShadow: "0 0 60px #7c3aed22",
      }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>⭐</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#e2e8f0", marginBottom: 8 }}>
            Podoba Ci się FinTrack PRO?
          </div>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
            Twoja ocena pomaga nam dotrzeć do kolejnych użytkowników i rozwijać apkę.
          </div>
        </div>

        {/* Stars */}
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 24 }}>
          {[1,2,3,4,5].map(s => (
            <button
              key={s}
              onClick={() => setStars(s)}
              onMouseEnter={() => setHovered(s)}
              onMouseLeave={() => setHovered(0)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 36, padding: 2,
                filter: s <= (hovered || stars) ? "none" : "grayscale(100%) opacity(0.3)",
                transform: s <= (hovered || stars) ? "scale(1.1)" : "scale(1)",
                transition: "all 0.15s ease",
              }}
            >
              ⭐
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {stars >= 4 && (
            <button
              onClick={() => onDismiss(true)}
              style={{
                width: "100%", background: "linear-gradient(135deg,#1e40af,#7c3aed)",
                border: "none", borderRadius: 12, padding: "13px 0",
                color: "white", fontWeight: 800, fontSize: 15,
                cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
              }}>
              Oceń w sklepie 🚀
            </button>
          )}
          {stars > 0 && stars < 4 && (
            <button
              onClick={() => onDismiss(false)}
              style={{
                width: "100%", background: "#0a1e12", border: "1px solid #16a34a44",
                borderRadius: 12, padding: "13px 0",
                color: "#10b981", fontWeight: 700, fontSize: 14,
                cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
              }}>
              Dzięki za feedback!
            </button>
          )}
          <button
            onClick={() => onDismiss(false)}
            style={{
              background: "none", border: "none", color: "#334155",
              fontSize: 13, cursor: "pointer", padding: "8px 0",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
            Może później
          </button>
        </div>
      </div>
    </div>
  );
};

export { RatingPrompt };
