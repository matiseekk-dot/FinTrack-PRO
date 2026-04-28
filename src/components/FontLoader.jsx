const FontLoader = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Mono:wght@300;400;500&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #060b14;
      -webkit-text-size-adjust: 100%;
      touch-action: manipulation;
    }
    /* Prevent iOS auto-zoom on focus — all inputs must be >= 16px */
    input, select, textarea {
      font-size: 16px !important;
      -webkit-appearance: none;
      border-radius: 0;
      touch-action: manipulation;
    }
    /* But visually keep them looking like 13-14px via transform */
    .input-sm {
      font-size: 16px !important;
      transform: scale(0.875);
      transform-origin: left center;
      width: calc(100% / 0.875) !important;
    }
    button {
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #1e2d45; border-radius: 2px; }
  `}</style>
);

export { FontLoader };
