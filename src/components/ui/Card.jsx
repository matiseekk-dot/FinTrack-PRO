import { useState, useMemo, useEffect, useCallback, useRef } from "react";

const Card = ({ children, className = "", style = {} }) => (
  <div style={{
    background: "linear-gradient(145deg, #0f1825 0%, #0a1120 100%)",
    border: "1px solid #1a2744",
    borderRadius: 16,
    padding: 20,
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
