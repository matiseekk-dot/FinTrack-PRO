import { Component } from "react";
import { reportError } from "../lib/errorTracking.js";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("[FinTrack] ErrorBoundary caught:", error, errorInfo);
    // Log do error tracking
    reportError(error, {
      type: "react_boundary",
      componentStack: errorInfo?.componentStack?.substring(0, 500),
    });
    // Log do analityki jeśli dostępne
    if (window.plausible) {
      window.plausible("error", { props: { message: String(error).substring(0, 100) } });
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "40px 24px", minHeight: "60vh",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          fontFamily: "'Space Grotesk', sans-serif", color: "#e2e8f0", textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Ojej, coś poszło nie tak</h2>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24, maxWidth: 340, lineHeight: 1.5 }}>
            Apka napotkała błąd w tej sekcji. Twoje dane są bezpieczne — nie zostały utracone.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 300 }}>
            <button onClick={this.resetError} style={{
              background: "linear-gradient(135deg,#1e40af,#7c3aed)",
              border: "none", borderRadius: 12, padding: "12px 20px",
              color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              🔄 Spróbuj ponownie
            </button>
            <button onClick={() => window.location.reload()} style={{
              background: "#0d1628", border: "1px solid #1e3a5f66",
              borderRadius: 12, padding: "12px 20px",
              color: "#94a3b8", fontWeight: 600, fontSize: 13, cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              Przeładuj apkę
            </button>
          </div>

          {import.meta.env.DEV && this.state.error && (
            <details style={{ marginTop: 24, fontSize: 11, color: "#475569", maxWidth: 500, textAlign: "left" }}>
              <summary style={{ cursor: "pointer", marginBottom: 8 }}>Szczegóły (dev)</summary>
              <pre style={{
                background: "#060b14", padding: 12, borderRadius: 8,
                overflow: "auto", fontSize: 10, color: "#f87171",
                fontFamily: "'DM Mono', monospace",
              }}>
                {String(this.state.error)}
                {this.state.errorInfo && "\n\n" + this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
