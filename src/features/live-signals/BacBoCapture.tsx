import { useEffect, useRef, useState, type MouseEvent } from "react";
import { uid } from "./core";
import type { BacBoRound, DieValue } from "./bacBoEngine";
import {
  countWhitePips,
  cropSquare,
  type DiceCalibration,
} from "./diceVision";

const CALIBRATION_KEY = "neurowin-bacbo-calibration-v2";
const LABELS = ["Player 1", "Player 2", "Banker 1", "Banker 2"] as const;

function loadCalibration(): DiceCalibration {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (!raw) return { points: [], roiScale: 0.07 };
    const parsed = JSON.parse(raw) as DiceCalibration;
    if (!Array.isArray(parsed.points)) return { points: [], roiScale: 0.07 };
    return {
      points: parsed.points.slice(0, 4),
      roiScale: Number.isFinite(parsed.roiScale) ? parsed.roiScale : 0.07,
    };
  } catch {
    return { points: [], roiScale: 0.07 };
  }
}

function saveCalibration(calibration: DiceCalibration) {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibration));
}

function buildRound(
  dice: [DieValue, DieValue, DieValue, DieValue],
  source: "CAPTURE" | "MANUAL",
): BacBoRound {
  const [p1, p2, b1, b2] = dice;
  const playerTotal = p1 + p2;
  const bankerTotal = b1 + b2;
  const result =
    playerTotal > bankerTotal
      ? "PLAYER"
      : bankerTotal > playerTotal
        ? "BANKER"
        : "TIE";

  return {
    id: uid("bacbo"),
    timestamp: Date.now(),
    playerDice: [p1, p2],
    bankerDice: [b1, b2],
    playerTotal,
    bankerTotal,
    result,
    source,
  };
}

export default function BacBoCapture({
  onRound,
}: {
  onRound: (round: BacBoRound) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [active, setActive] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibration, setCalibration] = useState<DiceCalibration>(() => loadCalibration());
  const [readout, setReadout] = useState<Array<DieValue | null>>([null, null, null, null]);
  const [status, setStatus] = useState("Captura desligada");

  const machine = useRef({
    clearFrames: 0,
    stableFrames: 0,
    candidate: "",
    armed: false,
  });

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 10, max: 15 } },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();
      setActive(true);
      setStatus("Captura ativa — à espera da mesa");

      const track = stream.getVideoTracks()[0];
      track.addEventListener("ended", () => {
        setActive(false);
        setStatus("Captura terminada");
      });
    } catch (error) {
      console.error(error);
      setStatus("Não foi possível iniciar a captura");
    }
  }

  function stop() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
    setStatus("Captura desligada");
  }

  function beginCalibration() {
    setCalibration((current) => ({ ...current, points: [] }));
    setCalibrating(true);
    setStatus("Calibração: clica nos 4 dados pela ordem indicada");
  }

  function onVideoClick(event: MouseEvent<HTMLVideoElement>) {
    if (!calibrating) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };

    setCalibration((current) => {
      const next = {
        ...current,
        points: [...current.points, point].slice(0, 4),
      };

      if (next.points.length === 4) {
        saveCalibration(next);
        setCalibrating(false);
        setStatus("Calibração guardada — à espera do próximo resultado");
      }

      return next;
    });
  }

  function changeRoiScale(value: number) {
    setCalibration((current) => {
      const next = { ...current, roiScale: value };
      if (next.points.length === 4) saveCalibration(next);
      return next;
    });
  }

  function forceRegister() {
    if (!readout.every((value) => value !== null)) return;
    onRound(buildRound(readout as [DieValue, DieValue, DieValue, DieValue], "CAPTURE"));
    machine.current.armed = false;
    setStatus("Ronda registada a partir da leitura atual");
  }

  useEffect(() => {
    if (!active || calibration.points.length !== 4) return;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const values = calibration.points.map((point) => {
        const image = cropSquare(
          ctx,
          canvas.width,
          canvas.height,
          point.x,
          point.y,
          calibration.roiScale,
        );
        return image ? countWhitePips(image) : null;
      });

      setReadout(values);
      const allValid = values.length === 4 && values.every((value) => value !== null);
      const state = machine.current;

      if (!allValid) {
        state.clearFrames += 1;
        state.stableFrames = 0;
        state.candidate = "";

        if (state.clearFrames >= 5) {
          state.armed = true;
          setStatus("Mesa armada — à espera dos 4 dados da próxima ronda");
        }
        return;
      }

      state.clearFrames = 0;
      const key = values.join("-");

      if (!state.armed) {
        setStatus("Dados visíveis — à espera da transição para a próxima ronda");
        return;
      }

      if (key === state.candidate) {
        state.stableFrames += 1;
      } else {
        state.candidate = key;
        state.stableFrames = 1;
      }

      if (state.stableFrames >= 5) {
        onRound(buildRound(values as [DieValue, DieValue, DieValue, DieValue], "CAPTURE"));
        state.armed = false;
        state.stableFrames = 0;
        state.candidate = "";
        setStatus(`Ronda capturada: ${key}`);
      }
    }, 120);

    return () => window.clearInterval(timer);
  }, [active, calibration, onRound]);

  const calibrationIndex = calibration.points.length;

  return (
    <div className="live-capture-block">
      <div className="live-toolbar">
        {!active ? (
          <button type="button" className="live-primary-button" onClick={start}>
            Iniciar captura do ecrã
          </button>
        ) : (
          <button type="button" className="live-primary-button" onClick={stop}>
            Parar captura
          </button>
        )}

        <button type="button" className="live-secondary-button" onClick={beginCalibration} disabled={!active}>
          Calibrar 4 dados
        </button>

        <button
          type="button"
          className="live-secondary-button"
          onClick={forceRegister}
          disabled={!readout.every((value) => value !== null)}
        >
          Forçar registo
        </button>
      </div>

      <p className="live-capture-status"><strong>Estado:</strong> {status}</p>

      {calibrating && calibrationIndex < 4 && (
        <p className="live-calibration-help">
          Agora clica no centro de <strong>{LABELS[calibrationIndex]}</strong>.
        </p>
      )}

      <div className="live-video-wrap">
        <video
          ref={videoRef}
          muted
          playsInline
          onClick={onVideoClick}
          className={calibrating ? "is-calibrating" : ""}
        />

        {calibration.points.map((point, index) => (
          <span
            key={`${point.x}-${point.y}-${index}`}
            className="live-calibration-marker"
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          >
            {index + 1}
          </span>
        ))}
      </div>

      <div className="live-dice-readout">
        {LABELS.map((label, index) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{readout[index] ?? "?"}</strong>
          </div>
        ))}
      </div>

      <label className="live-range-label">
        <span>Tamanho da zona de leitura</span>
        <input
          type="range"
          min="0.035"
          max="0.12"
          step="0.005"
          value={calibration.roiScale}
          onChange={(event) => changeRoiScale(Number(event.target.value))}
        />
        <strong>{calibration.roiScale.toFixed(3)}</strong>
      </label>

      <canvas ref={canvasRef} hidden />
    </div>
  );
}
