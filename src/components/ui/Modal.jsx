import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

function getAppRect() {
  const el = document.getElementById("app-root");
  if (!el) return { left: 0, width: Math.min(window.innerWidth, 480) };
  const r = el.getBoundingClientRect();
  return { left: r.left, width: r.width };
}

const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return createPortal((
    <div style={{
      position: "fixed", top: 0, left: getAppRect().left, width: getAppRect().width,
      bottom: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#0d1628",
        border: "1px solid #1a2744",
        borderRadius: "20px 20px 0 0",
        width: "100%",
        padding: "24px 20px 40px",
        paddingBottom: "calc(40px + env(safe-area-inset-bottom, 0px))",
        maxHeight: "90dvh", overflowY: "auto",
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
  ), document.body);
};

export { Modal };
