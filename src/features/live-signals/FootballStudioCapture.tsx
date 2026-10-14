import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cropAroundPoint, recognizeLabel } from "./simpleOcr";
import {
  outcomeFromRanks,
  type FootballRank,
  type FootballStudioRound,
} from "./footballStudioEngine";
import { uid } from "./core";

const CALIBRATION_KEY = "neurowin-football-capture-v3";
const RANKS: FootballRank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];
const LABELS = ["Carta HOME", "Carta AWAY"] as const;

type Point = { x: number; y: number };
type Calibration = {
  points: Point[];
  widthScale: number;
  heightScale: number;
};

function loadCalibration(): Calibration {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (!raw) return { points: [], widthScale: 0.065, heightScale: 0.10 };
    const parsed = JSON.parse(raw) as Calibration;
    return {
      points: Array.isArray(parsed.points) ? parsed.points.slice(0, 2) : [],
      widthScale: Number.isFinite(parsed.widthScale) ? parsed.widthScale : 0.065,
      heightScale: Number.isFinite(parsed.heightScale) ? parsed.heightScale : 0.10,
    };
  } catch {
    return { points: [], widthScale: 0.065, heightScale: 0.10 };
  }
}

function saveCalibration(value: Calibration) {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(value));
}

export default function FootballStudioCapture({
  onRound,
}: {
  onRound: (round: FootballStudioRound) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [active, setActive] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibration, setCalibration] = useState<Calibration>(() => loadCalibration());
  const [readout, setReadout] = useState<Array<FootballRank | null>>([null, null]);
  const [confidence, setConfidence] = useState([0, 0]);
  const [status, setStatus] = useState("Captura desligada");

  const machine = useRef({
    clearFrames: 0,
    stableFrames: 0,
    candidate: "",
    armed: true,
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
      setStatus("Captura ativa — à espera das cartas");
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
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
    setStatus("Calibração: clica no valor da carta HOME e depois AWAY");
  }

  function onVideoClick(event: MouseEvent<HTMLVideoElement>) {
    if (!calibrating) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };

    setCalibration((current) => {
      const next = { ...current, points: [...current.points, point].slice(0, 2) };
      if (next.points.length === 2) {
        saveCalibration(next);
        setCalibrating(false);
        machine.current.armed = true;
        setStatus("Calibração guardada — à espera do próximo resultado");
      }
      return next;
    });
  }

  function updateSize(key: "widthScale" | "heightScale", value: number) {
    setCalibration((current) => {
      const next = { ...current, [key]: value };
      if (next.points.length === 2) saveCalibration(next);
      return next;
    });
  }

  useEffect(() => {
    if (!active || calibration.points.length !== 2) return;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const results = calibration.points.map((point) => {
        const crop = cropAroundPoint(
          ctx,
          canvas.width,
          canvas.height,
          point.x,
          point.y,
          calibration.widthScale,
          calibration.heightScale,
        );
        return crop ? recognizeLabel(crop, RANKS) : { label: null, score: 0 };
      });

      const values = results.map((result) => result.label as FootballRank | null);
      setReadout(values);
      setConfidence(results.map((result) => result.score));

      const valid = values.length === 2 && values.every(Boolean);
      const state = machine.current;

      if (!valid) {
        state.clearFrames += 1;
        state.stableFrames = 0;
        state.candidate = "";
        if (state.clearFrames >= 4) {
          state.armed = true;
          setStatus("Mesa armada — à espera das duas cartas");
        }
        return;
      }

      state.clearFrames = 0;
      const key = values.join("-");

      if (!state.armed) {
        setStatus("Resultado visível — à espera das cartas serem retiradas");
        return;
      }

      if (state.candidate === key) state.stableFrames += 1;
      else {
        state.candidate = key;
        state.stableFrames = 1;
      }

      if (state.stableFrames >= 5) {
        const homeRank = values[0]!;
        const awayRank = values[1]!;
        onRound({
          id: uid("football"),
          timestamp: Date.now(),
          homeRank,
          awayRank,
          result: outcomeFromRanks(homeRank, awayRank),
          source: "CAPTURE",
        });
        state.armed = false;
        state.stableFrames = 0;
        state.candidate = "";
        setStatus(`Ronda capturada: HOME ${homeRank} / AWAY ${awayRank}`);
      }
    }, 140);

    return () => window.clearInterval(timer);
  }, [active, calibration, onRound]);

  const index = calibration.points.length;

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

        <button
          type="button"
          className="live-secondary-button"
          onClick={beginCalibration}
          disabled={!active}
        >
          Calibrar cartas
        </button>
      </div>

      <p className="live-capture-status"><strong>Estado:</strong> {status}</p>

      {calibrating && index < 2 && (
        <p className="live-calibration-help">
          Clica no centro do valor da <strong>{LABELS[index]}</strong>.
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
        {calibration.points.map((point, pointIndex) => (
          <span
            key={`${point.x}-${point.y}-${pointIndex}`}
            className="live-calibration-marker"
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          >
            {pointIndex + 1}
          </span>
        ))}
      </div>

      <div className="live-dice-readout two">
        {LABELS.map((label, readoutIndex) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{readout[readoutIndex] ?? "?"}</strong>
            <small>{Math.round(confidence[readoutIndex] * 100)}%</small>
          </div>
        ))}
      </div>

      <div className="live-capture-sliders">
        <label className="live-range-label">
          <span>Largura da zona</span>
          <input
            type="range"
            min="0.035"
            max="0.14"
            step="0.005"
            value={calibration.widthScale}
            onChange={(event) => updateSize("widthScale", Number(event.target.value))}
          />
          <strong>{calibration.widthScale.toFixed(3)}</strong>
        </label>
        <label className="live-range-label">
          <span>Altura da zona</span>
          <input
            type="range"
            min="0.05"
            max="0.20"
            step="0.005"
            value={calibration.heightScale}
            onChange={(event) => updateSize("heightScale", Number(event.target.value))}
          />
          <strong>{calibration.heightScale.toFixed(3)}</strong>
        </label>
      </div>

      <p className="live-data-note">
        A leitura é experimental e depende do zoom/qualidade do stream. Se a carta não for reconhecida, usa a entrada manual logo abaixo.
      </p>

      <canvas ref={canvasRef} hidden />
    </div>
  );
}
