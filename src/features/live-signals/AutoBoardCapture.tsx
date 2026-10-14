import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  cropRegion,
  detectBacBoRoad,
  detectFootballRoad,
  type NormalizedRegion,
} from "./boardVision";

export type BoardCaptureMode =
  | "BAC_BO"
  | "FOOTBALL_STUDIO";

type Snapshot = {
  values: string[];
  signature: string;
  quality: number;
  markerCount: number;
};

type Props = {
  mode: BoardCaptureMode;
  title: string;
  defaultUrl: string;
  windowSeconds: number;

  onSnapshot: (
    snapshot: Snapshot,
  ) => void;

  hideGamePreview?: boolean;
};

const DEFAULT_REGIONS: Record<
  BoardCaptureMode,
  NormalizedRegion
> = {
  BAC_BO: {
    x: 0.645,
    y: 0.70,
    width: 0.25,
    height: 0.16,
  },

  FOOTBALL_STUDIO: {
    x: 0.675,
    y: 0.70,
    width: 0.305,
    height: 0.20,
  },
};

function storagePrefix(
  mode: BoardCaptureMode,
) {
  return `neurowin-${mode
    .toLowerCase()
    .replace(
      /_/g,
      "-",
    )}-link-v1`;
}

function loadRegion(
  mode: BoardCaptureMode,
): NormalizedRegion {
  try {
    const raw =
      localStorage.getItem(
        `${storagePrefix(
          mode,
        )}-region`,
      );

    if (!raw) {
      return DEFAULT_REGIONS[mode];
    }

    const parsed =
      JSON.parse(
        raw,
      ) as NormalizedRegion;

    if (
      [
        parsed.x,
        parsed.y,
        parsed.width,
        parsed.height,
      ].every(Number.isFinite) &&
      parsed.width > 0.02 &&
      parsed.height > 0.02
    ) {
      return parsed;
    }
  } catch {
    // Usa a região padrão.
  }

  return DEFAULT_REGIONS[mode];
}

export default function AutoBoardCapture({
  mode,
  title,
  defaultUrl,
  windowSeconds,
  onSnapshot,
  hideGamePreview = false,
}: Props) {
  const prefix =
    storagePrefix(mode);

  const videoRef =
    useRef<HTMLVideoElement | null>(
      null,
    );

  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  const streamRef =
    useRef<MediaStream | null>(
      null,
    );

  const onSnapshotRef =
    useRef(onSnapshot);

  const selectionStartRef =
    useRef<{
      x: number;
      y: number;
    } | null>(null);

  const [url, setUrl] =
    useState(
      () =>
        localStorage.getItem(
          `${prefix}-url`,
        ) || defaultUrl,
    );

  const [active, setActive] =
    useState(false);

  const [status, setStatus] =
    useState("Não ligado");

  const [region, setRegion] =
    useState<NormalizedRegion>(
      () => loadRegion(mode),
    );

  const [
    draftRegion,
    setDraftRegion,
  ] =
    useState<NormalizedRegion | null>(
      null,
    );

  const [
    calibrating,
    setCalibrating,
  ] =
    useState(false);

  const [
    previewOpen,
    setPreviewOpen,
  ] =
    useState(false);

  const [
    recognized,
    setRecognized,
  ] =
    useState(0);

  const [
    quality,
    setQuality,
  ] =
    useState(0);

  const [
    lastValues,
    setLastValues,
  ] =
    useState<string[]>([]);

  const stableRef =
    useRef({
      signature: "",
      frames: 0,
      emitted: "",
    });

  useEffect(() => {
    onSnapshotRef.current =
      onSnapshot;
  }, [onSnapshot]);

  function saveUrl(
    value: string,
  ) {
    setUrl(value);

    localStorage.setItem(
      `${prefix}-url`,
      value,
    );
  }

  function openGame() {
    if (!url.trim()) {
      return;
    }

    localStorage.setItem(
      `${prefix}-url`,
      url.trim(),
    );

    window.open(
      url.trim(),
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function connect() {
    try {
      localStorage.setItem(
        `${prefix}-url`,
        url.trim(),
      );

      const stream =
        await navigator.mediaDevices.getDisplayMedia(
          {
            video: {
              frameRate: {
                ideal: 12,
                max: 20,
              },
            },

            audio: false,
          },
        );

      streamRef.current =
        stream;

      const video =
        videoRef.current;

      if (!video) {
        return;
      }

      video.srcObject =
        stream;

      await video.play();

      setActive(true);

      // Continua a capturar o Bac Bo,
      // mas não mostra o jogo na NeuroWin.
      setPreviewOpen(
        !hideGamePreview,
      );

      setStatus(
        "Ligado — a ler o histórico",
      );

      stream
        .getVideoTracks()[0]
        ?.addEventListener(
          "ended",
          () => {
            setActive(false);
            setPreviewOpen(false);

            setStatus(
              "Ligação terminada",
            );
          },
        );
    } catch (error) {
      console.error(error);

      setStatus(
        "Não foi possível ligar. Seleciona o separador do jogo quando o navegador pedir.",
      );
    }
  }

  function disconnect() {
    streamRef.current
      ?.getTracks()
      .forEach((track) =>
        track.stop(),
      );

    streamRef.current =
      null;

    setActive(false);

    setPreviewOpen(false);

    setStatus(
      "Não ligado",
    );
  }

  function beginCalibration() {
    if (!active) {
      return;
    }

    setCalibrating(true);

    // Durante a calibração mostramos temporariamente
    // a imagem para poderes selecionar o histórico.
    setPreviewOpen(true);

    setDraftRegion(null);

    selectionStartRef.current =
      null;

    setStatus(
      "Calibração — seleciona apenas o quadro branco do histórico",
    );
  }

  function pointFromEvent(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const rect =
      event.currentTarget.getBoundingClientRect();

    return {
      x: Math.max(
        0,
        Math.min(
          1,
          (event.clientX -
            rect.left) /
            rect.width,
        ),
      ),

      y: Math.max(
        0,
        Math.min(
          1,
          (event.clientY -
            rect.top) /
            rect.height,
        ),
      ),
    };
  }

  function onPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!calibrating) {
      return;
    }

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );

    const point =
      pointFromEvent(event);

    selectionStartRef.current =
      point;

    setDraftRegion({
      x: point.x,
      y: point.y,
      width: 0.001,
      height: 0.001,
    });
  }

  function onPointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (
      !calibrating ||
      !selectionStartRef.current
    ) {
      return;
    }

    const start =
      selectionStartRef.current;

    const end =
      pointFromEvent(event);

    setDraftRegion({
      x: Math.min(
        start.x,
        end.x,
      ),

      y: Math.min(
        start.y,
        end.y,
      ),

      width: Math.abs(
        end.x -
          start.x,
      ),

      height: Math.abs(
        end.y -
          start.y,
      ),
    });
  }

  function onPointerUp(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (
      !calibrating ||
      !selectionStartRef.current
    ) {
      return;
    }

    const start =
      selectionStartRef.current;

    const end =
      pointFromEvent(event);

    selectionStartRef.current =
      null;

    const next = {
      x: Math.min(
        start.x,
        end.x,
      ),

      y: Math.min(
        start.y,
        end.y,
      ),

      width: Math.abs(
        end.x -
          start.x,
      ),

      height: Math.abs(
        end.y -
          start.y,
      ),
    };

    if (
      next.width < 0.03 ||
      next.height < 0.03
    ) {
      setDraftRegion(null);

      setStatus(
        "Zona demasiado pequena. Seleciona novamente o quadro do histórico.",
      );

      return;
    }

    setRegion(next);

    localStorage.setItem(
      `${prefix}-region`,
      JSON.stringify(next),
    );

    setDraftRegion(null);

    setCalibrating(false);

    stableRef.current = {
      signature: "",
      frames: 0,
      emitted: "",
    };

    setStatus(
      "Calibração guardada — a analisar o histórico",
    );

    // Depois da calibração voltamos
    // a esconder o jogo.
    if (hideGamePreview) {
      setPreviewOpen(false);
    }
  }

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer =
      window.setInterval(() => {
        const video =
          videoRef.current;

        const canvas =
          canvasRef.current;

        if (
          !video ||
          !canvas ||
          !video.videoWidth ||
          !video.videoHeight
        ) {
          return;
        }

        canvas.width =
          video.videoWidth;

        canvas.height =
          video.videoHeight;

        const ctx =
          canvas.getContext(
            "2d",
            {
              willReadFrequently:
                true,
            },
          );

        if (!ctx) {
          return;
        }

        ctx.drawImage(
          video,
          0,
          0,
          canvas.width,
          canvas.height,
        );

        const crop =
          cropRegion(
            ctx,
            canvas.width,
            canvas.height,
            region,
          );

        if (!crop) {
          return;
        }

        const result =
          mode === "BAC_BO"
            ? detectBacBoRoad(
                crop,
              )
            : detectFootballRoad(
                crop,
              );

        setRecognized(
          result.history.length,
        );

        setQuality(
          result.quality,
        );

        setLastValues(
          result.history.slice(
            -12,
          ),
        );

        if (
          !result.signature ||
          result.history.length < 3 ||
          result.quality < 20
        ) {
          stableRef.current.frames =
            0;

          setStatus(
            "Ligado — leitura insuficiente; calibra a zona do histórico se necessário",
          );

          return;
        }

        const stable =
          stableRef.current;

        if (
          stable.signature ===
          result.signature
        ) {
          stable.frames += 1;
        } else {
          stable.signature =
            result.signature;

          stable.frames = 1;
        }

        // Exigimos 4 leituras iguais seguidas
        // para reduzir falsos resultados.
        if (
          stable.frames >= 4 &&
          stable.emitted !==
            result.signature
        ) {
          stable.emitted =
            result.signature;

          onSnapshotRef.current({
            values:
              result.history,

            signature:
              result.signature,

            quality:
              result.quality,

            markerCount:
              result.markerCount,
          });

          setStatus(
            `Sincronizado — ${result.history.length} resultados reconhecidos`,
          );
        }
      }, 180);

    return () =>
      window.clearInterval(
        timer,
      );
  }, [
    active,
    mode,
    region,
  ]);

  const shownRegion =
    draftRegion ?? region;

  return (
    <section className="auto-link-card premium-card">
      <div className="auto-link-head">
        <div>
          <span className="eyebrow">
            LIGAÇÃO AO JOGO
          </span>

          <h2>
            {title}
          </h2>

          <p>
            Cola o link atual,
            abre o jogo e liga a
            App NeuroWin ao
            separador. A leitura
            decorre em segundo
            plano.
          </p>
        </div>

        <span
          className={
            active
              ? "auto-status-pill is-on"
              : "auto-status-pill"
          }
        >
          <i />

          {active
            ? "LIGADO"
            : "DESLIGADO"}
        </span>
      </div>

      <div className="auto-link-row">
        <input
          value={url}
          onChange={(event) =>
            saveUrl(
              event.target.value,
            )
          }
          placeholder="https://..."
          aria-label="Link atual do jogo"
        />

        <button
          type="button"
          className="live-secondary-button"
          onClick={openGame}
        >
          Abrir jogo
        </button>

        {!active ? (
          <button
            type="button"
            className="live-primary-button"
            onClick={connect}
          >
            LIGAR AO JOGO
          </button>
        ) : (
          <button
            type="button"
            className="live-secondary-button"
            onClick={disconnect}
          >
            Desligar
          </button>
        )}
      </div>

      <div className="auto-live-summary">
        <div>
          <span>
            Estado
          </span>

          <strong>
            {status}
          </strong>
        </div>

        <div>
          <span>
            Histórico reconhecido
          </span>

          <strong>
            {recognized}
          </strong>
        </div>

        <div>
          <span>
            Qualidade de leitura
          </span>

          <strong>
            {quality}%
          </strong>
        </div>

        <div>
          <span>
            Janela de aposta
          </span>

          <strong>
            {windowSeconds} s
          </strong>
        </div>
      </div>

      {active && (
        <div className="auto-capture-actions">
          <button
            type="button"
            className="live-secondary-button"
            onClick={
              beginCalibration
            }
          >
            {calibrating
              ? "Seleciona a zona…"
              : "Calibrar histórico"}
          </button>

          {!hideGamePreview && (
            <button
              type="button"
              className="live-ghost-button"
              onClick={() =>
                setPreviewOpen(
                  (value) =>
                    !value,
                )
              }
            >
              {previewOpen
                ? "Ocultar pré-visualização"
                : "Mostrar pré-visualização"}
            </button>
          )}
        </div>
      )}

      {/* 
        O vídeo continua montado porque é usado
        pela captura, mas fica escondido
        quando hideGamePreview=true.
      */}
      <div
        className={`auto-video-wrap ${
          calibrating
            ? "is-calibrating"
            : ""
        } ${
          !active ||
          !previewOpen
            ? "is-preview-hidden"
            : ""
        }`}
        onPointerDown={
          onPointerDown
        }
        onPointerMove={
          onPointerMove
        }
        onPointerUp={
          onPointerUp
        }
      >
        <video
          ref={videoRef}
          muted
          playsInline
        />

        <span
          className="auto-roi"
          style={{
            left:
              `${shownRegion.x * 100}%`,

            top:
              `${shownRegion.y * 100}%`,

            width:
              `${shownRegion.width * 100}%`,

            height:
              `${shownRegion.height * 100}%`,
          }}
        />
      </div>

      {active &&
        !!lastValues.length && (
          <div className="auto-detected-row">
            <span>
              Leitura recente
            </span>

            <strong>
              {lastValues.join(
                " · ",
              )}
            </strong>
          </div>
        )}

      <canvas
        ref={canvasRef}
        hidden
      />
    </section>
  );
}