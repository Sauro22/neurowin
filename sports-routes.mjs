import { analyseFootballFixture } from "./sports-analysis.mjs";

import {
  getLearningSummary,
  getPendingFixtureIds,
  recordPredictionSnapshot,
  settleFinishedFixtures,
} from "./sports-learning.mjs";

const API_BASE =
  "https://v3.football.api-sports.io";

const DEFAULT_LEAGUES = [
  39,
  140,
  135,
  78,
  61,
  94,
  2,
  3,
  848,
];

function envNumber(
  name,
  fallback,
) {
  const value = Number(
    process.env[name],
  );

  return Number.isFinite(value)
    ? value
    : fallback;
}

function parseLeagueIds() {
  const raw = String(
    process.env.SPORTS_LEAGUE_IDS || "",
  ).trim();

  if (!raw) {
    return DEFAULT_LEAGUES;
  }

  const ids = raw
    .split(",")
    .map((value) =>
      Number(
        value.trim(),
      ),
    )
    .filter(
      (value) =>
        Number.isInteger(value) &&
        value > 0,
    );

  return ids.length
    ? ids
    : DEFAULT_LEAGUES;
}

function dateInTimezone(
  timezone,
  date = new Date(),
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    ).formatToParts(date);

  const map =
    Object.fromEntries(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ],
      ),
    );

  return `${map.year}-${map.month}-${map.day}`;
}

function kickoffLabel(
  iso,
  timezone,
) {
  try {
    return new Intl.DateTimeFormat(
      "pt-PT",
      {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
      },
    ).format(
      new Date(iso),
    );
  } catch {
    return "--:--";
  }
}

function hasApiErrors(
  errors,
) {
  if (!errors) {
    return false;
  }

  if (
    Array.isArray(errors)
  ) {
    return (
      errors.length > 0
    );
  }

  if (
    typeof errors ===
    "object"
  ) {
    return (
      Object.keys(errors).length >
      0
    );
  }

  return Boolean(errors);
}

function apiErrorText(
  errors,
) {
  if (!errors) {
    return "Erro desconhecido da API-Football.";
  }

  if (
    Array.isArray(errors)
  ) {
    return errors
      .map(String)
      .join(" | ");
  }

  if (
    typeof errors ===
    "object"
  ) {
    return Object.entries(errors)
      .map(
        ([key, value]) =>
          `${key}: ${String(value)}`,
      )
      .join(" | ");
  }

  return String(errors);
}

async function apiFootball(
  key,
  endpoint,
  params = {},
) {
  const url =
    new URL(
      `${API_BASE}${endpoint}`,
    );

  for (
    const [name, value]
    of Object.entries(params)
  ) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(
        name,
        String(value),
      );
    }
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      10000,
    );

  try {
    const response =
      await fetch(
        url,
        {
          headers: {
            "x-apisports-key":
              key,
          },

          signal:
            controller.signal,
        },
      );

    const remainingDaily =
      response.headers.get(
        "x-ratelimit-requests-remaining",
      );

    const remainingMinute =
      response.headers.get(
        "x-ratelimit-remaining",
      );

    const body =
      await response
        .json()
        .catch(
          () => null,
        );

    if (!response.ok) {
      throw new Error(
        `API-Football HTTP ${response.status}`,
      );
    }

    if (
      !body ||
      hasApiErrors(
        body.errors,
      )
    ) {
      throw new Error(
        apiErrorText(
          body?.errors,
        ),
      );
    }

    return {
      data:
        Array.isArray(
          body.response,
        )
          ? body.response
          : [],

      paging:
        body?.paging ||
        null,

      quota: {
        dailyRemaining:
          remainingDaily === null
            ? null
            : Number(
                remainingDaily,
              ),

        minuteRemaining:
          remainingMinute === null
            ? null
            : Number(
                remainingMinute,
              ),
      },
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      throw new Error(
        `Timeout da API-Football em ${endpoint}`,
      );
    }

    throw error;
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

function isNotStarted(
  item,
) {
  return [
    "NS",
    "TBD",
  ].includes(
    String(
      item
        ?.fixture
        ?.status
        ?.short ||
        "",
    ),
  );
}

function isFinished(
  item,
) {
  return [
    "FT",
    "AET",
    "PEN",
  ].includes(
    String(
      item
        ?.fixture
        ?.status
        ?.short ||
        "",
    ),
  );
}

function mergeOddsItems(
  current,
  incoming,
) {
  if (!current) {
    return incoming;
  }

  return {
    ...current,
    ...incoming,

    bookmakers: [
      ...(
        Array.isArray(
          current
            ?.bookmakers,
        )
          ? current.bookmakers
          : []
      ),

      ...(
        Array.isArray(
          incoming
            ?.bookmakers,
        )
          ? incoming.bookmakers
          : []
      ),
    ],
  };
}

async function fetchOddsForFixtures({
  apiKey,
  date,
  timezone,
  fixtures,
  maxPages,
}) {
  const byFixture =
    new Map();

  const groups =
    new Map();

  for (
    const fixture
    of fixtures
  ) {
    const leagueId =
      Number(
        fixture
          ?.league
          ?.id,
      );

    const season =
      Number(
        fixture
          ?.league
          ?.season,
      );

    const fixtureId =
      String(
        fixture
          ?.fixture
          ?.id ||
          "",
      );

    if (
      !leagueId ||
      !season ||
      !fixtureId
    ) {
      continue;
    }

    const groupKey =
      `${leagueId}:${season}`;

    if (
      !groups.has(
        groupKey,
      )
    ) {
      groups.set(
        groupKey,
        {
          leagueId,
          season,

          fixtureIds:
            new Set(),
        },
      );
    }

    groups
      .get(
        groupKey,
      )
      .fixtureIds
      .add(
        fixtureId,
      );
  }

  let lastQuota =
    null;

  let pagesRead =
    0;

  for (
    const group
    of groups.values()
  ) {
    let page =
      1;

    let totalPages =
      1;

    while (
      page <= maxPages &&
      page <= totalPages
    ) {
      if (
        lastQuota
          ?.minuteRemaining !==
          null &&
        lastQuota
          ?.minuteRemaining !==
          undefined &&
        lastQuota
          .minuteRemaining <=
          0
      ) {
        console.log(
          "Odds: limite por minuto atingido.",
        );

        break;
      }

      const response =
        await apiFootball(
          apiKey,
          "/odds",
          {
            league:
              group.leagueId,

            season:
              group.season,

            date,

            timezone,

            page,
          },
        );

      pagesRead +=
        1;

      lastQuota =
        response.quota;

      totalPages =
        Math.max(
          1,

          Number(
            response
              ?.paging
              ?.total,
          ) ||
            1,
        );

      for (
        const item
        of response.data
      ) {
        const fixtureId =
          String(
            item
              ?.fixture
              ?.id ||
              "",
          );

        if (
          !group
            .fixtureIds
            .has(
              fixtureId,
            )
        ) {
          continue;
        }

        byFixture.set(
          fixtureId,

          mergeOddsItems(
            byFixture.get(
              fixtureId,
            ),

            item,
          ),
        );
      }

      const foundAll =
        [
          ...group.fixtureIds,
        ].every(
          (fixtureId) =>
            byFixture.has(
              fixtureId,
            ),
        );

      if (foundAll) {
        break;
      }

      page +=
        1;
    }
  }

  return {
    byFixture,

    quota:
      lastQuota,

    pagesRead,
  };
}

async function settleLearningSafely({
  apiKey,
  timezone,
  lastQuota,
  enabled,
}) {
  if (!enabled) {
    return {
      quota:
        lastQuota,

      settlement:
        null,
    };
  }

  const remaining =
    lastQuota
      ?.minuteRemaining;

  if (
    typeof remaining ===
      "number" &&
    remaining <= 2
  ) {
    return {
      quota:
        lastQuota,

      settlement:
        null,
    };
  }

  const pendingIds =
    getPendingFixtureIds(
      1,
    );

  if (
    !pendingIds.length
  ) {
    return {
      quota:
        lastQuota,

      settlement:
        null,
    };
  }

  try {
    const response =
      await apiFootball(
        apiKey,
        "/fixtures",
        {
          id:
            pendingIds[0],

          timezone,
        },
      );

    const finished =
      response.data.filter(
        isFinished,
      );

    const settlement =
      finished.length
        ? settleFinishedFixtures(
            finished,
          )
        : null;

    return {
      quota:
        response.quota ||
        lastQuota,

      settlement,
    };
  } catch (error) {
    console.error(
      "Sports learning settle:",

      error instanceof Error
        ? error.message
        : String(error),
    );

    return {
      quota:
        lastQuota,

      settlement:
        null,
    };
  }
}

export function setupSportsRoutes(
  app,
) {
  const apiKey =
    String(
      process.env.APISPORTS_KEY ||
        process.env.API_FOOTBALL_KEY ||
        "",
    ).trim();

  const timezone =
    String(
      process.env.SPORTS_TIMEZONE ||
        "Europe/Lisbon",
    ).trim();

  const requireOdds =
    String(
      process.env.SPORTS_REQUIRE_ODDS ??
        "1",
    ) !== "0";

  const learningSettleEnabled =
    String(
      process.env.SPORTS_LEARNING_SETTLE_ENABLED ??
        "0",
    ) === "1";

  const leagueIds =
    parseLeagueIds();

  const maxAnalysedMatches =
    Math.min(
      8,

      Math.max(
        1,

        envNumber(
          "SPORTS_MAX_ANALYSED_MATCHES",
          5,
        ),
      ),
    );

  const cacheMs =
    Math.max(
      60000,

      envNumber(
        "SPORTS_CACHE_MS",
        15 *
          60 *
          1000,
      ),
    );

  const predictionCacheMs =
    Math.max(
      60000,

      envNumber(
        "SPORTS_PREDICTION_CACHE_MS",
        6 *
          60 *
          60 *
          1000,
      ),
    );

  const oddsCacheMs =
    Math.max(
      60000,

      envNumber(
        "SPORTS_ODDS_CACHE_MS",
        3 *
          60 *
          60 *
          1000,
      ),
    );

  const oddsMaxPages =
    Math.min(
      5,

      Math.max(
        1,

        envNumber(
          "SPORTS_ODDS_MAX_PAGES",
          2,
        ),
      ),
    );

  const cache =
    new Map();

  const predictionCache =
    new Map();

  const oddsCache =
    new Map();

  app.get(
    "/api/sports/health",

    (
      req,
      res,
    ) => {
      res.json({
        ok:
          true,

        provider:
          "API-Football",

        analysis:
          "NeuroWin V4 + last_5 do /predictions + odds + learning",

        configured:
          Boolean(
            apiKey,
          ),

        timezone,

        leagues:
          leagueIds,

        maxAnalysedMatches,

        requireOdds,

        learningSettleEnabled,
      });
    },
  );

  app.get(
    "/api/sports/learning",

    (
      req,
      res,
    ) => {
      res.json({
        ok:
          true,

        ...getLearningSummary(),
      });
    },
  );

  app.get(
    "/api/sports/today",

    async (
      req,
      res,
    ) => {
      if (!apiKey) {
        return res
          .status(
            503,
          )
          .json({
            ok:
              false,

            error:
              "APISPORTS_KEY não está configurada no .env.",
          });
      }

      const todayDate =
        dateInTimezone(
          timezone,
        );

      const tomorrowDate =
        dateInTimezone(
          timezone,

          new Date(
            Date.now() +
              24 *
                60 *
                60 *
                1000,
          ),
        );

      const refresh =
        String(
          req.query
            .refresh ||
            "",
        ) === "1";

      const cacheKey =
        `${todayDate}:${leagueIds.join(
          ",",
        )}`;

      const cached =
        cache.get(
          cacheKey,
        );

      if (
        !refresh &&
        cached &&
        Date.now() -
          cached.createdAt <
          cacheMs
      ) {
        return res.json({
          ...cached.payload,

          cache:
            true,
        });
      }

      try {
        let selectedDate =
          todayDate;

        let fixturesResponse =
          await apiFootball(
            apiKey,
            "/fixtures",
            {
              date:
                todayDate,

              timezone,
            },
          );

        let fixtures =
          fixturesResponse
            .data
            .filter(
              isNotStarted,
            )
            .filter(
              (item) =>
                leagueIds.includes(
                  Number(
                    item
                      ?.league
                      ?.id,
                  ),
                ),
            )
            .sort(
              (a, b) =>
                new Date(
                  a.fixture.date,
                ).getTime() -
                new Date(
                  b.fixture.date,
                ).getTime(),
            );

        if (
          fixtures.length ===
          0
        ) {
          selectedDate =
            tomorrowDate;

          fixturesResponse =
            await apiFootball(
              apiKey,
              "/fixtures",
              {
                date:
                  tomorrowDate,

                timezone,
              },
            );

          fixtures =
            fixturesResponse
              .data
              .filter(
                isNotStarted,
              )
              .filter(
                (item) =>
                  leagueIds.includes(
                    Number(
                      item
                        ?.league
                        ?.id,
                    ),
                  ),
              )
              .sort(
                (a, b) =>
                  new Date(
                    a.fixture.date,
                  ).getTime() -
                  new Date(
                    b.fixture.date,
                  ).getTime(),
              );
        }

        const fixturesToAnalyse =
          fixtures.slice(
            0,
            maxAnalysedMatches,
          );

        let lastQuota =
          fixturesResponse.quota;

        let oddsByFixture =
          new Map();

        let oddsError =
          null;

        let oddsPagesRead =
          0;

        const oddsCacheKey =
          `${selectedDate}:${timezone}`;

        const cachedOdds =
          oddsCache.get(
            oddsCacheKey,
          );

        if (!requireOdds) {
          oddsByFixture =
            new Map();
        } else if (
          cachedOdds &&
          Date.now() -
            cachedOdds.createdAt <
            oddsCacheMs
        ) {
          oddsByFixture =
            cachedOdds.byFixture;
        } else if (
          fixturesToAnalyse.length >
          0
        ) {
          try {
            const oddsResult =
              await fetchOddsForFixtures(
                {
                  apiKey,

                  date:
                    selectedDate,

                  timezone,

                  fixtures:
                    fixturesToAnalyse,

                  maxPages:
                    oddsMaxPages,
                },
              );

            oddsByFixture =
              oddsResult.byFixture;

            oddsPagesRead =
              oddsResult.pagesRead;

            if (
              oddsResult.quota
            ) {
              lastQuota =
                oddsResult.quota;
            }

            oddsCache.set(
              oddsCacheKey,

              {
                createdAt:
                  Date.now(),

                byFixture:
                  oddsByFixture,
              },
            );
          } catch (error) {
            oddsError =
              error instanceof Error
                ? error.message
                : String(error);

            console.error(
              "Sports odds:",
              oddsError,
            );
          }
        }

        const matches =
          [];

        for (
          const fixture
          of fixturesToAnalyse
        ) {
          const fixtureId =
            String(
              fixture
                ?.fixture
                ?.id ||
                "",
            );

          let predictionData =
            null;

          let predictionAvailable =
            false;

          let predictionError =
            null;

          let predictionFromCache =
            false;

          const cachedPrediction =
            predictionCache.get(
              fixtureId,
            );

          if (
            !refresh &&
            cachedPrediction &&
            Date.now() -
              cachedPrediction.createdAt <
              predictionCacheMs
          ) {
            predictionData =
              cachedPrediction.data;

            predictionAvailable =
              Boolean(
                predictionData,
              );

            predictionFromCache =
              true;

            console.log(
              `Prediction ${fixtureId}: CACHE`,
            );
          } else if (
            lastQuota
              ?.minuteRemaining !==
              null &&
            lastQuota
              ?.minuteRemaining !==
              undefined &&
            lastQuota
              .minuteRemaining <=
              0
          ) {
            predictionError =
              "Limite temporário de pedidos da API atingido.";

            console.log(
              `Prediction ${fixtureId}: LIMITE API`,
            );
          } else {
            try {
              const predictionResponse =
                await apiFootball(
                  apiKey,
                  "/predictions",

                  {
                    fixture:
                      fixture
                        .fixture
                        .id,
                  },
                );

              lastQuota =
                predictionResponse.quota;

              predictionData =
                predictionResponse
                  .data?.[0] ||
                null;

              predictionAvailable =
                Boolean(
                  predictionData,
                );

              predictionCache.set(
                fixtureId,

                {
                  createdAt:
                    Date.now(),

                  data:
                    predictionData,
                },
              );

              console.log(
                `Prediction ${fixtureId}:`,

                predictionAvailable
                  ? "OK"
                  : "SEM DADOS",
              );
            } catch (error) {
              predictionError =
                error instanceof Error
                  ? error.message
                  : String(error);

              console.error(
                `Prediction ${fixtureId}:`,
                predictionError,
              );
            }
          }

          const oddsData =
            oddsByFixture.get(
              fixtureId,
            ) ||
            null;

          const prediction =
            analyseFootballFixture(
              {
                fixture,

                predictionData,

                oddsData,
              },
            );

          if (
            prediction
              ?.marketProbabilities &&
            Object.keys(
              prediction
                .marketProbabilities,
            ).length >
              0
          ) {
            recordPredictionSnapshot(
              {
                fixture,

                marketProbabilities:
                  prediction
                    .marketProbabilities,

                selectedMarket:
                  prediction
                    .pickKey,

                oddsByMarket:
                  prediction
                    .oddsByMarket,
              },
            );
          }

          matches.push({
            id:
              fixtureId,

            league:
              fixture
                ?.league
                ?.name,

            country:
              fixture
                ?.league
                ?.country,

            leagueId:
              Number(
                fixture
                  ?.league
                  ?.id,
              ),

            season:
              Number(
                fixture
                  ?.league
                  ?.season,
              ),

            kickoff:
              fixture
                ?.fixture
                ?.date,

            kickoffLabel:
              kickoffLabel(
                fixture
                  ?.fixture
                  ?.date,

                timezone,
              ),

            homeTeam:
              fixture
                ?.teams
                ?.home
                ?.name,

            awayTeam:
              fixture
                ?.teams
                ?.away
                ?.name,

            homeTeamId:
              Number(
                fixture
                  ?.teams
                  ?.home
                  ?.id,
              ),

            awayTeamId:
              Number(
                fixture
                  ?.teams
                  ?.away
                  ?.id,
              ),

            predictionAvailable,

            predictionFromCache,

            predictionError,

            oddsAvailable:
              Boolean(
                oddsData,
              ),

            recentForm: {
              homeMatches:
                prediction
                  ?.sample
                  ?.recentHomeMatches ??
                0,

              awayMatches:
                prediction
                  ?.sample
                  ?.recentAwayMatches ??
                0,
            },

            prediction,
          });
        }

        const settlementResult =
          await settleLearningSafely(
            {
              apiKey,

              timezone,

              lastQuota,

              enabled:
                learningSettleEnabled,
            },
          );

        lastQuota =
          settlementResult.quota ||
          lastQuota;

        const learningSettlement =
          settlementResult.settlement;

        const hasTemporaryErrors =
          matches.some(
            (match) => {
              const error =
                String(
                  match
                    .predictionError ||
                    "",
                );

              return (
                error.includes(
                  "429",
                ) ||
                error.includes(
                  "Timeout",
                ) ||
                error.includes(
                  "Limite temporário",
                )
              );
            },
          );

        const payload = {
          ok:
            true,

          source:
            "API-Football",

          analysisSource:
            "NeuroWin V4 + last_5 do /predictions + odds + learning",

          date:
            selectedDate,

          day:
            selectedDate ===
            todayDate
              ? "today"
              : "tomorrow",

          timezone,

          generatedAt:
            new Date()
              .toISOString(),

          quota:
            lastQuota,

          totalFixtures:
            fixtures.length,

          analysedFixtures:
            fixturesToAnalyse
              .length,

          complete:
            !hasTemporaryErrors,

          odds: {
            enabled:
              requireOdds,

            pagesRead:
              oddsPagesRead,

            error:
              oddsError,

            fixturesWithOdds:
              matches.filter(
                (match) =>
                  match
                    .oddsAvailable,
              ).length,
          },

          learning:
            learningSettlement
              ?.summary ||
            getLearningSummary(),

          matches,
        };

        if (
          !hasTemporaryErrors
        ) {
          cache.set(
            cacheKey,

            {
              createdAt:
                Date.now(),

              payload,
            },
          );
        }

        return res.json({
          ...payload,

          cache:
            false,
        });
      } catch (error) {
        console.error(
          "Sports today:",

          error?.message ||
            error,
        );

        return res
          .status(
            502,
          )
          .json({
            ok:
              false,

            error:
              error instanceof Error
                ? error.message
                : "Não foi possível obter os jogos do dia.",
          });
      }
    },
  );
}