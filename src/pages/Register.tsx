import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("As palavras-passe não coincidem.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card premium-card led-border">
        <Link to="/" className="auth-brand"><span className="brand-mark large">N</span><div><strong>App NeuroWin</strong><small>Criar identidade</small></div></Link>
        <div className="auth-heading"><span className="eyebrow">NOVO PERFIL</span><h1>Criar conta.</h1><p>Configura a tua identidade App NeuroWin.</p></div>
        <form onSubmit={submit} className="auth-form">
          <label><span>Nome</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} /></label>
          <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label><span>Palavra-passe</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} /></label>
          <label><span>Confirmar palavra-passe</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={8} /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button" disabled={loading}>{loading ? "A criar…" : "Criar conta"}</button>
        </form>
        <p className="auth-switch">Já tens conta? <Link to="/login">Entrar</Link></p>
      </section>
    </main>
  );
}
