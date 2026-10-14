import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AdminIcon,
  BellIcon,
  BrainIcon,
  ChevronRightIcon,
  ClockIcon,
  DatabaseIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
  SignalIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
} from "../components/Icons";
import { apiFetch, clearSession, getStoredUser, type AuthUser } from "../lib/api";

type ProfilePrefs = {
  avatar: string;
  notifications: boolean;
  responsibleReminder: boolean;
  sessionLimit: number;
  favoriteModule: string;
  joinedAt: string;
};

type AdminOverview = {
  totalUsers: number;
  activeUsers: number;
  activeSessions: number;
  securityEvents: number;
};

const PREFS_KEY = "neurowin-profile-prefs-v3";
const AI_HISTORY_KEY = "neurowin-ai-history-v3";

function defaultPrefs(): ProfilePrefs {
  return {
    avatar: "",
    notifications: true,
    responsibleReminder: true,
    sessionLimit: 60,
    favoriteModule: "NeuroWin AI",
    joinedAt: new Date().toISOString(),
  };
}

function readPrefs(): ProfilePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...defaultPrefs(), ...JSON.parse(raw) } : defaultPrefs();
  } catch {
    return defaultPrefs();
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function Profile() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [prefs, setPrefs] = useState<ProfilePrefs>(readPrefs);
  const [saved, setSaved] = useState(false);
  const [sessionStarted] = useState(() => Date.now());
  const [minutes, setMinutes] = useState(0);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);

  useEffect(() => {
    apiFetch<{ user: AuthUser }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMinutes(Math.floor((Date.now() - sessionStarted) / 60000));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [sessionStarted]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    apiFetch<{ overview: AdminOverview }>("/api/admin/overview")
      .then((data) => setAdminOverview(data.overview))
      .catch(() => setAdminOverview(null));
  }, [user?.role]);

  const aiMessages = useMemo(() => {
    try {
      const history = JSON.parse(localStorage.getItem(AI_HISTORY_KEY) || "[]");
      return Array.isArray(history) ? history.length : 0;
    } catch {
      return 0;
    }
  }, [saved]);

  const initials = (user?.name || "NW")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  function save(event: FormEvent) {
    event.preventDefault();
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPrefs((current) => ({ ...current, avatar: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  }

  async function logout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // A sessão local é limpa mesmo que o backend esteja indisponível.
    }
    clearSession();
    navigate("/login", { replace: true });
  }

  function exportData() {
    const data = {
      application: "App NeuroWin",
      exportedAt: new Date().toISOString(),
      user: user
        ? {
            name: user.name,
            email: user.email,
            neurowinId: user.neurowinId,
            role: user.role,
          }
        : null,
      preferences: prefs,
      activity: {
        aiMessages,
        currentSessionMinutes: minutes,
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "neurowin-profile-data.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function clearAiHistory() {
    localStorage.removeItem(AI_HISTORY_KEY);
    setSaved((value) => !value);
  }

  if (user?.role === "admin") {
    return (
      <main className="page profile-page admin-profile-page">
        {/* ======================================
            ADMIN HERO
        ====================================== */}
        <section className="profile-hero profile-hero-admin premium-card led-border hero-stadium">
          <div className="profile-avatar-wrap">
            <button
              className="profile-avatar profile-avatar-admin"
              onClick={() => fileRef.current?.click()}
              type="button"
              title="Alterar fotografia"
            >
              {prefs.avatar ? <img src={prefs.avatar} alt="Foto de perfil" /> : initials}
              <i className="profile-online-dot" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={choosePhoto} />
          </div>

          <div className="profile-identity">
            <span className="eyebrow">NEUROWIN ID</span>
            <h1>{user.name || "Administrador NeuroWin"}</h1>
            <p>Gestão avançada da plataforma, utilizadores e segurança.</p>
            <div className="profile-id-row">
              <span>{user.neurowinId}</span>
              <button type="button" onClick={() => navigator.clipboard?.writeText(user.neurowinId)}>
                Copiar ID
              </button>
            </div>
          </div>

          <div className="profile-state admin-state">
            <i className="status-dot" /> ADMIN ATIVO
          </div>
        </section>

        {/* ======================================
            ADMIN MÉTRICAS
        ====================================== */}
        <section className="profile-metrics admin-profile-metrics">
          <article className="premium-card led-border">
            <span className="metric-icon"><AdminIcon /></span>
            <div><small>FUNÇÃO</small><strong>Administrador</strong><em>Acesso administrativo</em></div>
            <ChevronRightIcon />
          </article>

          <article className="premium-card led-border">
            <span className="metric-icon"><ShieldIcon /></span>
            <div><small>SEGURANÇA</small><strong>Sessão protegida</strong><em>JWT + bcrypt</em></div>
            <ChevronRightIcon />
          </article>

          <article className="premium-card led-border">
            <span className="metric-icon"><UsersIcon /></span>
            <div><small>UTILIZADORES</small><strong>{adminOverview?.totalUsers ?? "—"}</strong><em>Contas registadas</em></div>
            <ChevronRightIcon />
          </article>

          <article className="premium-card led-border">
            <span className="metric-icon"><ClockIcon /></span>
            <div><small>SESSÕES</small><strong>{adminOverview?.activeSessions ?? "—"}</strong><em>Sessões ativas</em></div>
            <ChevronRightIcon />
          </article>
        </section>

        {/* ======================================
            ADMIN CONTEÚDO
        ====================================== */}
        <form className="profile-grid admin-profile-grid" onSubmit={save}>
          <section className="profile-card premium-card led-border">
            <div className="card-head">
              <div><span className="eyebrow">PERFIL</span><h2>Perfil do administrador</h2></div>
              <UserIcon />
            </div>

            <div className="admin-profile-field-row"><span>Nome apresentado</span><strong>{user.name}</strong></div>
            <div className="admin-profile-field-row"><span>Email</span><strong>{user.email}</strong></div>
            <div className="admin-profile-field-row"><span>Função</span><strong>Administrador</strong></div>
            <div className="admin-profile-field-row"><span>Membro desde</span><strong>{formatDate(user.createdAt)}</strong></div>
            <div className="admin-profile-field-row"><span>Último login</span><strong>{formatDate(user.lastLoginAt)}</strong></div>
          </section>

          <section className="profile-card premium-card led-border">
            <div className="card-head">
              <div><span className="eyebrow">PERMISSÕES</span><h2>Permissões de administrador</h2></div>
              <ShieldIcon />
            </div>

            <div className="permission-grid">
              <div><UsersIcon /><span><strong>Gestão de utilizadores</strong><small>Criar, consultar, bloquear e ativar contas.</small></span><b>ATIVO</b></div>
              <div><SettingsIcon /><span><strong>Controlo da plataforma</strong><small>Acesso ao centro administrativo.</small></span><b>ATIVO</b></div>
              <div><DatabaseIcon /><span><strong>Auditoria</strong><small>Consultar sessões e eventos de segurança.</small></span><b>ATIVO</b></div>
              <div><ShieldIcon /><span><strong>Revogar sessões</strong><small>Terminar sessões ativas de utilizadores.</small></span><b>ATIVO</b></div>
            </div>
          </section>

          <section className="profile-card premium-card led-border">
            <div className="card-head">
              <div><span className="eyebrow">SEGURANÇA</span><h2>Segurança da conta</h2></div>
              <ShieldIcon />
            </div>

            <div className="tool-grid">
              <div><ShieldIcon /><span><strong>Autenticação backend</strong><small>Token JWT validado em cada pedido protegido.</small></span></div>
              <div><ClockIcon /><span><strong>Sessão atual</strong><small>{minutes} minutos nesta sessão local.</small></span></div>
              <div><DatabaseIcon /><span><strong>Eventos registados</strong><small>{adminOverview?.securityEvents ?? "—"} eventos no painel.</small></span></div>
              <div><UsersIcon /><span><strong>Contas ativas</strong><small>{adminOverview?.activeUsers ?? "—"} utilizadores ativos.</small></span></div>
            </div>
          </section>

          <section className="profile-card premium-card led-border">
            <div className="card-head">
              <div><span className="eyebrow">PREFERÊNCIAS</span><h2>Preferências do administrador</h2></div>
              <SettingsIcon />
            </div>

            <label className="setting-row">
              <div><strong>Notificações</strong><small>Alertas e atualizações da plataforma.</small></div>
              <input
                type="checkbox"
                checked={prefs.notifications}
                onChange={(event) => setPrefs((current) => ({ ...current, notifications: event.target.checked }))}
              />
            </label>

            <label className="setting-row">
              <div><strong>Lembretes responsáveis</strong><small>Avisos de utilização e gestão de tempo.</small></div>
              <input
                type="checkbox"
                checked={prefs.responsibleReminder}
                onChange={(event) => setPrefs((current) => ({ ...current, responsibleReminder: event.target.checked }))}
              />
            </label>

            <label className="profile-field">
              <span>Módulo favorito</span>
              <select
                value={prefs.favoriteModule}
                onChange={(event) => setPrefs((current) => ({ ...current, favoriteModule: event.target.value }))}
              >
                <option>NeuroWin AI</option>
                <option>Desporto</option>
                <option>Sinais</option>
                <option>Administração</option>
              </select>
            </label>
          </section>

          <section className="profile-card premium-card led-border profile-admin-tools">
            <div className="card-head">
              <div><span className="eyebrow">GESTÃO</span><h2>Ferramentas de gestão</h2></div>
              <SettingsIcon />
            </div>

            <div className="admin-tool-links">
              <Link to="/admin"><UsersIcon /><span><strong>Gerir utilizadores</strong><small>Abrir o centro administrativo.</small></span><ChevronRightIcon /></Link>
              <Link to="/admin"><DatabaseIcon /><span><strong>Ver logs do sistema</strong><small>Consultar eventos e sessões.</small></span><ChevronRightIcon /></Link>
              <Link to="/ia"><BrainIcon /><span><strong>Estado da IA</strong><small>Abrir a NeuroWin AI.</small></span><ChevronRightIcon /></Link>
              <Link to="/desporto"><TrophyIcon /><span><strong>Estado do desporto</strong><small>Ver feeds e eventos desportivos.</small></span><ChevronRightIcon /></Link>
            </div>
          </section>

          <section className="profile-card premium-card led-border">
            <div className="card-head">
              <div><span className="eyebrow">DADOS</span><h2>Dados locais</h2></div>
              <DatabaseIcon />
            </div>

            <div className="data-row"><div><strong>Histórico AI</strong><small>{aiMessages} mensagens guardadas neste navegador.</small></div><button type="button" onClick={clearAiHistory}>Limpar</button></div>
            <div className="data-row"><div><strong>Exportar preferências</strong><small>Cria um ficheiro JSON com os dados locais.</small></div><button type="button" onClick={exportData}>Exportar</button></div>
          </section>

          <section className="profile-savebar premium-card led-border">
            <div><i className="status-dot" /><div><strong>Configuração do administrador</strong><small>As preferências são guardadas neste dispositivo.</small></div></div>
            <button className="primary-button">{saved ? "Guardado ✓" : "Guardar alterações"}</button>
          </section>
        </form>

        <button className="logout-button" onClick={logout}>
          <LogOutIcon />
          <span><strong>Terminar sessão</strong><small>Sair da conta de administrador neste dispositivo.</small></span>
        </button>
      </main>
    );
  }

  return (
    <main className="page profile-page">
      {/* ======================================
          USER HERO
      ====================================== */}
      <section className="profile-hero premium-card led-border hero-stadium">
        <div className="profile-avatar-wrap">
          <button
            className="profile-avatar"
            onClick={() => fileRef.current?.click()}
            type="button"
            title="Alterar fotografia"
          >
            {prefs.avatar ? <img src={prefs.avatar} alt="Foto de perfil" /> : initials}
            <i className="profile-online-dot" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={choosePhoto} />
          {prefs.avatar && (
            <button
              type="button"
              className="text-button"
              onClick={() => setPrefs((current) => ({ ...current, avatar: "" }))}
            >
              Remover foto
            </button>
          )}
        </div>

        <div className="profile-identity">
          <span className="eyebrow">NEUROWIN ID</span>
          <h1>{user?.name || "Utilizador NeuroWin"}</h1>
          <p>Gere as tuas preferências e controla a experiência App NeuroWin.</p>
          <div className="profile-id-row">
            <span>{user?.neurowinId || "NW-LOCAL"}</span>
            <button type="button" onClick={() => navigator.clipboard?.writeText(user?.neurowinId || "NW-LOCAL")}>Copiar ID</button>
          </div>
        </div>

        <div className="profile-state"><i className="status-dot" /> PERFIL ATIVO</div>
      </section>

      {/* ======================================
          USER MÉTRICAS
      ====================================== */}
      <section className="profile-metrics user-profile-metrics">
        <article className="premium-card led-border"><span className="metric-icon"><BrainIcon /></span><div><small>MÓDULO FAVORITO</small><strong>{prefs.favoriteModule}</strong><em>O teu módulo principal</em></div><ChevronRightIcon /></article>
        <article className="premium-card led-border"><span className="metric-icon"><BellIcon /></span><div><small>LEMBRETES</small><strong>{prefs.responsibleReminder ? "Ativos" : "Desativados"}</strong><em>Gestão responsável</em></div><ChevronRightIcon /></article>
        <article className="premium-card led-border"><span className="metric-icon"><ClockIcon /></span><div><small>LIMITE DE SESSÃO</small><strong>{prefs.sessionLimit} min</strong><em>Gestão de tempo</em></div><ChevronRightIcon /></article>
      </section>

      {/* ======================================
          USER CONTEÚDO
      ====================================== */}
      <form className="profile-grid" onSubmit={save}>
        <section className="profile-card premium-card led-border">
          <div className="card-head"><div><span className="eyebrow">PERFIL</span><h2>Perfil</h2></div><UserIcon /></div>

          <div className="admin-profile-field-row"><span>Nome apresentado</span><strong>{user?.name || "Utilizador NeuroWin"}</strong></div>
          <div className="admin-profile-field-row"><span>Email</span><strong>{user?.email || "Sessão local"}</strong></div>
          <div className="admin-profile-field-row"><span>Membro desde</span><strong>{formatDate(user?.createdAt || prefs.joinedAt)}</strong></div>

          <label className="profile-field">
            <span>Módulo favorito</span>
            <select value={prefs.favoriteModule} onChange={(event) => setPrefs((current) => ({ ...current, favoriteModule: event.target.value }))}>
              <option>NeuroWin AI</option>
              <option>Desporto</option>
              <option>Sinais</option>
            </select>
          </label>
        </section>

        <section className="profile-card premium-card led-border">
          <div className="card-head"><div><span className="eyebrow">PREFERÊNCIAS</span><h2>Preferências</h2></div><SettingsIcon /></div>

          <label className="setting-row"><div><strong>Notificações</strong><small>Alertas e atualizações da plataforma.</small></div><input type="checkbox" checked={prefs.notifications} onChange={(event) => setPrefs((current) => ({ ...current, notifications: event.target.checked }))} /></label>
          <label className="setting-row"><div><strong>Lembretes responsáveis</strong><small>Avisos sobre tempo de utilização e jogo responsável.</small></div><input type="checkbox" checked={prefs.responsibleReminder} onChange={(event) => setPrefs((current) => ({ ...current, responsibleReminder: event.target.checked }))} /></label>
        </section>

        <section className="profile-card premium-card led-border">
          <div className="card-head"><div><span className="eyebrow">SESSÃO</span><h2>Sessão responsável</h2></div><ClockIcon /></div>
          <div className="session-options">
            {[30, 60, 90, 120].map((value) => (
              <button
                type="button"
                key={value}
                className={prefs.sessionLimit === value ? "active" : ""}
                onClick={() => setPrefs((current) => ({ ...current, sessionLimit: value }))}
              >
                <ClockIcon />
                <strong>{value} min</strong>
                <small>{value === 60 ? "RECOMENDADO" : "LIMITE"}</small>
              </button>
            ))}
          </div>
          <div className="responsible-inline"><ShieldIcon /><span><strong>O jogo deve ser uma forma de entretenimento, nunca uma fonte de pressão financeira.</strong><small>Define limites e faz pausas regulares.</small></span></div>
        </section>

        <section className="profile-card premium-card led-border">
          <div className="card-head"><div><span className="eyebrow">DADOS</span><h2>Dados locais</h2></div><DatabaseIcon /></div>
          <div className="data-row"><div><strong>Perfil NeuroWin</strong><small>Preferências e dados de personalização.</small></div><button type="button" onClick={() => setPrefs(defaultPrefs())}>Restaurar</button></div>
          <div className="data-row"><div><strong>Conversas AI</strong><small>{aiMessages} mensagens guardadas neste navegador.</small></div><button type="button" onClick={clearAiHistory}>Limpar</button></div>
          <div className="data-row"><div><strong>Exportar dados</strong><small>Cria um ficheiro JSON local.</small></div><button type="button" onClick={exportData}>Exportar</button></div>
        </section>

        <section className="profile-savebar premium-card led-border">
          <div><i className="status-dot" /><div><strong>Guardar alterações</strong><small>As preferências são guardadas neste dispositivo.</small></div></div>
          <button className="primary-button">{saved ? "Guardado ✓" : "Guardar alterações"}</button>
        </section>
      </form>

      <button className="logout-button" onClick={logout}>
        <LogOutIcon />
        <span><strong>Terminar sessão</strong><small>Sair desta conta neste dispositivo.</small></span>
      </button>
    </main>
  );
}
