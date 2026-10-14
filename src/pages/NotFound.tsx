import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="center-screen">
      <section className="error-panel premium-card led-border">
        <span className="eyebrow">404</span>
        <h1>Página não encontrada</h1>
        <p>O endereço que procuraste não existe nesta versão da App NeuroWin.</p>
        <Link to="/" className="primary-button inline-button">Voltar ao início</Link>
      </section>
    </main>
  );
}
