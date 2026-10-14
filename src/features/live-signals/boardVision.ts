export type NormalizedRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MarkerKind =
  | "RED"
  | "BLUE"
  | "YELLOW";

type Marker = {
  kind: MarkerKind;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
};

export type BacBoVisionResult = {
  history: Array<
    "PLAYER" |
    "BANKER" |
    "TIE"
  >;

  signature: string;
  quality: number;
  markerCount: number;
};

export type FootballVisionResult = {
  history: Array<
    "HOME" |
    "AWAY" |
    "TIE"
  >;

  signature: string;
  quality: number;
  markerCount: number;
};

function classifyPixel(
  r: number,
  g: number,
  b: number,
): MarkerKind | null {
  // Vermelho / Banker
  if (
    r >= 135 &&
    r > g * 1.22 &&
    r > b * 1.12
  ) {
    return "RED";
  }

  // Azul / Player
  if (
    b >= 125 &&
    b > r * 1.14 &&
    (
      b >= g * 0.82 ||
      g > r * 1.12
    )
  ) {
    return "BLUE";
  }

  // Amarelo / Tie
  if (
    r >= 145 &&
    g >= 105 &&
    b <= 145 &&
    r > b * 1.16 &&
    g > b * 1.08
  ) {
    return "YELLOW";
  }

  return null;
}

function connectedMarkers(
  image: ImageData,
): Marker[] {
  const step =
    Math.max(
      1,
      Math.floor(
        Math.max(
          image.width,
          image.height,
        ) / 360,
      ),
    );

  const width =
    Math.ceil(
      image.width /
        step,
    );

  const height =
    Math.ceil(
      image.height /
        step,
    );

  const labels =
    new Int8Array(
      width *
        height,
    );

  for (
    let y = 0;
    y < height;
    y += 1
  ) {
    for (
      let x = 0;
      x < width;
      x += 1
    ) {
      const sx =
        Math.min(
          image.width - 1,
          x * step,
        );

      const sy =
        Math.min(
          image.height - 1,
          y * step,
        );

      const index =
        (
          sy *
            image.width +
          sx
        ) * 4;

      const kind =
        classifyPixel(
          image.data[
            index
          ],

          image.data[
            index + 1
          ],

          image.data[
            index + 2
          ],
        );

      labels[
        y *
          width +
        x
      ] =
        kind === "RED"
          ? 1
          : kind === "BLUE"
            ? 2
            : kind ===
                "YELLOW"
              ? 3
              : 0;
    }
  }

  const seen =
    new Uint8Array(
      labels.length,
    );

  const markers: Marker[] =
    [];

  const stack: number[] =
    [];

  for (
    let index = 0;
    index <
    labels.length;
    index += 1
  ) {
    const label =
      labels[index];

    if (
      !label ||
      seen[index]
    ) {
      continue;
    }

    let minX =
      width;

    let minY =
      height;

    let maxX =
      -1;

    let maxY =
      -1;

    let area =
      0;

    seen[index] =
      1;

    stack.push(
      index,
    );

    while (
      stack.length
    ) {
      const current =
        stack.pop()!;

      const cx =
        current %
        width;

      const cy =
        Math.floor(
          current /
            width,
        );

      minX =
        Math.min(
          minX,
          cx,
        );

      minY =
        Math.min(
          minY,
          cy,
        );

      maxX =
        Math.max(
          maxX,
          cx,
        );

      maxY =
        Math.max(
          maxY,
          cy,
        );

      area += 1;

      for (
        let dy = -1;
        dy <= 1;
        dy += 1
      ) {
        for (
          let dx = -1;
          dx <= 1;
          dx += 1
        ) {
          if (
            !dx &&
            !dy
          ) {
            continue;
          }

          const nx =
            cx + dx;

          const ny =
            cy + dy;

          if (
            nx < 0 ||
            ny < 0 ||
            nx >= width ||
            ny >= height
          ) {
            continue;
          }

          const next =
            ny *
              width +
            nx;

          if (
            !seen[next] &&
            labels[next] ===
              label
          ) {
            seen[next] =
              1;

            stack.push(
              next,
            );
          }
        }
      }
    }

    const boxWidth =
      maxX -
      minX +
      1;

    const boxHeight =
      maxY -
      minY +
      1;

    const roiArea =
      width *
      height;

    const minArea =
      Math.max(
        3,
        roiArea *
          0.00012,
      );

    const maxArea =
      roiArea *
      0.09;

    if (
      area < minArea ||
      area > maxArea ||
      boxWidth >
        width * 0.35 ||
      boxHeight >
        height * 0.55 ||
      boxWidth < 2 ||
      boxHeight < 2
    ) {
      continue;
    }

    const kind:
      MarkerKind =
      label === 1
        ? "RED"
        : label === 2
          ? "BLUE"
          : "YELLOW";

    markers.push({
      kind,

      x:
        (
          (
            minX +
            maxX
          ) /
          2
        ) *
        step,

      y:
        (
          (
            minY +
            maxY
          ) /
          2
        ) *
        step,

      width:
        boxWidth *
        step,

      height:
        boxHeight *
        step,

      area:
        area *
        step *
        step,
    });
  }

  return markers;
}

function median(
  values: number[],
) {
  if (!values.length) {
    return 0;
  }

  const sorted =
    [...values].sort(
      (a, b) =>
        a - b,
    );

  return sorted[
    Math.floor(
      sorted.length /
        2,
    )
  ];
}

function percentile(
  values: number[],
  ratio: number,
) {
  if (!values.length) {
    return 0;
  }

  const sorted =
    [...values].sort(
      (a, b) =>
        a - b,
    );

  const index =
    Math.min(
      sorted.length -
        1,

      Math.max(
        0,

        Math.floor(
          (
            sorted.length -
            1
          ) *
            ratio,
        ),
      ),
    );

  return sorted[
    index
  ];
}

function filterRoadMarkers(
  markers: Marker[],
  image: ImageData,
) {
  const primary =
    markers.filter(
      (marker) =>
        marker.kind !==
        "YELLOW",
    );

  if (
    !primary.length
  ) {
    return markers;
  }

  const typical =
    median(
      primary.map(
        (marker) =>
          Math.max(
            marker.width,
            marker.height,
          ),
      ),
    );

  const minSize =
    Math.max(
      3,
      typical *
        0.42,
    );

  const maxSize =
    Math.max(
      minSize + 1,
      typical *
        2.4,
    );

  return markers.filter(
    (marker) => {
      const size =
        Math.max(
          marker.width,
          marker.height,
        );

      if (
        marker.kind ===
        "YELLOW"
      ) {
        return (
          size >=
            Math.max(
              2,
              minSize *
                0.35,
            ) &&
          size <=
            maxSize *
              1.3
        );
      }

      return (
        size >=
          minSize &&
        size <=
          maxSize
      );
    },
  );
}

function roadOrder(
  markers: Marker[],
) {
  return [
    ...markers,
  ].sort(
    (a, b) => {
      const dx =
        a.x -
        b.x;

      if (
        Math.abs(dx) >
        Math.max(
          a.width,
          b.width,
        ) *
          0.45
      ) {
        return dx;
      }

      return (
        a.y -
        b.y
      );
    },
  );
}

function signature(
  markers: Marker[],
) {
  return markers
    .map(
      (marker) =>
        `${marker.kind[0]}:${Math.round(marker.x / 5)}:${Math.round(marker.y / 5)}`,
    )
    .join("|");
}

export function detectBacBoRoad(
  image: ImageData,
): BacBoVisionResult {
  const connected =
    connectedMarkers(
      image,
    );

  /*
   * O Bac Bo apresenta também roads
   * pequenos/derivados na metade inferior.
   *
   * Só usamos a zona superior como
   * histórico principal.
   */
  const upper =
    connected.filter(
      (marker) =>
        marker.y <=
        image.height *
          0.62,
    );

  const sideCandidates =
    upper.filter(
      (marker) =>
        marker.kind ===
          "RED" ||
        marker.kind ===
          "BLUE",
    );

  if (
    !sideCandidates.length
  ) {
    return {
      history: [],
      signature: "",
      quality: 0,
      markerCount: 0,
    };
  }

  /*
   * Os círculos principais são maiores
   * do que os pequenos roads inferiores.
   */
  const referenceSize =
    percentile(
      sideCandidates.map(
        (marker) =>
          Math.max(
            marker.width,
            marker.height,
          ),
      ),

      0.75,
    );

  const minPrimarySize =
    Math.max(
      3,
      referenceSize *
        0.52,
    );

  const maxPrimarySize =
    Math.max(
      minPrimarySize +
        1,

      referenceSize *
        1.75,
    );

  const base =
    roadOrder(
      sideCandidates.filter(
        (marker) => {
          const size =
            Math.max(
              marker.width,
              marker.height,
            );

          const minSide =
            Math.max(
              1,

              Math.min(
                marker.width,
                marker.height,
              ),
            );

          const aspect =
            size /
            minSide;

          return (
            size >=
              minPrimarySize &&
            size <=
              maxPrimarySize &&
            aspect <=
              2.2
          );
        },
      ),
    );

  if (
    !base.length
  ) {
    return {
      history: [],
      signature: "",
      quality: 0,
      markerCount: 0,
    };
  }

  /*
   * IMPORTANTE:
   *
   * Amarelos soltos deixam de ser considerados
   * EMPATE.
   *
   * Só é aceite um amarelo se estiver realmente
   * junto de um círculo do road principal.
   */
  const yellow =
    upper.filter(
      (marker) => {
        if (
          marker.kind !==
          "YELLOW"
        ) {
          return false;
        }

        const size =
          Math.max(
            marker.width,
            marker.height,
          );

        return (
          size >=
            referenceSize *
              0.12 &&
          size <=
            referenceSize *
              1.05
        );
      },
    );

  const history: Array<
    "PLAYER" |
    "BANKER" |
    "TIE"
  > = [];

  const usedYellow =
    new Set<number>();

  const stableMarkers:
    Marker[] =
    [...base];

  for (
    const marker of base
  ) {
    history.push(
      marker.kind ===
        "BLUE"
        ? "PLAYER"
        : "BANKER",
    );

    const markerSize =
      Math.max(
        marker.width,
        marker.height,
      );

    let attachedTieIndex =
      -1;

    let attachedDistance =
      Number.POSITIVE_INFINITY;

    yellow.forEach(
      (
        tie,
        index,
      ) => {
        if (
          usedYellow.has(
            index,
          )
        ) {
          return;
        }

        const distance =
          Math.hypot(
            tie.x -
              marker.x,

            tie.y -
              marker.y,
          );

        if (
          distance <=
            markerSize *
              0.72 &&
          distance <
            attachedDistance
        ) {
          attachedTieIndex =
            index;

          attachedDistance =
            distance;
        }
      },
    );

    /*
     * Apenas um amarelo verdadeiramente
     * associado ao road principal é aceite
     * como EMPATE.
     */
    if (
      attachedTieIndex >=
      0
    ) {
      usedYellow.add(
        attachedTieIndex,
      );

      stableMarkers.push(
        yellow[
          attachedTieIndex
        ],
      );

      history.push(
        "TIE",
      );
    }
  }

  const markerCount =
    base.length;

  const quality =
    Math.min(
      100,

      Math.round(
        (
          markerCount /
          18
        ) *
          100,
      ),
    );

  /*
   * A assinatura usa a sequência reconhecida.
   *
   * Pequenas mudanças de compressão do vídeo
   * deixam assim de parecer novas rondas.
   */
  const stableSignature =
    history.length
      ? history
          .map(
            (value) =>
              value[0],
          )
          .join("")
      : signature(
          stableMarkers,
        );

  return {
    history:
      history.slice(
        -120,
      ),

    signature:
      stableSignature,

    quality,

    markerCount,
  };
}

export function detectFootballRoad(
  image: ImageData,
): FootballVisionResult {
  const all =
    filterRoadMarkers(
      connectedMarkers(
        image,
      ),
      image,
    );

  const ordered =
    roadOrder(
      all.filter(
        (marker) =>
          marker.kind !==
          "YELLOW",
      ),
    );

  const yellow =
    all.filter(
      (marker) =>
        marker.kind ===
        "YELLOW",
    );

  const history: Array<
    "HOME" |
    "AWAY" |
    "TIE"
  > =
    ordered.map(
      (marker) =>
        marker.kind ===
          "RED"
          ? "HOME"
          : "AWAY",
    );

  for (
    const tie of yellow
  ) {
    history.push(
      "TIE",
    );
  }

  const stableMarkers =
    [
      ...ordered,
      ...yellow,
    ];

  const markerCount =
    stableMarkers.length;

  const quality =
    Math.min(
      100,

      Math.round(
        (
          markerCount /
          14
        ) *
          100,
      ),
    );

  return {
    history:
      history.slice(
        -120,
      ),

    signature:
      signature(
        roadOrder(
          stableMarkers,
        ),
      ),

    quality,

    markerCount,
  };
}

export function cropRegion(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  region: NormalizedRegion,
) {
  const left =
    Math.max(
      0,
      Math.round(
        region.x *
          canvasWidth,
      ),
    );

  const top =
    Math.max(
      0,
      Math.round(
        region.y *
          canvasHeight,
      ),
    );

  const width =
    Math.min(
      canvasWidth -
        left,

      Math.max(
        8,

        Math.round(
          region.width *
            canvasWidth,
        ),
      ),
    );

  const height =
    Math.min(
      canvasHeight -
        top,

      Math.max(
        8,

        Math.round(
          region.height *
            canvasHeight,
        ),
      ),
    );

  if (
    width < 8 ||
    height < 8
  ) {
    return null;
  }

  return ctx.getImageData(
    left,
    top,
    width,
    height,
  );
}