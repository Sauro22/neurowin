import { getLearningSummary } from "./sports-learning.mjs";

const MARKET_LABELS = {
  HOME_WIN: "Casa vence",
  DRAW: "Empate",
  AWAY_WIN: "Visitante vence",
  HOME_OR_DRAW: "1X (Casa ou empate)",
  AWAY_OR_DRAW: "X2 (Visitante ou empate)",
  OVER_1_5: "Mais de 1.5 golos",
  OVER_2_5: "Mais de 2.5 golos",
  UNDER_2_5: "Menos de 2.5 golos",
  BTTS_YES: "Ambas marcam — SIM",
  BTTS_NO: "Ambas marcam — NÃO",
};

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

function toNumber(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value ===
    "number"
  ) {
    return Number.isFinite(
      value,
    )
      ? value
      : null;
  }

  const parsed =
    Number(
      String(
        value,
      ).replace(
        ",",
        ".",
      ),
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function percentToProbability(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value ===
    "number"
  ) {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return null;
    }

    return clamp(
      value > 1
        ? value / 100
        : value,
      0,
      1,
    );
  }

  const parsed =
    Number(
      String(
        value,
      )
        .replace(
          "%",
          "",
        )
        .replace(
          ",",
          ".",
        )
        .trim(),
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return null;
  }

  return clamp(
    parsed > 1
      ? parsed / 100
      : parsed,
    0,
    1,
  );
}

function mean(
  values,
) {
  const valid =
    values.filter(
      (value) =>
        typeof value ===
          "number" &&
        Number.isFinite(
          value,
        ),
    );

  if (
    !valid.length
  ) {
    return null;
  }

  return (
    valid.reduce(
      (
        sum,
        value,
      ) =>
        sum +
        value,
      0,
    ) /
    valid.length
  );
}

function weightedAverage(
  items,
) {
  const valid =
    items.filter(
      (item) =>
        typeof item
          ?.value ===
          "number" &&
        Number.isFinite(
          item.value,
        ) &&
        typeof item
          ?.weight ===
          "number" &&
        item.weight >
          0,
    );

  if (
    !valid.length
  ) {
    return null;
  }

  const totalWeight =
    valid.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.weight,
      0,
    );

  if (
    totalWeight <=
    0
  ) {
    return null;
  }

  return (
    valid.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.value *
          item.weight,
      0,
    ) /
    totalWeight
  );
}

function normalizeThree(
  home,
  draw,
  away,
) {
  const h =
    Math.max(
      0,
      Number(
        home,
      ) ||
        0,
    );

  const d =
    Math.max(
      0,
      Number(
        draw,
      ) ||
        0,
    );

  const a =
    Math.max(
      0,
      Number(
        away,
      ) ||
        0,
    );

  const total =
    h +
    d +
    a;

  if (
    total <=
    0
  ) {
    return {
      home:
        1 / 3,

      draw:
        1 / 3,

      away:
        1 / 3,
    };
  }

  return {
    home:
      h /
      total,

    draw:
      d /
      total,

    away:
      a /
      total,
  };
}

function poisson(
  lambda,
  goals,
) {
  if (
    !Number.isFinite(
      lambda,
    ) ||
    lambda <
      0 ||
    goals <
      0
  ) {
    return 0;
  }

  let factorial =
    1;

  for (
    let i = 2;
    i <= goals;
    i += 1
  ) {
    factorial *=
      i;
  }

  return (
    Math.exp(
      -lambda,
    ) *
    Math.pow(
      lambda,
      goals,
    )
  ) /
    factorial;
}

function poissonMatrix(
  homeLambda,
  awayLambda,
  maxGoals = 8,
) {
  const matrix =
    [];

  for (
    let home = 0;
    home <= maxGoals;
    home += 1
  ) {
    for (
      let away = 0;
      away <= maxGoals;
      away += 1
    ) {
      matrix.push({
        home,

        away,

        probability:
          poisson(
            homeLambda,
            home,
          ) *
          poisson(
            awayLambda,
            away,
          ),
      });
    }
  }

  const total =
    matrix.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.probability,
      0,
    );

  if (
    total >
    0
  ) {
    for (
      const item
      of matrix
    ) {
      item.probability /=
        total;
    }
  }

  return matrix;
}

function probabilityOf(
  matrix,
  test,
) {
  return clamp(
    matrix
      .filter(
        test,
      )
      .reduce(
        (
          sum,
          item,
        ) =>
          sum +
          item.probability,
        0,
      ),

    0,

    1,
  );
}

function firstNumber(
  ...values
) {
  for (
    const value
    of values
  ) {
    const number =
      toNumber(
        value,
      );

    if (
      number !==
      null
    ) {
      return number;
    }
  }

  return null;
}

/* ==========================================
   ÚLTIMOS 5 JOGOS DA API-FOOTBALL
========================================== */

function readLastFive(
  teamNode,
) {
  const last =
    teamNode
      ?.last_5;

  if (
    !last ||
    typeof last !==
      "object"
  ) {
    return {
      matches:
        0,

      form:
        null,

      attack:
        null,

      defence:
        null,

      goalsForTotal:
        null,

      goalsAgainstTotal:
        null,

      avgGoalsFor:
        null,

      avgGoalsAgainst:
        null,
    };
  }

  const avgGoalsFor =
    firstNumber(
      last
        ?.goals
        ?.for
        ?.average,

      last
        ?.goals
        ?.for,
    );

  const avgGoalsAgainst =
    firstNumber(
      last
        ?.goals
        ?.against
        ?.average,

      last
        ?.goals
        ?.against,
    );

  return {
    matches:
      5,

    form:
      percentToProbability(
        last
          ?.form,
      ),

    attack:
      percentToProbability(
        last
          ?.att,
      ),

    defence:
      percentToProbability(
        last
          ?.def,
      ),

    goalsForTotal:
      firstNumber(
        last
          ?.goals
          ?.for
          ?.total,
      ),

    goalsAgainstTotal:
      firstNumber(
        last
          ?.goals
          ?.against
          ?.total,
      ),

    avgGoalsFor,

    avgGoalsAgainst,
  };
}

function buildRecentForm(
  predictionData,
) {
  return {
    home:
      readLastFive(
        predictionData
          ?.teams
          ?.home,
      ),

    away:
      readLastFive(
        predictionData
          ?.teams
          ?.away,
      ),
  };
}

/* ==========================================
   MODELO DE GOLOS
========================================== */

function estimateGoals(
  predictionData,
  recentForm,
) {
  const home =
    predictionData
      ?.teams
      ?.home;

  const away =
    predictionData
      ?.teams
      ?.away;

  const homeSeasonFor =
    firstNumber(
      home
        ?.league
        ?.goals
        ?.for
        ?.average
        ?.home,

      home
        ?.league
        ?.goals
        ?.for
        ?.average
        ?.total,
    );

  const homeSeasonAgainst =
    firstNumber(
      home
        ?.league
        ?.goals
        ?.against
        ?.average
        ?.home,

      home
        ?.league
        ?.goals
        ?.against
        ?.average
        ?.total,
    );

  const awaySeasonFor =
    firstNumber(
      away
        ?.league
        ?.goals
        ?.for
        ?.average
        ?.away,

      away
        ?.league
        ?.goals
        ?.for
        ?.average
        ?.total,
    );

  const awaySeasonAgainst =
    firstNumber(
      away
        ?.league
        ?.goals
        ?.against
        ?.average
        ?.away,

      away
        ?.league
        ?.goals
        ?.against
        ?.average
        ?.total,
    );

  const expectedHome =
    weightedAverage([
      {
        value:
          recentForm
            .home
            .avgGoalsFor,

        weight:
          0.34,
      },

      {
        value:
          recentForm
            .away
            .avgGoalsAgainst,

        weight:
          0.26,
      },

      {
        value:
          homeSeasonFor,

        weight:
          0.20,
      },

      {
        value:
          awaySeasonAgainst,

        weight:
          0.20,
      },
    ]) ??
    1.35;

  const expectedAway =
    weightedAverage([
      {
        value:
          recentForm
            .away
            .avgGoalsFor,

        weight:
          0.34,
      },

      {
        value:
          recentForm
            .home
            .avgGoalsAgainst,

        weight:
          0.26,
      },

      {
        value:
          awaySeasonFor,

        weight:
          0.20,
      },

      {
        value:
          homeSeasonAgainst,

        weight:
          0.20,
      },
    ]) ??
    1.15;

  const available =
    [
      recentForm
        .home
        .avgGoalsFor,

      recentForm
        .home
        .avgGoalsAgainst,

      recentForm
        .away
        .avgGoalsFor,

      recentForm
        .away
        .avgGoalsAgainst,

      homeSeasonFor,

      homeSeasonAgainst,

      awaySeasonFor,

      awaySeasonAgainst,
    ].filter(
      (value) =>
        typeof value ===
          "number" &&
        Number.isFinite(
          value,
        ),
    ).length;

  return {
    home:
      clamp(
        expectedHome,
        0.25,
        3.4,
      ),

    away:
      clamp(
        expectedAway,
        0.25,
        3.4,
      ),

    reliability:
      clamp(
        available /
          8,
        0,
        1,
      ),
  };
}

function providerGoalSignal(
  predictionData,
) {
  const predictions =
    predictionData
      ?.predictions ||
    {};

  return {
    home:
      predictions
        ?.goals
        ?.home ??
      null,

    away:
      predictions
        ?.goals
        ?.away ??
      null,

    underOver:
      predictions
        ?.under_over ??
      null,
  };
}

/* ==========================================
   1X2
========================================== */

function apiOneXTwo(
  predictionData,
) {
  const percent =
    predictionData
      ?.predictions
      ?.percent ||
    {};

  const home =
    percentToProbability(
      percent.home,
    );

  const draw =
    percentToProbability(
      percent.draw,
    );

  const away =
    percentToProbability(
      percent.away,
    );

  if (
    home ===
      null ||
    draw ===
      null ||
    away ===
      null
  ) {
    return null;
  }

  return normalizeThree(
    home,
    draw,
    away,
  );
}

function comparisonPair(
  node,
) {
  if (!node) {
    return null;
  }

  const home =
    percentToProbability(
      node.home,
    );

  const away =
    percentToProbability(
      node.away,
    );

  if (
    home ===
      null ||
    away ===
      null ||
    home +
      away <=
      0
  ) {
    return null;
  }

  return {
    home:
      home /
      (
        home +
        away
      ),

    away:
      away /
      (
        home +
        away
      ),
  };
}

function comparisonStrength(
  predictionData,
) {
  const comparison =
    predictionData
      ?.comparison ||
    {};

  const signals = [
    {
      pair:
        comparisonPair(
          comparison.form,
        ),

      weight:
        0.23,
    },

    {
      pair:
        comparisonPair(
          comparison.att,
        ),

      weight:
        0.18,
    },

    {
      pair:
        comparisonPair(
          comparison.def,
        ),

      weight:
        0.18,
    },

    {
      pair:
        comparisonPair(
          comparison
            .poisson_distribution,
        ),

      weight:
        0.18,
    },

    {
      pair:
        comparisonPair(
          comparison.goals,
        ),

      weight:
        0.10,
    },

    {
      pair:
        comparisonPair(
          comparison.total,
        ),

      weight:
        0.08,
    },

    {
      pair:
        comparisonPair(
          comparison.h2h,
        ),

      weight:
        0.05,
    },
  ].filter(
    (item) =>
      item.pair,
  );

  if (
    !signals.length
  ) {
    return null;
  }

  const home =
    weightedAverage(
      signals.map(
        (item) => ({
          value:
            item
              .pair
              .home,

          weight:
            item.weight,
        }),
      ),
    );

  if (
    home ===
    null
  ) {
    return null;
  }

  return {
    home:
      clamp(
        home,
        0.02,
        0.98,
      ),

    away:
      clamp(
        1 -
          home,
        0.02,
        0.98,
      ),

    signalCount:
      signals.length,
  };
}

function pseudoOneXTwoFromComparison(
  strength,
  poisson1x2,
  api1x2,
) {
  if (
    !strength
  ) {
    return null;
  }

  const drawBase =
    weightedAverage([
      {
        value:
          poisson1x2
            ?.draw,

        weight:
          0.65,
      },

      {
        value:
          api1x2
            ?.draw,

        weight:
          0.35,
      },
    ]);

  const parity =
    1 -
    Math.min(
      1,

      Math.abs(
        strength.home -
          strength.away,
      ) *
        2,
    );

  const draw =
    clamp(
      drawBase ??
        0.2 +
          parity *
            0.1,

      0.12,

      0.38,
    );

  const winMass =
    1 -
    draw;

  return {
    home:
      strength.home *
      winMass,

    draw,

    away:
      strength.away *
      winMass,
  };
}

function recentOneXTwo(
  recentForm,
) {
  const score =
    (item) => {
      if (
        !item
          ?.matches
      ) {
        return null;
      }

      return weightedAverage([
        {
          value:
            item.form,

          weight:
            0.55,
        },

        {
          value:
            item.attack,

          weight:
            0.25,
        },

        {
          value:
            item.defence,

          weight:
            0.20,
        },
      ]);
    };

  const homeScore =
    score(
      recentForm.home,
    );

  const awayScore =
    score(
      recentForm.away,
    );

  if (
    homeScore ===
      null ||
    awayScore ===
      null
  ) {
    return null;
  }

  const sum =
    homeScore +
    awayScore;

  const rawHomeShare =
    sum >
    0
      ? homeScore /
        sum
      : 0.5;

  const homeShare =
    clamp(
      rawHomeShare +
        0.025,
      0.18,
      0.82,
    );

  const parity =
    1 -
    Math.min(
      1,

      Math.abs(
        homeScore -
          awayScore,
      ),
    );

  const draw =
    clamp(
      0.18 +
        parity *
          0.10,

      0.16,

      0.32,
    );

  const winMass =
    1 -
    draw;

  return normalizeThree(
    homeShare *
      winMass,

    draw,

    (
      1 -
      homeShare
    ) *
      winMass,
  );
}

/* ==========================================
   LEARNING
========================================== */

function getLearningAdjustment(
  key,
) {
  try {
    const summary =
      getLearningSummary?.();

    const raw =
      toNumber(
        summary
          ?.markets
          ?.[key]
          ?.adjustment,
      );

    if (
      raw ===
      null
    ) {
      return 0;
    }

    const normalized =
      Math.abs(
        raw,
      ) >
      1
        ? raw /
          100
        : raw;

    return clamp(
      normalized,
      -0.08,
      0.08,
    );
  } catch {
    return 0;
  }
}

function applyLearning(
  base,
) {
  const homeAdjustment =
    getLearningAdjustment(
      "HOME_WIN",
    );

  const drawAdjustment =
    getLearningAdjustment(
      "DRAW",
    );

  const awayAdjustment =
    getLearningAdjustment(
      "AWAY_WIN",
    );

  const adjusted =
    normalizeThree(
      base.home +
        homeAdjustment,

      base.draw +
        drawAdjustment,

      base.away +
        awayAdjustment,
    );

  return {
    ...adjusted,

    adjustments: {
      HOME_WIN:
        homeAdjustment,

      DRAW:
        drawAdjustment,

      AWAY_WIN:
        awayAdjustment,
    },
  };
}

function standardDeviation(
  values,
) {
  const valid =
    values.filter(
      (value) =>
        typeof value ===
          "number" &&
        Number.isFinite(
          value,
        ),
    );

  if (
    valid.length <=
    1
  ) {
    return 0;
  }

  const average =
    mean(
      valid,
    ) ??
    0;

  const variance =
    valid.reduce(
      (
        sum,
        value,
      ) =>
        sum +
        Math.pow(
          value -
            average,
          2,
        ),
      0,
    ) /
    valid.length;

  return Math.sqrt(
    variance,
  );
}

/* ==========================================
   MODELO COMPLETO
========================================== */

function buildModelProbabilities(
  predictionData,
  recentForm,
) {
  const goals =
    estimateGoals(
      predictionData,
      recentForm,
    );

  const matrix =
    poissonMatrix(
      goals.home,
      goals.away,
    );

  const poisson1x2 = {
    home:
      probabilityOf(
        matrix,

        (item) =>
          item.home >
          item.away,
      ),

    draw:
      probabilityOf(
        matrix,

        (item) =>
          item.home ===
          item.away,
      ),

    away:
      probabilityOf(
        matrix,

        (item) =>
          item.away >
          item.home,
      ),
  };

  const api1x2 =
    apiOneXTwo(
      predictionData,
    );

  const strength =
    comparisonStrength(
      predictionData,
    );

  const comparison1x2 =
    pseudoOneXTwoFromComparison(
      strength,
      poisson1x2,
      api1x2,
    );

  const recent1x2 =
    recentOneXTwo(
      recentForm,
    );

  const home =
    weightedAverage([
      {
        value:
          poisson1x2
            .home,

        weight:
          0.40,
      },

      {
        value:
          api1x2
            ?.home,

        weight:
          0.25,
      },

      {
        value:
          comparison1x2
            ?.home,

        weight:
          0.20,
      },

      {
        value:
          recent1x2
            ?.home,

        weight:
          0.15,
      },
    ]);

  const draw =
    weightedAverage([
      {
        value:
          poisson1x2
            .draw,

        weight:
          0.42,
      },

      {
        value:
          api1x2
            ?.draw,

        weight:
          0.26,
      },

      {
        value:
          comparison1x2
            ?.draw,

        weight:
          0.17,
      },

      {
        value:
          recent1x2
            ?.draw,

        weight:
          0.15,
      },
    ]);

  const away =
    weightedAverage([
      {
        value:
          poisson1x2
            .away,

        weight:
          0.40,
      },

      {
        value:
          api1x2
            ?.away,

        weight:
          0.25,
      },

      {
        value:
          comparison1x2
            ?.away,

        weight:
          0.20,
      },

      {
        value:
          recent1x2
            ?.away,

        weight:
          0.15,
      },
    ]);

  const learned =
    applyLearning(
      normalizeThree(
        home ??
          poisson1x2
            .home,

        draw ??
          poisson1x2
            .draw,

        away ??
          poisson1x2
            .away,
      ),
    );

  const over15 =
    probabilityOf(
      matrix,

      (item) =>
        item.home +
          item.away >=
        2,
    );

  const over25 =
    probabilityOf(
      matrix,

      (item) =>
        item.home +
          item.away >=
        3,
    );

  const bttsYes =
    probabilityOf(
      matrix,

      (item) =>
        item.home >=
          1 &&
        item.away >=
          1,
    );

  return {
    goals,

    poisson1x2,

    api1x2,

    comparison1x2,

    recent1x2,

    comparisonStrength:
      strength,

    adjustments:
      learned.adjustments,

    marketProbabilities: {
      HOME_WIN:
        learned.home,

      DRAW:
        learned.draw,

      AWAY_WIN:
        learned.away,

      HOME_OR_DRAW:
        clamp(
          learned.home +
            learned.draw,
          0,
          1,
        ),

      AWAY_OR_DRAW:
        clamp(
          learned.away +
            learned.draw,
          0,
          1,
        ),

      OVER_1_5:
        over15,

      OVER_2_5:
        over25,

      UNDER_2_5:
        1 -
        over25,

      BTTS_YES:
        bttsYes,

      BTTS_NO:
        1 -
        bttsYes,
    },

    homeDisagreement:
      standardDeviation([
        poisson1x2
          .home,

        api1x2
          ?.home,

        comparison1x2
          ?.home,

        recent1x2
          ?.home,
      ]),

    awayDisagreement:
      standardDeviation([
        poisson1x2
          .away,

        api1x2
          ?.away,

        comparison1x2
          ?.away,

        recent1x2
          ?.away,
      ]),
  };
}

/* ==========================================
   ODDS
========================================== */

function normalizeBetName(
  value,
) {
  return String(
    value ||
      "",
  )
    .trim()
    .toLowerCase()
    .normalize(
      "NFD",
    )
    .replace(
      /[\u0300-\u036f]/g,
      "",
    );
}

function extractOdds(
  oddsData,
) {
  const result =
    {};

  if (
    !oddsData ||
    !Array.isArray(
      oddsData.bookmakers,
    )
  ) {
    return result;
  }

  function setBest(
    key,
    odd,
    bookmaker,
  ) {
    const numericOdd =
      toNumber(
        odd,
      );

    if (
      !numericOdd ||
      numericOdd <=
        1
    ) {
      return;
    }

    if (
      !result[
        key
      ] ||
      numericOdd >
        result[
          key
        ].odd
    ) {
      result[
        key
      ] = {
        odd:
          numericOdd,

        bookmaker:
          bookmaker ||
          null,
      };
    }
  }

  for (
    const bookmaker
    of oddsData.bookmakers
  ) {
    const bookmakerName =
      bookmaker
        ?.name ||
      null;

    for (
      const bet
      of bookmaker
        ?.bets ||
      []
    ) {
      const betName =
        normalizeBetName(
          bet
            ?.name,
        );

      for (
        const value
        of bet
          ?.values ||
        []
      ) {
        const option =
          normalizeBetName(
            value
              ?.value,
          );

        if (
          betName.includes(
            "match winner",
          ) ||
          betName ===
            "winner" ||
          betName.includes(
            "1x2",
          )
        ) {
          if (
            [
              "home",
              "1",
            ].includes(
              option,
            )
          ) {
            setBest(
              "HOME_WIN",
              value
                ?.odd,
              bookmakerName,
            );
          } else if (
            [
              "draw",
              "x",
            ].includes(
              option,
            )
          ) {
            setBest(
              "DRAW",
              value
                ?.odd,
              bookmakerName,
            );
          } else if (
            [
              "away",
              "2",
            ].includes(
              option,
            )
          ) {
            setBest(
              "AWAY_WIN",
              value
                ?.odd,
              bookmakerName,
            );
          }
        }

        if (
          betName.includes(
            "double chance",
          )
        ) {
          if (
            [
              "home/draw",
              "1x",
              "home or draw",
            ].includes(
              option,
            )
          ) {
            setBest(
              "HOME_OR_DRAW",
              value
                ?.odd,
              bookmakerName,
            );
          } else if (
            [
              "draw/away",
              "x2",
              "draw or away",
            ].includes(
              option,
            )
          ) {
            setBest(
              "AWAY_OR_DRAW",
              value
                ?.odd,
              bookmakerName,
            );
          }
        }

        if (
          betName.includes(
            "goals over/under",
          ) ||
          betName.includes(
            "over/under",
          )
        ) {
          if (
            option.includes(
              "over 1.5",
            )
          ) {
            setBest(
              "OVER_1_5",
              value
                ?.odd,
              bookmakerName,
            );
          } else if (
            option.includes(
              "over 2.5",
            )
          ) {
            setBest(
              "OVER_2_5",
              value
                ?.odd,
              bookmakerName,
            );
          } else if (
            option.includes(
              "under 2.5",
            )
          ) {
            setBest(
              "UNDER_2_5",
              value
                ?.odd,
              bookmakerName,
            );
          }
        }

        if (
          betName.includes(
            "both teams score",
          ) ||
          betName.includes(
            "both teams to score",
          )
        ) {
          if (
            [
              "yes",
              "sim",
            ].includes(
              option,
            )
          ) {
            setBest(
              "BTTS_YES",
              value
                ?.odd,
              bookmakerName,
            );
          } else if (
            [
              "no",
              "nao",
            ].includes(
              option,
            )
          ) {
            setBest(
              "BTTS_NO",
              value
                ?.odd,
              bookmakerName,
            );
          }
        }
      }
    }
  }

  return result;
}

/* ==========================================
   QUALIDADE
========================================== */

function directWinnerShares(
  homeProbability,
  awayProbability,
) {
  const total =
    homeProbability +
    awayProbability;

  if (
    total <=
    0
  ) {
    return {
      home:
        0.5,

      away:
        0.5,
    };
  }

  return {
    home:
      homeProbability /
      total,

    away:
      awayProbability /
      total,
  };
}

function countH2H(
  predictionData,
) {
  return Array.isArray(
    predictionData
      ?.h2h,
  )
    ? predictionData
        .h2h
        .length
    : 0;
}

function dataQuality(
  model,
  predictionData,
  recentForm,
) {
  let score =
    35;

  score +=
    model
      .goals
      .reliability *
    25;

  if (
    model.api1x2
  ) {
    score +=
      10;
  }

  if (
    model
      .comparisonStrength
  ) {
    score +=
      10;
  }

  if (
    countH2H(
      predictionData,
    ) >
    0
  ) {
    score +=
      5;
  }

  const recentCoverage =
    clamp(
      (
        (
          recentForm
            .home
            .matches
            ? 5
            : 0
        ) +
        (
          recentForm
            .away
            .matches
            ? 5
            : 0
        )
      ) /
        10,

      0,

      1,
    );

  score +=
    recentCoverage *
    15;

  return Math.round(
    clamp(
      score,
      0,
      100,
    ),
  );
}

/* ==========================================
   MERCADOS
========================================== */

function marketLabelForFixture(
  key,
  homeTeam,
  awayTeam,
) {
  switch (
    key
  ) {
    case "HOME_WIN":
      return `${homeTeam} vence`;

    case "DRAW":
      return "Empate";

    case "AWAY_WIN":
      return `${awayTeam} vence`;

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
      return (
        MARKET_LABELS[
          key
        ] ||
        key
      );
  }
}

function marketPenalty(
  key,
) {
  const penalties = {
    HOME_WIN:
      0,

    DRAW:
      1,

    AWAY_WIN:
      0,

    HOME_OR_DRAW:
      1.5,

    AWAY_OR_DRAW:
      1.5,

    OVER_1_5:
      1,

    OVER_2_5:
      0,

    UNDER_2_5:
      0,

    BTTS_YES:
      0,

    BTTS_NO:
      0,
  };

  return penalties[
    key
  ] ??
    0;
}

function marketBaseline(
  key,
) {
  const baselines = {
    HOME_WIN:
      0.45,

    DRAW:
      0.30,

    AWAY_WIN:
      0.45,

    HOME_OR_DRAW:
      0.72,

    AWAY_OR_DRAW:
      0.72,

    OVER_1_5:
      0.72,

    OVER_2_5:
      0.55,

    UNDER_2_5:
      0.45,

    BTTS_YES:
      0.55,

    BTTS_NO:
      0.45,
  };

  return baselines[
    key
  ] ??
    0.5;
}

function marketMinimumProbability(
  key,
) {
  const minimums = {
    HOME_WIN:
      0.42,

    DRAW:
      0.25,

    AWAY_WIN:
      0.42,

    HOME_OR_DRAW:
      0.62,

    AWAY_OR_DRAW:
      0.62,

    OVER_1_5:
      0.64,

    OVER_2_5:
      0.48,

    UNDER_2_5:
      0.48,

    BTTS_YES:
      0.48,

    BTTS_NO:
      0.48,
  };

  return minimums[
    key
  ] ??
    0.48;
}

function marketDisagreement({
  key,
  model,
}) {
  if (
    key ===
      "HOME_WIN" ||
    key ===
      "HOME_OR_DRAW"
  ) {
    return model
      .homeDisagreement ??
      0;
  }

  if (
    key ===
      "AWAY_WIN" ||
    key ===
      "AWAY_OR_DRAW"
  ) {
    return model
      .awayDisagreement ??
      0;
  }

  return 0;
}

function marketLearningAdjustment({
  key,
  model,
}) {
  if (
    [
      "HOME_WIN",
      "DRAW",
      "AWAY_WIN",
    ].includes(
      key,
    )
  ) {
    return model
      ?.adjustments
      ?.[key] ??
      0;
  }

  return getLearningAdjustment(
    key,
  );
}

function buildMarketAlternative({
  key,
  probability,
  oddsByMarket,
  homeTeam,
  awayTeam,
  quality,
  model,
}) {
  const safeProbability =
    clamp(
      Number(
        probability,
      ) ||
        0,

      0,

      1,
    );

  const odds =
    oddsByMarket
      ?.[key] ||
    null;

  const impliedProbability =
    odds
      ?.odd
      ? 1 /
        odds.odd
      : null;

  const edge =
    impliedProbability ===
    null
      ? null
      : safeProbability -
        impliedProbability;

  const expectedValue =
    odds
      ?.odd
      ? safeProbability *
          odds.odd -
        1
      : null;

  const disagreement =
    marketDisagreement({
      key,
      model,
    });

  const learningAdjustment =
    marketLearningAdjustment({
      key,
      model,
    });

  const qualityFactor =
    0.84 +
    (
      clamp(
        quality,
        0,
        100,
      ) /
      100
    ) *
      0.16;

  const confidenceProbability =
    clamp(
      safeProbability *
        qualityFactor,

      0,

      1,
    );

  const baseline =
    marketBaseline(
      key,
    );

  const minimumProbability =
    marketMinimumProbability(
      key,
    );

  const strengthAboveBaseline =
    (
      safeProbability -
      baseline
    ) *
    100;

  let score =
    50 +
    strengthAboveBaseline *
      1.25;

  score +=
    (
      clamp(
        quality,
        0,
        100,
      ) -
      70
    ) *
    0.08;

  if (
    expectedValue !==
    null
  ) {
    score +=
      clamp(
        expectedValue *
          55,

        -18,

        28,
      );
  }

  if (
    edge !==
    null
  ) {
    score +=
      clamp(
        edge *
          100 *
          0.35,

        -8,

        12,
      );
  }

  score +=
    clamp(
      learningAdjustment *
        100 *
        0.6,

      -5,

      5,
    );

  score -=
    clamp(
      disagreement *
        100 *
        0.25,

      0,

      10,
    );

  score -=
    marketPenalty(
      key,
    );

  if (
    safeProbability >=
    baseline +
      0.12
  ) {
    score +=
      3;
  }

  if (
    safeProbability >=
    baseline +
      0.20
  ) {
    score +=
      2;
  }

  return {
    key,

    label:
      marketLabelForFixture(
        key,
        homeTeam,
        awayTeam,
      ),

    probability:
      Math.round(
        safeProbability *
          1000,
      ) /
      10,

    confidence:
      Math.round(
        confidenceProbability *
          100,
      ),

    score:
      Math.round(
        score *
          100,
      ) /
      100,

    baselineProbability:
      Math.round(
        baseline *
          1000,
      ) /
      10,

    odd:
      odds
        ?.odd ??
      null,

    bookmaker:
      odds
        ?.bookmaker ??
      null,

    impliedProbability,

    edge,

    expectedValue,

    learningAdjustment,

    disagreement:
      Math.round(
        disagreement *
          1000,
      ) /
      10,

    eligible:
      safeProbability >=
      minimumProbability,

    selected:
      false,
  };
}

function chooseBestMarket({
  probabilities,
  oddsByMarket,
  homeTeam,
  awayTeam,
  quality,
  model,
}) {
  const marketKeys = [
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

  const candidates =
    marketKeys
      .filter(
        (key) =>
          typeof probabilities[
            key
          ] ===
            "number" &&
          Number.isFinite(
            probabilities[
              key
            ],
          ),
      )
      .map(
        (key) =>
          buildMarketAlternative({
            key,

            probability:
              probabilities[
                key
              ],

            oddsByMarket,

            homeTeam,

            awayTeam,

            quality,

            model,
          }),
      );

  const positiveValue =
    candidates.filter(
      (candidate) =>
        candidate
          .eligible &&
        candidate
          .expectedValue !==
          null &&
        candidate
          .expectedValue >=
          0,
    );

  const acceptableValue =
    candidates.filter(
      (candidate) =>
        candidate
          .eligible &&
        candidate
          .expectedValue !==
          null &&
        candidate
          .expectedValue >=
          -0.03,
    );

  const eligible =
    candidates.filter(
      (candidate) =>
        candidate
          .eligible,
    );

  const pool =
    positiveValue
      .length
      ? positiveValue
      : acceptableValue
          .length
        ? acceptableValue
        : eligible
            .length
          ? eligible
          : candidates;

  const ranked =
    [
      ...pool,
    ].sort(
      (
        a,
        b,
      ) => {
        if (
          b.score !==
          a.score
        ) {
          return (
            b.score -
            a.score
          );
        }

        return (
          b.probability -
          a.probability
        );
      },
    );

  const best =
    ranked[
      0
    ] ||
    null;

  const alternatives =
    candidates
      .map(
        (candidate) => ({
          ...candidate,

          selected:
            candidate.key ===
            best
              ?.key,
        }),
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.score -
          a.score,
      );

  return {
    best,
    alternatives,
  };
}

function buildRecentMiniHistory(
  homeTeam,
  awayTeam,
  recentForm,
) {
  const describe =
    (
      team,
      item,
    ) => {
      if (
        !item
          ?.matches
      ) {
        return `${team}: sem resumo dos últimos 5`;
      }

      const form =
        item.form ===
        null
          ? "—"
          : `${Math.round(
              item.form *
                100,
            )}% forma`;

      const gf =
        item.avgGoalsFor ===
        null
          ? "—"
          : item.avgGoalsFor.toFixed(
              1,
            );

      const ga =
        item.avgGoalsAgainst ===
        null
          ? "—"
          : item.avgGoalsAgainst.toFixed(
              1,
            );

      return `${team}: ${form}, ${gf} GM/j, ${ga} GS/j`;
    };

  return (
    `${describe(
      homeTeam,
      recentForm.home,
    )} • ` +
    `${describe(
      awayTeam,
      recentForm.away,
    )}`
  );
}

/* ==========================================
   ANÁLISE FINAL
========================================== */

export function analyseFootballFixture({
  fixture,
  predictionData,
  oddsData = null,
}) {
  const homeTeam =
    fixture
      ?.teams
      ?.home
      ?.name ||
    "Equipa da casa";

  const awayTeam =
    fixture
      ?.teams
      ?.away
      ?.name ||
    "Equipa visitante";

  if (
    !predictionData
  ) {
    return {
      action:
        "SKIP",

      pick:
        null,

      pickKey:
        null,

      confidence:
        0,

      odd:
        null,

      bookmaker:
        null,

      impliedProbability:
        null,

      edge:
        null,

      expectedValue:
        null,

      alternatives:
        [],

      expectedGoals:
        null,

      providerPrediction:
        null,

      recentForm:
        null,

      miniHistory:
        "Sem dados suficientes para analisar os últimos 5 jogos.",

      sample: {
        dataSource:
          "API-Football + NeuroWin V4 + last_5 + odds + learning",

        hasComparison:
          false,

        hasH2H:
          false,

        h2hMatches:
          0,

        recentHomeMatches:
          0,

        recentAwayMatches:
          0,

        recentMatchesUsed:
          0,

        goalModelReliability:
          0,

        dataQuality:
          0,

        oddsAvailable:
          Boolean(
            oddsData,
          ),

        requireOdds:
          String(
            process.env
              .SPORTS_REQUIRE_ODDS ??
              "0",
          ) !== "0",

        selectionMode:
          "BEST_MARKET",

        marketsAnalysed:
          0,
      },

      marketProbabilities:
        {},

      oddsByMarket:
        {},

      winnerComparison:
        null,

      reasons: [
        "SEM APOSTA: não existem dados suficientes para analisar os mercados.",
      ],
    };
  }

  const recentForm =
    buildRecentForm(
      predictionData,
    );

  const model =
    buildModelProbabilities(
      predictionData,
      recentForm,
    );

  const probabilities =
    model
      .marketProbabilities;

  const oddsByMarket =
    extractOdds(
      oddsData,
    );

  const provider =
    predictionData
      ?.predictions ||
    {};

  const providerGoals =
    providerGoalSignal(
      predictionData,
    );

  const quality =
    dataQuality(
      model,
      predictionData,
      recentForm,
    );

  const marketSelection =
    chooseBestMarket({
      probabilities,

      oddsByMarket,

      homeTeam,

      awayTeam,

      quality,

      model,
    });

  const selectedMarket =
    marketSelection.best;

  const selectedKey =
    selectedMarket
      ?.key ??
    null;

  const selectedLabel =
    selectedMarket
      ?.label ??
    null;

  const selectedActualProbability =
    selectedKey
      ? probabilities[
          selectedKey
        ] ??
        0
      : 0;

  const selectedConfidence =
    selectedMarket
      ?.confidence ??
    Math.round(
      selectedActualProbability *
        100,
    );

  const alternatives =
    marketSelection
      .alternatives;

  const winnerShare =
    directWinnerShares(
      probabilities
        .HOME_WIN,

      probabilities
        .AWAY_WIN,
    );

  const h2hMatches =
    countH2H(
      predictionData,
    );

  const recentMatchesUsed =
    recentForm
      .home
      .matches +
    recentForm
      .away
      .matches;

  const reasons =
    [];

  if (
    recentForm
      .home
      .matches
  ) {
    reasons.push(
      `Últimos 5 de ${homeTeam}: forma ${Math.round(
        (
          recentForm
            .home
            .form ??
          0
        ) *
          100,
      )}%, ` +
        `${(
          recentForm
            .home
            .avgGoalsFor ??
          0
        ).toFixed(
          2,
        )} golos marcados e ` +
        `${(
          recentForm
            .home
            .avgGoalsAgainst ??
          0
        ).toFixed(
          2,
        )} sofridos por jogo.`,
    );
  }

  if (
    recentForm
      .away
      .matches
  ) {
    reasons.push(
      `Últimos 5 de ${awayTeam}: forma ${Math.round(
        (
          recentForm
            .away
            .form ??
          0
        ) *
          100,
      )}%, ` +
        `${(
          recentForm
            .away
            .avgGoalsFor ??
          0
        ).toFixed(
          2,
        )} golos marcados e ` +
        `${(
          recentForm
            .away
            .avgGoalsAgainst ??
          0
        ).toFixed(
          2,
        )} sofridos por jogo.`,
    );
  }

  if (
    provider
      ?.advice
  ) {
    reasons.push(
      `Análise estatística da fonte: ${provider.advice}`,
    );
  }

  reasons.push(
    `Modelo NeuroWin 1X2: ${homeTeam} ${Math.round(
      probabilities
        .HOME_WIN *
        100,
    )}%, empate ${Math.round(
      probabilities
        .DRAW *
        100,
    )}%, ${awayTeam} ${Math.round(
      probabilities
        .AWAY_WIN *
        100,
    )}%.`,
  );

  reasons.push(
    `Modelo de golos: ${homeTeam} ${model.goals.home.toFixed(
      2,
    )} — ${model.goals.away.toFixed(
      2,
    )} ${awayTeam}.`,
  );

  if (
    h2hMatches >
    0
  ) {
    reasons.push(
      `H2H usado com peso reduzido: ${h2hMatches} jogos.`,
    );
  }

  if (
    providerGoals
      .home ||
    providerGoals
      .away ||
    providerGoals
      .underOver
  ) {
    const parts =
      [];

    if (
      providerGoals
        .home
    ) {
      parts.push(
        `casa ${providerGoals.home}`,
      );
    }

    if (
      providerGoals
        .away
    ) {
      parts.push(
        `visitante ${providerGoals.away}`,
      );
    }

    if (
      providerGoals
        .underOver
    ) {
      parts.push(
        `total ${providerGoals.underOver}`,
      );
    }

    reasons.push(
      `Sinais de golos da fonte: ${parts.join(
        ", ",
      )}.`,
    );
  }

  if (
    selectedMarket
  ) {
    reasons.push(
      `Melhor mercado: ${selectedMarket.label}. ` +
        `Probabilidade ${selectedMarket.probability.toFixed(
          1,
        )}% e confiança ${selectedMarket.confidence}%.`,
    );

    if (
      selectedMarket
        .odd
    ) {
      const valueText =
        selectedMarket
          .expectedValue ===
        null
          ? ""
          : ` EV ${(
              selectedMarket.expectedValue *
              100
            ).toFixed(
              1,
            )}%.`;

      const edgeText =
        selectedMarket
          .edge ===
        null
          ? ""
          : ` Edge ${(
              selectedMarket.edge *
              100
            ).toFixed(
              1,
            )} p.p.`;

      reasons.push(
        `Odd ${selectedMarket.odd.toFixed(
          2,
        )}${
          selectedMarket
            .bookmaker
            ? ` em ${selectedMarket.bookmaker}`
            : ""
        }.${valueText}${edgeText}`,
      );
    } else {
      reasons.push(
        "Sem odd utilizável; a seleção foi feita pela força estatística, últimos 5, qualidade dos dados, aprendizagem e consistência do modelo.",
      );
    }
  }

  return {
    action:
      selectedMarket
        ? "BET"
        : "SKIP",

    pick:
      selectedLabel,

    pickKey:
      selectedKey,

    confidence:
      selectedConfidence,

    odd:
      selectedMarket
        ?.odd ??
      null,

    bookmaker:
      selectedMarket
        ?.bookmaker ??
      null,

    impliedProbability:
      selectedMarket
        ?.impliedProbability ??
      null,

    edge:
      selectedMarket
        ?.edge ??
      null,

    expectedValue:
      selectedMarket
        ?.expectedValue ??
      null,

    alternatives,

    recentForm,

    miniHistory:
      buildRecentMiniHistory(
        homeTeam,
        awayTeam,
        recentForm,
      ),

    expectedGoals: {
      home:
        Math.round(
          model
            .goals
            .home *
            100,
        ) /
        100,

      away:
        Math.round(
          model
            .goals
            .away *
            100,
        ) /
        100,

      total:
        Math.round(
          (
            model
              .goals
              .home +
            model
              .goals
              .away
          ) *
            100,
        ) /
        100,
    },

    providerPrediction: {
      winner:
        provider
          ?.winner
          ?.name ??
        null,

      winnerComment:
        provider
          ?.winner
          ?.comment ??
        null,

      winOrDraw:
        provider
          ?.win_or_draw ??
        null,

      underOver:
        provider
          ?.under_over ??
        null,

      goalsHome:
        provider
          ?.goals
          ?.home ??
        null,

      goalsAway:
        provider
          ?.goals
          ?.away ??
        null,

      advice:
        provider
          ?.advice ??
        null,
    },

    sample: {
      dataSource:
        "API-Football + NeuroWin V4 + last_5 + odds + learning",

      hasComparison:
        Boolean(
          predictionData
            ?.comparison,
        ),

      hasH2H:
        h2hMatches >
        0,

      h2hMatches,

      recentHomeMatches:
        recentForm
          .home
          .matches,

      recentAwayMatches:
        recentForm
          .away
          .matches,

      recentMatchesUsed,

      goalModelReliability:
        Math.round(
          model
            .goals
            .reliability *
            100,
        ),

      dataQuality:
        quality,

      oddsAvailable:
        Boolean(
          oddsData,
        ),

      requireOdds:
        String(
          process.env
            .SPORTS_REQUIRE_ODDS ??
            "0",
        ) !== "0",

      selectionMode:
        "BEST_MARKET",

      marketsAnalysed:
        alternatives
          .length,

      selectedMarketScore:
        selectedMarket
          ?.score ??
        null,
    },

    marketProbabilities:
      probabilities,

    oddsByMarket,

    winnerComparison: {
      homeTeam,

      awayTeam,

      home:
        Math.round(
          winnerShare
            .home *
            1000,
        ) /
        10,

      away:
        Math.round(
          winnerShare
            .away *
            1000,
        ) /
        10,

      drawExcludedFromSelection:
        false,

      homeActualWinProbability:
        Math.round(
          probabilities
            .HOME_WIN *
            1000,
        ) /
        10,

      drawProbability:
        Math.round(
          probabilities
            .DRAW *
            1000,
        ) /
        10,

      awayActualWinProbability:
        Math.round(
          probabilities
            .AWAY_WIN *
            1000,
        ) /
        10,
    },

    reasons,
  };
}