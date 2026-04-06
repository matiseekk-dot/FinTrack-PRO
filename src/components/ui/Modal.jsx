import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";

const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#0d1628",
        border: "1px solid #1a2744",
        borderRadius: "20px 20px 0 0",
        width: "100%", maxWidth: 480,
        padding: "24px 20px 40px",
        maxHeight: "90vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontWeight: 700, fontSize: 18 }}>{title}</span>
          <button onClick={onClose} style={{ background: "#1a2744", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "#94a3b8" }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export { Modal };
