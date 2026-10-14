import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch, storeSession, type AuthUser } from "../lib/api";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      storeSession(data.token, data.user);
      const state = location.state as { from?: string } | null;
      navigate(state?.from || "/perfil", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar sessão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card premium-card led-border">
        <Link to="/" className="auth-brand"><span className="brand-mark large">N</span><div><strong>App NeuroWin</strong><small>Inteligência Estatística</small></div></Link>
        <div className="auth-heading"><span className="eyebrow">ACESSO SEGURO</span><h1>Bem-vindo de volta.</h1><p>Entra na tua conta App NeuroWin.</p></div>
        <form onSubmit={submit} className="auth-form">
          <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label><span>Palavra-passe</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button" disabled={loading}>{loading ? "A entrar…" : "Entrar"}</button>
        </form>
        <div className="auth-security"><strong>Proteção de conta</strong><p>Passwords guardadas com hash bcrypt; autenticação validada no backend.</p></div>
        <p className="auth-switch">Ainda não tens conta? <Link to="/registar">Criar conta</Link></p>
      </section>
    </main>
  );
}
