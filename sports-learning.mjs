import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const DATA_DIR =
  path.join(
    __dirname,
    "data",
  );

const DATA_FILE =
  path.join(
    DATA_DIR,
    "sports-learning.json",
  );

const MARKET_KEYS = [
  "HOME_WIN",
  "DRAW",
  "AWAY_WIN",
  "HOME_OR_DRAW",
  "AWAY_OR_DRAW",
  "OVER_1_5",
  "OVER_2_5",
  "UNDER_2_5",
  "BTTS_YES",
  "BTTS_NO",
];

function clamp(
  value,
  min,
  max,
) {
  return Math.min(
    max,
    Math.max(
      min,
      value,
    ),
  );
}

function emptyMarketStats() {
  return {
    samples: 0,
    hits: 0,
    sumResidual: 0,
    sumSquaredError: 0,
  };
}

function createInitialState() {
  return {
    version: 1,

    updatedAt: null,

    markets:
      Object.fromEntries(
        MARKET_KEYS.map(
          (key) => [
            key,
            emptyMarketStats(),
          ],
        ),
      ),

    pending: {},

    history: [],
  };
}

let state = null;

function ensureShape(input) {
  const safe =
    input &&
    typeof input === "object"
      ? input
      : {};

  const next =
    createInitialState();

  next.updatedAt =
    safe.updatedAt ||
    null;

  next.pending =
    safe.pending &&
    typeof safe.pending ===
      "object"
      ? safe.pending
      : {};

  next.history =
    Array.isArray(
      safe.history,
    )
      ? safe.history
      : [];

  for (
    const key
    of MARKET_KEYS
  ) {
    const current =
      safe.markets?.[key] ||
      {};

    next.markets[key] = {
      samples:
        Number(
          current.samples,
        ) || 0,

      hits:
        Number(
          current.hits,
        ) || 0,

      sumResidual:
        Number(
          current.sumResidual,
        ) || 0,

      sumSquaredError:
        Number(
          current.sumSquaredError,
        ) || 0,
    };
  }

  return next;
}

function loadState() {
  if (state) {
    return state;
  }

  try {
    if (
      !fs.existsSync(
        DATA_FILE,
      )
    ) {
      state =
        createInitialState();

      return state;
    }

    const raw =
      fs.readFileSync(
        DATA_FILE,
        "utf8",
      );

    state =
      ensureShape(
        JSON.parse(raw),
      );

    return state;
  } catch (error) {
    console.error(
      "Sports learning: erro ao ler estado:",
      error?.message ||
        error,
    );

    state =
      createInitialState();

    return state;
  }
}

function saveState() {
  const current =
    loadState();

  current.updatedAt =
    new Date()
      .toISOString();

  try {
    fs.mkdirSync(
      DATA_DIR,
      {
        recursive: true,
      },
    );

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        current,
        null,
        2,
      ),
      "utf8",
    );
  } catch (error) {
    console.error(
      "Sports learning: erro ao guardar estado:",
      error?.message ||
        error,
    );
  }
}

function probability(value) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return null;
  }

  return clamp(
    number,
    0.01,
    0.99,
  );
}

/*
 * Calcula a correção aprendida
 * para cada mercado.
 *
 * Só começa a influenciar
 * depois de 5 exemplos.
 *
 * O efeito é progressivo e
 * limitado a ±8 pontos percentuais.
 */

export function getMarketAdjustment(
  marketKey,
) {
  const current =
    loadState()
      .markets?.[
        marketKey
      ];

  if (
    !current ||
    current.samples < 5
  ) {
    return 0;
  }

  const meanResidual =
    current.sumResidual /
    current.samples;

  /*
   * Evita que poucos jogos
   * alterem demasiado o modelo.
   */

  const shrinkage =
    current.samples /
    (
      current.samples +
      40
    );

  return clamp(
    meanResidual *
      shrinkage,
    -0.08,
    0.08,
  );
}

export function getLearningSummary() {
  const current =
    loadState();

  return {
    updatedAt:
      current.updatedAt,

    pending:
      Object.keys(
        current.pending,
      ).length,

    settled:
      current.history.length,

    markets:
      Object.fromEntries(
        MARKET_KEYS.map(
          (key) => {
            const stats =
              current
                .markets[
                  key
                ] ||
              emptyMarketStats();

            return [
              key,

              {
                samples:
                  stats.samples,

                hitRate:
                  stats.samples >
                  0
                    ? Math.round(
                        (
                          stats.hits /
                          stats.samples
                        ) *
                          1000,
                      ) /
                      10
                    : null,

                brier:
                  stats.samples >
                  0
                    ? Math.round(
                        (
                          stats.sumSquaredError /
                          stats.samples
                        ) *
                          10000,
                      ) /
                      10000
                    : null,

                adjustment:
                  Math.round(
                    getMarketAdjustment(
                      key,
                    ) *
                      1000,
                  ) /
                  10,
              },
            ];
          },
        ),
      ),
  };
}

/*
 * Só tenta verificar resultados
 * quando já passaram 3 horas
 * desde o início do jogo.
 */

export function getPendingFixtureIds(
  limit = 20,
) {
  const now =
    Date.now();

  const settleAfterMs =
    3 *
    60 *
    60 *
    1000;

  return Object.values(
    loadState().pending,
  )

    .filter(
      (item) => {
        if (
          !item ||
          item.settledAt
        ) {
          return false;
        }

        const kickoff =
          new Date(
            item.kickoff ||
              0,
          ).getTime();

        return (
          Number.isFinite(
            kickoff,
          ) &&
          kickoff +
            settleAfterMs <=
            now
        );
      },
    )

    .sort(
      (a, b) =>
        new Date(
          a.kickoff ||
            0,
        ).getTime() -
        new Date(
          b.kickoff ||
            0,
        ).getTime(),
    )

    .slice(
      0,
      Math.max(
        1,
        limit,
      ),
    )

    .map(
      (item) =>
        String(
          item.fixtureId,
        ),
    );
}

/*
 * Guarda o que a NeuroWin
 * previa ANTES do jogo.
 */

export function recordPredictionSnapshot({
  fixture,
  marketProbabilities,
  selectedMarket = null,
  oddsByMarket = {},
}) {
  const fixtureId =
    String(
      fixture
        ?.fixture
        ?.id ||
        "",
    ).trim();

  if (
    !fixtureId ||
    !marketProbabilities ||
    typeof marketProbabilities !==
      "object"
  ) {
    return;
  }

  const cleanProbabilities =
    {};

  for (
    const key
    of MARKET_KEYS
  ) {
    const parsed =
      probability(
        marketProbabilities[
          key
        ],
      );

    if (
      parsed !== null
    ) {
      cleanProbabilities[
        key
      ] = parsed;
    }
  }

  if (
    !Object.keys(
      cleanProbabilities,
    ).length
  ) {
    return;
  }

  const current =
    loadState();

  current.pending[
    fixtureId
  ] = {
    fixtureId,

    kickoff:
      fixture
        ?.fixture
        ?.date ||
      null,

    leagueId:
      Number(
        fixture
          ?.league
          ?.id,
      ) ||
      null,

    season:
      Number(
        fixture
          ?.league
          ?.season,
      ) ||
      null,

    homeTeamId:
      Number(
        fixture
          ?.teams
          ?.home
          ?.id,
      ) ||
      null,

    awayTeamId:
      Number(
        fixture
          ?.teams
          ?.away
          ?.id,
      ) ||
      null,

    homeTeam:
      fixture
        ?.teams
        ?.home
        ?.name ||
      null,

    awayTeam:
      fixture
        ?.teams
        ?.away
        ?.name ||
      null,

    marketProbabilities:
      cleanProbabilities,

    selectedMarket,

    oddsByMarket,

    recordedAt:
      new Date()
        .toISOString(),
  };

  saveState();
}

function actualResultForMarket(
  marketKey,
  homeGoals,
  awayGoals,
) {
  const total =
    homeGoals +
    awayGoals;

  switch (marketKey) {
    case "HOME_WIN":
      return homeGoals >
        awayGoals
        ? 1
        : 0;

    case "DRAW":
      return homeGoals ===
        awayGoals
        ? 1
        : 0;

    case "AWAY_WIN":
      return awayGoals >
        homeGoals
        ? 1
        : 0;

    case "HOME_OR_DRAW":
      return homeGoals >=
        awayGoals
        ? 1
        : 0;

    case "AWAY_OR_DRAW":
      return awayGoals >=
        homeGoals
        ? 1
        : 0;

    case "OVER_1_5":
      return total >= 2
        ? 1
        : 0;

    case "OVER_2_5":
      return total >= 3
        ? 1
        : 0;

    case "UNDER_2_5":
      return total <= 2
        ? 1
        : 0;

    case "BTTS_YES":
      return (
        homeGoals > 0 &&
        awayGoals > 0
      )
        ? 1
        : 0;

    case "BTTS_NO":
      return (
        homeGoals === 0 ||
        awayGoals === 0
      )
        ? 1
        : 0;

    default:
      return null;
  }
}

function regulationScore(
  item,
) {
  const fulltimeHome =
    Number(
      item
        ?.score
        ?.fulltime
        ?.home,
    );

  const fulltimeAway =
    Number(
      item
        ?.score
        ?.fulltime
        ?.away,
    );

  if (
    Number.isFinite(
      fulltimeHome,
    ) &&
    Number.isFinite(
      fulltimeAway,
    )
  ) {
    return {
      home:
        fulltimeHome,

      away:
        fulltimeAway,
    };
  }

  const goalsHome =
    Number(
      item
        ?.goals
        ?.home,
    );

  const goalsAway =
    Number(
      item
        ?.goals
        ?.away,
    );

  if (
    Number.isFinite(
      goalsHome,
    ) &&
    Number.isFinite(
      goalsAway,
    )
  ) {
    return {
      home:
        goalsHome,

      away:
        goalsAway,
    };
  }

  return null;
}

/*
 * Depois do jogo:
 *
 * resultado real - probabilidade prevista
 *
 * Isto permite calibrar gradualmente
 * cada mercado.
 */

export function settleFinishedFixtures(
  fixtures = [],
) {
  const current =
    loadState();

  let settledCount = 0;

  for (
    const item
    of fixtures
  ) {
    const fixtureId =
      String(
        item
          ?.fixture
          ?.id ||
          "",
      );

    const pending =
      current
        .pending[
          fixtureId
        ];

    if (!pending) {
      continue;
    }

    const status =
      String(
        item
          ?.fixture
          ?.status
          ?.short ||
          "",
      ).toUpperCase();

    if (
      ![
        "FT",
        "AET",
        "PEN",
      ].includes(
        status,
      )
    ) {
      continue;
    }

    const score =
      regulationScore(
        item,
      );

    if (!score) {
      continue;
    }

    for (
      const [
        marketKey,
        predictedValue,
      ]
      of Object.entries(
        pending
          .marketProbabilities ||
          {},
      )
    ) {
      if (
        !MARKET_KEYS.includes(
          marketKey,
        )
      ) {
        continue;
      }

      const predicted =
        probability(
          predictedValue,
        );

      const actual =
        actualResultForMarket(
          marketKey,
          score.home,
          score.away,
        );

      if (
        predicted === null ||
        actual === null
      ) {
        continue;
      }

      const market =
        current
          .markets[
            marketKey
          ] ||
        emptyMarketStats();

      const residual =
        actual -
        predicted;

      const error =
        actual -
        predicted;

      market.samples += 1;

      market.hits +=
        actual === 1
          ? 1
          : 0;

      market.sumResidual +=
        residual;

      market.sumSquaredError +=
        error *
        error;

      current.markets[
        marketKey
      ] = market;
    }

    current.history.push({
      fixtureId,

      kickoff:
        pending.kickoff,

      homeTeam:
        pending.homeTeam,

      awayTeam:
        pending.awayTeam,

      homeGoals:
        score.home,

      awayGoals:
        score.away,

      selectedMarket:
        pending
          .selectedMarket,

      settledAt:
        new Date()
          .toISOString(),
    });

    delete current.pending[
      fixtureId
    ];

    settledCount += 1;
  }

  if (
    current.history
      .length > 1000
  ) {
    current.history =
      current.history.slice(
        -1000,
      );
  }

  if (
    settledCount >
    0
  ) {
    saveState();
  }

  return {
    settledCount,

    summary:
      getLearningSummary(),
  };
}