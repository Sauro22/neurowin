import { Component, type ErrorInfo, type ReactNode } from "react";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("NeuroWin UI error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="center-screen">
          <section className="error-panel premium-card">
            <span className="eyebrow">NEUROWIN</span>
            <h1>Ocorreu um erro na interface.</h1>
            <p>Recarrega a página. Se continuar, verifica o terminal do frontend.</p>
            <button className="primary-button" onClick={() => window.location.reload()}>Recarregar</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
