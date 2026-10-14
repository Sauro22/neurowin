import { useEffect, useMemo, useState } from "react";

import "./Sports.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001";

/* =========================================================
   TIPOS
========================================================= */

type Alternative = {
  key: string;
  label: string;
  probability?: number;
  confidence: number;
  selected?: boolean;
  eligible?: boolean;
  disagreement?: number;
  learningAdjustment?: number;
};

type ExpectedGoals = {
  home: number;
  away: number;
  total: number;
};

type Prediction = {
  action: "BET" | "SKIP";
  pick: string | null;
  pickKey?: string | null;
  confidence: number;
  odd?: number | null;
  alternatives?: Alternative[];
  expectedGoals?: ExpectedGoals | null;
  reasons?: string[];
};

type Match = {
  id: string;

  league: string;
  country: string;
  leagueId?: number;

  kickoff: string;
  kickoffLabel: string;

  homeTeam: string;
  awayTeam: string;

  homeTeamId?: number;
  awayTeamId?: number;

  predictionAvailable?: boolean;
  predictionError?: string | null;

  prediction: Prediction;
};

type SportsResponse = {
  ok: boolean;

  source?: string;
  analysisSource?: string;

  totalFixtures?: number;
  analysedFixtures?: number;

  quota?: {
    dailyRemaining?: number | null;
    minuteRemaining?: number | null;
  };

  learning?: {
    pending?: number;
    settled?: number;
  };

  matches?: Match[];

  error?: string;
};

/* =========================================================
   HELPERS
========================================================= */

function countryFlag(country?: string) {
  const map: Record<string, string> = {
    Italy: "🇮🇹",
    England: "🏴",
    Spain: "🇪🇸",
    Portugal: "🇵🇹",
    Germany: "🇩🇪",
    France: "🇫🇷",
    Netherlands: "🇳🇱",
    Belgium: "🇧🇪",
    Scotland: "🏴",
    World: "🌐",
  };

  return map[country || ""] || "⚽";
}

function teamLogo(teamId?: number) {
  if (!teamId) {
    return null;
  }

  return `https://media.api-sports.io/football/teams/${teamId}.png`;
}

function leagueLogo(leagueId?: number) {
  if (!leagueId) {
    return null;
  }

  return `https://media.api-sports.io/football/leagues/${leagueId}.png`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function leagueShortName(name: string) {
  const normalized = name.toLowerCase();

  if (normalized.includes("champions")) {
    return "CHAMPIONS LEAGUE";
  }

  if (
    normalized.includes("primeira") ||
    normalized.includes("liga portugal")
  ) {
    return "LIGA PORTUGAL";
  }

  if (normalized.includes("premier")) {
    return "PREMIER LEAGUE";
  }

  if (normalized.includes("serie a")) {
    return "SERIE A";
  }

  if (normalized.includes("la liga")) {
    return "LA LIGA";
  }

  if (normalized.includes("bundesliga")) {
    return "BUNDESLIGA";
  }

  if (normalized.includes("ligue 1")) {
    return "LIGUE 1";
  }

  if (normalized.includes("europa league")) {
    return "EUROPA LEAGUE";
  }

  if (normalized.includes("conference")) {
    return "CONFERENCE";
  }

  return name;
}

function confidenceText(value: number) {
  if (value >= 90) {
    return "Muito alta";
  }

  if (value >= 80) {
    return "Alta";
  }

  if (value >= 70) {
    return "Boa";
  }

  if (value >= 60) {
    return "Moderada";
  }

  return "Baixa";
}

function marketDisplayName(
  key: string | null | undefined,
  fallback: string | null | undefined,
  homeTeam: string,
  awayTeam: string,
) {
  switch (key) {
    case "HOME_WIN":
      return `${homeTeam} vence`;

    case "AWAY_WIN":
      return `${awayTeam} vence`;

    case "DRAW":
      return "Empate";

    case "HOME_OR_DRAW":
      return `${homeTeam} vence ou empata`;

    case "AWAY_OR_DRAW":
      return `${awayTeam} vence ou empata`;

    case "OVER_1_5":
      return "Mais de 1.5 golos";

    case "OVER_2_5":
      return "Mais de 2.5 golos";

    case "UNDER_2_5":
      return "Menos de 2.5 golos";

    case "BTTS_YES":
      return "Ambas marcam — SIM";

    case "BTTS_NO":
      return "Ambas marcam — NÃO";

    default:
      return fallback || "SEM APOSTA";
  }
}

/* =========================================================
   ÍCONES
========================================================= */

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 11a8 8 0 1 0-2.34 5.66"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <path
        d="M20 4v7h-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GamesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M8 8h8M8 12h8M8 16h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AnalysisIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 19V9M10 19V5M15 19v-7M20 19V3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <circle
        cx="12"
        cy="12"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <circle
        cx="12"
        cy="12"
        r="1.5"
        fill="currentColor"
      />
    </svg>
  );
}

function BetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 19V11M10 19V7M15 19V4M20 19V9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* =========================================================
   LOGO DA EQUIPA
========================================================= */

function TeamLogo({
  teamId,
  teamName,
}: {
  teamId?: number;
  teamName: string;
}) {
  const logo = teamLogo(teamId);

  return (
    <div className="sports-team-logo">
      <span>{initials(teamName)}</span>

      {logo && (
        <img
          src={logo}
          alt={teamName}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
}

/* =========================================================
   LOGO DA COMPETIÇÃO
========================================================= */

function LeagueLogo({
  leagueId,
  leagueName,
}: {
  leagueId?: number;
  leagueName: string;
}) {
  const logo = leagueLogo(leagueId);

  return (
    <div className="sports-league-watermark">
      {logo && (
        <img
          src={logo}
          alt={leagueName}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}

      <span>{leagueShortName(leagueName)}</span>
    </div>
  );
}

/* =========================================================
   CONFIANÇA
========================================================= */

function ConfidenceRing({
  value,
}: {
  value: number;
}) {
  const safeValue = Math.max(
    0,
    Math.min(100, value || 0),
  );

  return (
    <div
      className="sports-confidence-ring"
      style={{
        background: `conic-gradient(
          #08ffd1 0deg,
          #08ffd1 ${safeValue * 3.6}deg,
          rgba(8, 255, 209, 0.14) ${safeValue * 3.6}deg,
          rgba(8, 255, 209, 0.14) 360deg
        )`,
      }}
    >
      <div className="sports-confidence-ring-inner">
        <strong>{safeValue}%</strong>
        <span>Confiança</span>
      </div>
    </div>
  );
}

/* =========================================================
   PÁGINA
========================================================= */

export default function Sports() {
  const [data, setData] =
    useState<SportsResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [expandedId, setExpandedId] =
    useState<string | null>(null);

  async function loadSports(
    refresh = false,
  ) {
    try {
      setError("");

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response =
        await fetch(
          `${API_URL}/api/sports/today${
            refresh
              ? "?refresh=1"
              : ""
          }`,
        );

      const json: SportsResponse =
        await response.json();

      if (
        !response.ok ||
        !json.ok
      ) {
        throw new Error(
          json.error ||
            "Não foi possível carregar os jogos.",
        );
      }

      setData(json);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar os jogos.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadSports();
  }, []);

  const matches =
    useMemo(
      () => data?.matches || [],
      [data],
    );

  const selectedCount =
    useMemo(
      () =>
        matches.filter(
          (match) =>
            match.prediction?.action ===
            "BET",
        ).length,
      [matches],
    );

  const foundCount =
    data?.totalFixtures ??
    matches.length;

  const analysedCount =
    data?.analysedFixtures ??
    matches.length;

  return (
    <main className="sports-page sports-page-premium">
      <div className="sports-background-glow sports-background-glow-one" />
      <div className="sports-background-glow sports-background-glow-two" />

      <div className="sports-layout">
        {/* =================================================
            PAINEL ESQUERDO
        ================================================= */}

        <aside className="sports-overview">
          <div className="sports-overview-top">
            <span className="sports-overview-tag">
              DESPORTO
            </span>

            <h2>Visão geral</h2>

            <p>
              Resumo da sua análise de hoje.
            </p>
          </div>

          <div className="sports-overview-stats">
            <div className="sports-overview-stat">
              <div className="sports-stat-icon">
                <GamesIcon />
              </div>

              <div>
                <span>
                  Jogos encontrados
                </span>

                <strong>
                  {foundCount}
                </strong>
              </div>
            </div>

            <div className="sports-overview-stat">
              <div className="sports-stat-icon">
                <AnalysisIcon />
              </div>

              <div>
                <span>
                  Analisados
                </span>

                <strong>
                  {analysedCount}
                </strong>
              </div>
            </div>

            <div className="sports-overview-stat">
              <div className="sports-stat-icon">
                <TargetIcon />
              </div>

              <div>
                <span>
                  Apostas
                </span>

                <strong>
                  {selectedCount}
                </strong>
              </div>
            </div>
          </div>

          <button
            className="sports-refresh-button"
            onClick={() =>
              loadSports(true)
            }
            disabled={refreshing}
          >
            <span
              className={
                refreshing
                  ? "sports-refresh-icon spinning"
                  : "sports-refresh-icon"
              }
            >
              <RefreshIcon />
            </span>

            {refreshing
              ? "A atualizar..."
              : "Atualizar análise"}
          </button>

          <div className="sports-overview-stadium" />

          <div className="sports-overview-decoration">
            <div className="sports-brand-symbol">
              N
            </div>

            <div>
              <strong>
                NeuroWin
              </strong>

              <span>
                INTELIGÊNCIA A FAVOR
                <br />
                DAS SUAS APOSTAS
              </span>
            </div>
          </div>
        </aside>

        {/* =================================================
            CONTEÚDO
        ================================================= */}

        <section className="sports-content">
          <div className="sports-mobile-hero">
            <span className="sports-mobile-kicker">
              APOSTAS DESPORTIVAS
            </span>

            <h1>
              Jogos recomendados
            </h1>

            <p>
              Previsões baseadas na análise
              inteligente da NeuroWin.
            </p>

            <button
              className="sports-mobile-refresh"
              onClick={() =>
                loadSports(true)
              }
              disabled={refreshing}
            >
              <span
                className={
                  refreshing
                    ? "spinning"
                    : ""
                }
              >
                <RefreshIcon />
              </span>

              {refreshing
                ? "A atualizar..."
                : "Atualizar análise"}
            </button>
          </div>

          <div className="sports-desktop-heading">
            <h1>
              Jogos recomendados
            </h1>

            <p>
              Apostas com maior probabilidade
              de sucesso, baseadas na análise
              da IA.
            </p>
          </div>

          <div className="sports-mobile-stats">
            <div>
              <span className="sports-mobile-stat-icon">
                <GamesIcon />
              </span>

              <small>
                Jogos
                <br />
                encontrados
              </small>

              <strong>
                {foundCount}
              </strong>
            </div>

            <div>
              <span className="sports-mobile-stat-icon">
                <AnalysisIcon />
              </span>

              <small>
                Analisados
              </small>

              <strong>
                {analysedCount}
              </strong>
            </div>

            <div>
              <span className="sports-mobile-stat-icon">
                <TargetIcon />
              </span>

              <small>
                Apostas
              </small>

              <strong>
                {selectedCount}
              </strong>
            </div>
          </div>

          {/* LOADING */}

          {loading && (
            <div className="sports-loading-list">
              {[1, 2, 3].map(
                (item) => (
                  <div
                    key={item}
                    className="sports-skeleton"
                  >
                    <div />
                    <div />
                    <div />
                  </div>
                ),
              )}
            </div>
          )}

          {/* ERRO */}

          {!loading && error && (
            <div className="sports-error">
              <div>!</div>

              <h3>
                Não foi possível carregar
                os jogos
              </h3>

              <p>{error}</p>

              <button
                onClick={() =>
                  loadSports(true)
                }
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* SEM JOGOS */}

          {!loading &&
            !error &&
            matches.length === 0 && (
              <div className="sports-error">
                <div>⚽</div>

                <h3>
                  Sem jogos disponíveis
                </h3>

                <p>
                  Não existem jogos para
                  analisar neste momento.
                </p>
              </div>
            )}

          {/* =================================================
              JOGOS
          ================================================= */}

          {!loading &&
            !error &&
            matches.length > 0 && (
              <div className="sports-matches">
                {matches.map(
                  (match) => {
                    const prediction =
                      match.prediction;

                    const confidence =
                      prediction
                        ?.confidence || 0;

                    const pick =
                      prediction?.action ===
                      "BET"
                        ? marketDisplayName(
                            prediction.pickKey,
                            prediction.pick,
                            match.homeTeam,
                            match.awayTeam,
                          )
                        : "SEM APOSTA";

                    const expanded =
                      expandedId ===
                      match.id;

                    const alternatives =
                      (
                        prediction
                          ?.alternatives ||
                        []
                      )
                        .filter(
                          (
                            alternative,
                          ) =>
                            !alternative.selected,
                        )
                        .sort(
                          (a, b) =>
                            b.confidence -
                            a.confidence,
                        )
                        .slice(0, 3);

                    return (
                      <article
                        className={`sports-match-card ${
                          expanded
                            ? "is-expanded"
                            : ""
                        }`}
                        key={match.id}
                      >
                        <div className="sports-match-stadium" />

                        <div className="sports-match-main">
                          {/* ===========================
                              ZONA ESQUERDA
                          =========================== */}

                          <div className="sports-match-info">
                            <div className="sports-match-meta">
                              <div className="sports-match-meta-left">
                                <span className="sports-country-flag">
                                  {countryFlag(
                                    match.country,
                                  )}
                                </span>

                                <span>
                                  {match.country}
                                </span>

                                <i>•</i>

                                <span>
                                  {match.league}
                                </span>
                              </div>

                              <span className="sports-match-time">
                                Hoje,{" "}
                                {match.kickoffLabel}
                              </span>
                            </div>

                            {/* EQUIPAS */}

                            <div className="sports-teams-row">
                              <div className="sports-team">
                                <TeamLogo
                                  teamId={
                                    match.homeTeamId
                                  }
                                  teamName={
                                    match.homeTeam
                                  }
                                />

                                <strong>
                                  {match.homeTeam}
                                </strong>
                              </div>

                              <div className="sports-vs">
                                VS
                              </div>

                              <div className="sports-team">
                                <TeamLogo
                                  teamId={
                                    match.awayTeamId
                                  }
                                  teamName={
                                    match.awayTeam
                                  }
                                />

                                <strong>
                                  {match.awayTeam}
                                </strong>
                              </div>
                            </div>

                            {/* RECOMENDAÇÃO PREMIUM */}

                            <div className="sports-bet-card">

                              <div className="sports-bet-card-top">
                                <div className="sports-bet-market">
                                  ◎{" "}
                                  {prediction?.pickKey === "OVER_1_5" ||
                                  prediction?.pickKey === "OVER_2_5" ||
                                  prediction?.pickKey === "UNDER_2_5"
                                    ? "TOTAL GOLOS"
                                    : prediction?.pickKey === "BTTS_YES" ||
                                        prediction?.pickKey === "BTTS_NO"
                                      ? "AMBAS MARCAM"
                                      : "RESULTADO"}
                                </div>

                                <div className="sports-bet-fire">
                                  🔥 🔥 🔥 🔥
                                  <span>🔥</span>
                                </div>
                              </div>

                              <div className="sports-bet-card-main">

                                <div className="sports-bet-pick">
                                  {pick}
                                </div>

                                <div className="sports-bet-numbers">
                                  <div>
                                    <small>Odd</small>

                                    <strong>
                                      {prediction?.odd
                                        ? Number(prediction.odd).toFixed(2)
                                        : "—"}
                                    </strong>
                                  </div>

                                  <span>
                                    STAKE{" "}
                                    {confidence >= 85
                                      ? "3.0u"
                                      : confidence >= 75
                                        ? "2.5u"
                                        : confidence >= 65
                                          ? "2.0u"
                                          : "1.5u"}
                                  </span>
                                </div>

                              </div>

                              <div className="sports-bet-history">
                                {match.homeTeam} vs {match.awayTeam}
                                {" • "}
                                confiança do modelo {confidence}%
                                {" • "}
                                análise NeuroWin
                              </div>

                            </div>
                          </div>

                          {/* ===========================
                              DIREITA
                              confiança -> botão -> liga
                          =========================== */}

                          <div className="sports-match-actions">
                            <ConfidenceRing
                              value={confidence}
                            />

                            <button
                              className="sports-details-button"
                              onClick={() =>
                                setExpandedId(
                                  expanded
                                    ? null
                                    : match.id,
                                )
                              }
                            >
                              {expanded
                                ? "Fechar detalhes"
                                : "Ver detalhes"}

                              <span>
                                {expanded
                                  ? "↑"
                                  : "→"}
                              </span>
                            </button>

                            <LeagueLogo
                              leagueId={
                                match.leagueId
                              }
                              leagueName={
                                match.league
                              }
                            />
                          </div>
                        </div>

                        {/* DETALHES */}

                        {expanded && (
                          <div className="sports-details-panel">
                            {(() => {
                              const homeWin =
                                prediction?.alternatives?.find(
                                  (item) =>
                                    item.key === "HOME_WIN",
                                );

                              const awayWin =
                                prediction?.alternatives?.find(
                                  (item) =>
                                    item.key === "AWAY_WIN",
                                );

                              const homeChance =
                                homeWin?.probability ??
                                homeWin?.confidence ??
                                0;

                              const awayChance =
                                awayWin?.probability ??
                                awayWin?.confidence ??
                                0;

                              const likelyWinner =
                                homeChance >= awayChance
                                  ? {
                                      team: match.homeTeam,
                                      chance: homeChance,
                                    }
                                  : {
                                      team: match.awayTeam,
                                      chance: awayChance,
                                    };

                              return (
                                <div className="sports-detail-box">
                                  <span>
                                    Maior chance de vencer
                                  </span>

                                  <strong>
                                    {likelyWinner.team}
                                  </strong>

                                  <small>
                                    {Math.round(
                                      likelyWinner.chance,
                                    )}
                                    % de probabilidade
                                  </small>
                                </div>
                              );
                            })()}
                            <div className="sports-detail-box">
                              <span>
                                Confiança
                              </span>

                              <strong>
                                {confidence}%
                              </strong>

                              <small>
                                {confidenceText(
                                  confidence,
                                )}
                              </small>
                            </div>

                            {prediction
                              ?.expectedGoals && (
                              <div className="sports-detail-box">
                                <span>
                                  Golos esperados
                                </span>

                                <strong>
                                  {
                                    prediction
                                      .expectedGoals
                                      .home
                                  }{" "}
                                  —{" "}
                                  {
                                    prediction
                                      .expectedGoals
                                      .away
                                  }
                                </strong>

                                <small>
                                  {match.homeTeam} vs{" "}
                                  {match.awayTeam}
                                </small>
                              </div>
                            )}

                            {alternatives.length >
                              0 && (
                              <div className="sports-detail-alternatives">
                                <span>
                                  Outras opções
                                </span>

                                {alternatives.map(
                                  (
                                    alternative,
                                  ) => (
                                    <div
                                      key={
                                        alternative.key
                                      }
                                    >
                                      <span>
                                        {marketDisplayName(
                                          alternative.key,
                                          alternative.label,
                                          match.homeTeam,
                                          match.awayTeam,
                                        )}
                                      </span>

                                      <strong>
                                        {
                                          alternative.confidence
                                        }
                                        %
                                      </strong>
                                    </div>
                                  ),
                                )}
                              </div>
                            )}

                            {prediction
                              ?.reasons &&
                              prediction
                                .reasons
                                .length >
                                0 && (
                                <div className="sports-detail-reason">
                                  {
                                    prediction
                                      .reasons[
                                      prediction
                                        .reasons
                                        .length -
                                        1
                                    ]
                                  }
                                </div>
                              )}
                          </div>
                        )}
                      </article>
                    );
                  },
                )}
              </div>
            )}
        </section>
      </div>
    </main>
  );
}
