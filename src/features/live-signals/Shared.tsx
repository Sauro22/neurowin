import type { ReactNode } from "react";

type Metric = {
  label: string;
  value: string;
};

export function ModuleHeader({
  title,
  subtitle,
  image,
  decision,
  score,
  sampleSize,
  elapsedMs,
  onBack,
}: {
  title: string;
  subtitle: string;
  image: string;
  decision: string;
  score: number;
  sampleSize: number;
  elapsedMs: number;
  onBack: () => void;
}) {
  const waiting = decision === "WAIT" || decision === "AGUARDAR";

  return (
    <>
      <button type="button" className="live-back" onClick={onBack}>
        ← Voltar aos sinais
      </button>

      <section className="live-module-hero premium-card led-border">
        <div className="live-module-image">
          <img src={image} alt={title} />
        </div>

        <div className="live-module-copy">
          <span className="eyebrow">MOTOR AO VIVO</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>

          <div className="live-module-meta">
            <span>{sampleSize} resultados</span>
            <span>{elapsedMs.toFixed(1)} ms</span>
            <span>meta ≤ 3 s</span>
          </div>
        </div>

        <div className={waiting ? "live-decision wait" : "live-decision active"}>
          <span>DECISÃO DO MODELO</span>
          <strong>{waiting ? "AGUARDAR" : decision}</strong>
          <small>score {score}/100</small>
        </div>
      </section>
    </>
  );
}

export function Metrics({ items }: { items: Metric[] }) {
  return (
    <section className="live-metrics">
      {items.map((item) => (
        <article key={item.label} className="premium-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </section>
  );
}

export function AnalysisReasons({
  reasons,
  caution,
}: {
  reasons: string[];
  caution: string;
}) {
  return (
    <section className="live-analysis-card premium-card">
      <div>
        <span className="eyebrow">BASE DA ANÁLISE</span>
        <h2>Leitura do motor</h2>
      </div>

      <div className="live-reason-list">
        {reasons.map((reason, index) => (
          <p key={`${index}-${reason}`}>• {reason}</p>
        ))}
      </div>

      <p className="live-caution">{caution}</p>
    </section>
  );
}

export function DataPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="live-data-card premium-card">
      <header>
        <div>
          <span className="eyebrow">DADOS REAIS</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>

      {children}
      {footer}
    </section>
  );
}

export function HistoryChips({
  values,
}: {
  values: Array<{ id: string; label: string; className?: string; title?: string }>;
}) {
  if (!values.length) {
    return <p className="live-empty">Ainda não existem resultados registados.</p>;
  }

  return (
    <div className="live-history-chips">
      {values.map((value) => (
        <span
          key={value.id}
          className={value.className || ""}
          title={value.title}
        >
          {value.label}
        </span>
      ))}
    </div>
  );
}

export function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="live-ghost-button" onClick={onClick}>
      Limpar histórico
    </button>
  );
}
