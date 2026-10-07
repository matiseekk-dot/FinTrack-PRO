const Card = ({ children, className = "", style = {} }) => (
  <div style={{
    background: "linear-gradient(135deg,#0d1628,#111827)",
    border: "1px solid #1e3a5f66",
    borderRadius: 20,
    padding: 18,
    ...style
  }} className={className}>{children}</div>
);

export { Card };
