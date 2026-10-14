import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminIcon, RefreshIcon } from "../components/Icons";
import { apiFetch, type AuthUser } from "../lib/api";

type Overview = { totalUsers: number; activeUsers: number; activeSessions: number; securityEvents: number };
type AdminUser = AuthUser & { activeSessions: number };
type SecurityEvent = { id: string; event_type: string; ip_address: string | null; created_at: string; user_email: string | null; user_name: string | null; detail: string | null };

export default function Admin() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewData, usersData, eventData] = await Promise.all([
        apiFetch<{ overview: Overview }>("/api/admin/overview"),
        apiFetch<{ users: AdminUser[] }>("/api/admin/users"),
        apiFetch<{ events: SecurityEvent[] }>("/api/admin/security-events"),
      ]);
      setOverview(overviewData.overview);
      setUsers(usersData.users);
      setEvents(eventData.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o painel Admin.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(user: AdminUser) {
    const status = user.status === "active" ? "blocked" : "active";
    await apiFetch(`/api/admin/users/${encodeURIComponent(user.id)}/status`, { method: "POST", body: JSON.stringify({ status }) });
    await load();
  }

  async function revoke(user: AdminUser) {
    await apiFetch(`/api/admin/users/${encodeURIComponent(user.id)}/revoke-sessions`, { method: "POST" });
    await load();
  }

  return (
    <main className="admin-page page">
      <header className="admin-header">
        <div><span className="eyebrow"><AdminIcon /> ADMINISTRAÇÃO</span><h1>Centro de controlo</h1><p>Utilizadores, sessões e eventos de segurança.</p></div>
        <div className="admin-actions"><Link to="/perfil" className="secondary-button inline-button">Voltar ao perfil</Link><button className="secondary-button" onClick={load}><RefreshIcon /> Atualizar</button></div>
      </header>

      {error && <div className="form-error">{error}</div>}

      <section className="admin-stats">
        <article className="premium-card"><span>UTILIZADORES</span><strong>{overview?.totalUsers ?? "—"}</strong></article>
        <article className="premium-card"><span>ATIVOS</span><strong>{overview?.activeUsers ?? "—"}</strong></article>
        <article className="premium-card"><span>SESSÕES ATIVAS</span><strong>{overview?.activeSessions ?? "—"}</strong></article>
        <article className="premium-card"><span>EVENTOS SEGURANÇA</span><strong>{overview?.securityEvents ?? "—"}</strong></article>
      </section>

      <section className="admin-grid">
        <div className="admin-panel premium-card led-border">
          <div className="card-head"><div><span className="eyebrow">CONTAS</span><h2>Utilizadores</h2></div><span>{users.length}</span></div>
          <div className="admin-user-list">
            {loading && <div className="empty-state">A carregar utilizadores…</div>}
            {!loading && users.map((user) => (
              <article className="admin-user" key={user.id}>
                <div className="admin-user-avatar">{user.name.slice(0, 2).toUpperCase()}</div>
                <div className="admin-user-copy"><strong>{user.name}</strong><small>{user.email}</small><span>{user.neurowinId} · {user.role} · {user.activeSessions} sessões</span></div>
                <span className={`status-badge ${user.status}`}>{user.status === "active" ? "Ativo" : "Bloqueado"}</span>
                <div className="admin-user-actions">
                  <button onClick={() => revoke(user)}>Revogar sessões</button>
                  {user.role !== "admin" && <button className={user.status === "active" ? "danger" : "success"} onClick={() => changeStatus(user)}>{user.status === "active" ? "Bloquear" : "Ativar"}</button>}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="admin-panel premium-card led-border">
          <div className="card-head"><div><span className="eyebrow">AUDITORIA</span><h2>Eventos recentes</h2></div><span>{events.length}</span></div>
          <div className="security-list">
            {events.length === 0 && !loading && <div className="empty-state">Sem eventos registados.</div>}
            {events.slice(0, 40).map((event) => (
              <article key={event.id} className="security-event"><i className="status-dot muted" /><div><strong>{event.event_type}</strong><small>{event.user_email || "Sistema"} · {event.ip_address || "IP indisponível"}</small></div><time>{new Date(event.created_at).toLocaleString("pt-PT")}</time></article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
