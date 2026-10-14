import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "../lib/api";
import {
  BrainIcon,
  ChartIcon,
  ChevronRightIcon,
  DatabaseIcon,
  ShieldIcon,
  SignalIcon,
  TrophyIcon,
  UserIcon,
} from "../components/Icons";

type Health = {
  ok: boolean;
  server: string;
  ai: boolean;
  aiModel?: string;
  sportsdb: boolean;
  timestamp: string;
};

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/api/health`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Backend indisponível.");
        return response.json() as Promise<Health>;
      })
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const systemOnline = health?.server === "online";

  return (
    <main className="page page-home">
      {/* ======================================
          HERO
      ====================================== */}
      <section className="home-hero premium-card led-border hero-stadium">
        <div className="hero-copy">
          <span className="eyebrow">
            <i className={systemOnline ? "status-dot" : "status-dot muted"} />
            APP NEUROWIN ENGINE
          </span>

          <h1>
            Inteligência para decisões
            <span> mais informadas.</span>
          </h1>

          <p>
            Uma combinação de IA, estatística, gestão de risco e dados desportivos
            para uma análise mais profunda e decisões mais consistentes.
          </p>

          <div className="hero-facts" aria-label="Características da plataforma">
            <span><i /> Dados reais</span>
            <span><i /> Análise avançada</span>
            <span><i /> Gestão de risco</span>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="hero-logo-cube">
            <span>N</span>
          </div>
          <div className="hero-rings" />
          <div className="hero-keywords">
            <span>ANÁLISE</span>
            <span>PROBABILIDADE</span>
            <span>VALOR</span>
            <span>RESULTADOS</span>
          </div>
        </div>
      </section>

      {/* ======================================
          ESTADO DO SISTEMA
      ====================================== */}
      <section className="status-strip home-status-strip">
        <article className="premium-card status-card status-card-featured">
          <span className="status-card-icon"><DatabaseIcon /></span>
          <div>
            <small>SISTEMA</small>
            <strong>{systemOnline ? "Online" : error ? "Offline" : "A verificar"}</strong>
            <em className={systemOnline ? "ok" : "muted"}>{systemOnline ? "Todos os serviços operacionais" : error || "A estabelecer ligação"}</em>
          </div>
          <i className={systemOnline ? "status-dot" : "status-dot muted"} />
        </article>

        <article className="premium-card status-card">
          <span className="status-card-icon"><BrainIcon /></span>
          <div>
            <small>NEUROWIN AI</small>
            <strong>{health?.ai ? "Ativa" : "Não configurada"}</strong>
            <em>{health?.aiModel || "Gemini"}</em>
          </div>
          <ChevronRightIcon />
        </article>

        <article className="premium-card status-card">
          <span className="status-card-icon"><TrophyIcon /></span>
          <div>
            <small>DESPORTO</small>
            <strong>{health?.sportsdb ? "TheSportsDB" : "Indisponível"}</strong>
            <em>{health?.sportsdb ? "Dados ligados ao backend" : "Verifica a configuração"}</em>
          </div>
          <ChevronRightIcon />
        </article>

        <article className="premium-card status-card">
          <span className="status-card-icon"><ShieldIcon /></span>
          <div>
            <small>SEGURANÇA</small>
            <strong>Protegida</strong>
            <em>Autenticação no backend</em>
          </div>
          <ChevronRightIcon />
        </article>
      </section>

      {/* ======================================
          MÓDULOS
      ====================================== */}
      <section className="section-heading home-section-heading">
        <div>
          <span className="eyebrow">MÓDULOS</span>
          <h2>Centro App NeuroWin</h2>
        </div>
        <p>Tudo o que precisas, num só lugar.</p>
      </section>

      <section className="module-grid home-module-grid">
        <Link to="/sinais" className="module-card premium-card led-border">
          <span className="module-icon"><SignalIcon /></span>
          <div className="module-copy">
            <small>PROBABILIDADE · VALOR</small>
            <h3>Sinais</h3>
            <p>Leitura estruturada de padrões, frequências e contexto estatístico.</p>
          </div>
          <div className="module-art module-art-chart" aria-hidden="true">
            <ChartIcon />
          </div>
          <span className="module-arrow"><ChevronRightIcon /></span>
        </Link>

        <Link to="/ia" className="module-card premium-card led-border">
          <span className="module-icon"><BrainIcon /></span>
          <div className="module-copy">
            <small>MACHINE LEARNING · ANÁLISE</small>
            <h3>NeuroWin AI</h3>
            <p>Assistente para probabilidade, variância, gestão de banca e interpretação de dados.</p>
          </div>
          <div className="module-art module-art-brain" aria-hidden="true">
            <BrainIcon />
          </div>
          <span className="module-arrow"><ChevronRightIcon /></span>
        </Link>

        <Link to="/desporto" className="module-card premium-card led-border">
          <span className="module-icon"><TrophyIcon /></span>
          <div className="module-copy">
            <small>COMPETIÇÕES · RESULTADOS</small>
            <h3>Desporto</h3>
            <p>Jogos, resultados e estados live apresentados no teu horário local.</p>
          </div>
          <div className="module-art module-art-stadium" aria-hidden="true" />
          <span className="module-arrow"><ChevronRightIcon /></span>
        </Link>

        <Link to="/perfil" className="module-card premium-card led-border">
          <span className="module-icon"><UserIcon /></span>
          <div className="module-copy">
            <small>CONTA · PREFERÊNCIAS</small>
            <h3>Perfil</h3>
            <p>Identidade, preferências, atividade e acesso administrativo quando aplicável.</p>
          </div>
          <div className="module-art module-art-profile" aria-hidden="true">
            <UserIcon />
          </div>
          <span className="module-arrow"><ChevronRightIcon /></span>
        </Link>
      </section>

      {/* ======================================
          JOGO RESPONSÁVEL
      ====================================== */}
      <section className="responsible-banner premium-card">
        <ShieldIcon />
        <div>
          <strong>Jogo Responsável</strong>
          <p>
            Define os teus limites. A análise estatística não elimina o risco nem garante resultados futuros.
          </p>
        </div>
        <Link to="/jogo-responsavel">
          Saber mais <ChevronRightIcon />
        </Link>
      </section>
    </main>
  );
}
