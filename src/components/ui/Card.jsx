const Card = ({ children, className = "", style = {} }) => (
  <div style={{
    background: "linear-gradient(135deg,#0d1628,#111827)",
    border: "1px solid #1e3a5f66",
    borderRadius: 20,
    padding: 18,
    ...style
  }} className={className}>{children}</div>
);

const Badge = ({ children, color = "#3b82f6" }) => (
  <span style={{
    background: color + "22",
    color,
    border: `1px solid ${color}44`,
    borderRadius: 6,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    fontFamily: "'DM Mono', monospace",
  }}>{children}</span>
);

export { Card, Badge };
