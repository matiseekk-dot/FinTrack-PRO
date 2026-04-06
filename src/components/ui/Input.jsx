import { useState, useMemo, useEffect, useCallback, useRef } from "react";

const Input = ({ label, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>}
    <input style={{
      width: "100%",
      background: "#060b14",
      border: "1px solid #1a2744",
      borderRadius: 10,
      padding: "12px 14px",
      color: "#e2e8f0",
      fontSize: 16,
      fontFamily: "'Space Grotesk', sans-serif",
      outline: "none",
      WebkitAppearance: "none",
    }} {...props} />
  </div>
);

const Select = ({ label, children, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>}
    <select style={{
      width: "100%",
      background: "#060b14",
      border: "1px solid #1a2744",
      borderRadius: 10,
      padding: "12px 14px",
      color: "#e2e8f0",
      fontSize: 16,
      fontFamily: "'Space Grotesk', sans-serif",
      outline: "none",
      WebkitAppearance: "none",
      appearance: "none",
    }} {...props}>{children}</select>
  </div>
);




export { Input, Select };
