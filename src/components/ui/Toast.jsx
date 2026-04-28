function Toast({ message, type = "success", visible }) {
  if (!visible) return null;
  const colors = {
    success: { bg: "#052e16", border: "#16a34a44", color: "#10b981", icon: "✓" },
    error:   { bg: "#1a0808", border: "#7f1d1d44", color: "#ef4444", icon: "✕" },
    info:    { bg: "#0a1e3a", border: "#1e40af44", color: "#60a5fa", icon: "ℹ" },
  };
  const c = colors[type] || colors.success;
  return (
    <div style={{
      position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
      zIndex: 999, background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 12, padding: "11px 18px",
      display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 4px 24px #00000088",
      fontFamily: "'Space Grotesk', sans-serif",
      animation: "fadeSlideUp 0.2s ease",
      maxWidth: 340, width: "calc(100% - 32px)",
    }}>
      <style>{`@keyframes fadeSlideUp { from { opacity:0; transform:translateX(-50%) translateY(12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
      <span style={{ fontSize: 16 }}>{c.icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: c.color }}>{message}</span>
    </div>
  );
};

export { Toast };
