import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cropAroundPoint, recognizeLabel } from "./simpleOcr";
import type { RouletteSpin } from "./rouletteEngine";
import { uid } from "./core";

const CALIBRATION_KEY = "neurowin-roulette-capture-v3";
const LABELS = Array.from({ length: 37 }, (_, index) => String(index));

type Calibration = {
  point: { x: number; y: number } | null;
  widthScale: number;
  heightScale: number;
};

function loadCalibration(): Calibration {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (!raw) return { point: null, widthScale: 0.055, heightScale: 0.08 };
    const parsed = JSON.parse(raw) as Calibration;
    return {
      point: parsed.point ?? null,
      widthScale: Number.isFinite(parsed.widthScale) ? parsed.widthScale : 0.055,
      heightScale: Number.isFinite(parsed.heightScale) ? parsed.heightScale : 0.08,
    };
  } catch {
    return { point: null, widthScale: 0.055, heightScale: 0.08 };
  }
}

function saveCalibration(value: Calibration) {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(value));
}

export default function RouletteCapture({
  onSpin,
}: {
  onSpin: (spin: RouletteSpin) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [active, setActive] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibration, setCalibration] = useState<Calibration>(() => loadCalibration());
  const [readout, setReadout] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [status, setStatus] = useState("Captura desligada");

  const machine = useRef({
    stableFrames: 0,
    candidate: "",
    lastRegistered: "",
    sawInvalid: true,
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
      setStatus("Captura ativa — à espera do número vencedor");
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
    setCalibrating(true);
    setCalibration((current) => ({ ...current, point: null }));
    setStatus("Calibração: clica no centro do número vencedor/último resultado");
  }

  function onVideoClick(event: MouseEvent<HTMLVideoElement>) {
    if (!calibrating) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    setCalibration((current) => {
      const next = { ...current, point };
      saveCalibration(next);
      return next;
    });
    machine.current = {
      stableFrames: 0,
      candidate: "",
      lastRegistered: "",
      sawInvalid: true,
    };
    setCalibrating(false);
    setStatus("Calibração guardada — à espera do próximo resultado");
  }

  function updateSize(key: "widthScale" | "heightScale", value: number) {
    setCalibration((current) => {
      const next = { ...current, [key]: value };
      if (next.point) saveCalibration(next);
      return next;
    });
  }

  function forceRegister() {
    if (readout === null) return;
    const number = Number(readout);
    if (!Number.isInteger(number) || number < 0 || number > 36) return;
    onSpin({ id: uid("roulette"), timestamp: Date.now(), number, source: "CAPTURE" });
    machine.current.lastRegistered = readout;
    machine.current.sawInvalid = false;
    setStatus(`Spin registado manualmente da leitura: ${readout}`);
  }

  useEffect(() => {
    if (!active || !calibration.point) return;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !video.videoWidth || !video.videoHeight || !calibration.point) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const crop = cropAroundPoint(
        ctx,
        canvas.width,
        canvas.height,
        calibration.point.x,
        calibration.point.y,
        calibration.widthScale,
        calibration.heightScale,
      );
      const result = crop ? recognizeLabel(crop, LABELS) : { label: null, score: 0 };
      setReadout(result.label);
      setConfidence(result.score);

      const state = machine.current;
      if (result.label === null) {
        state.stableFrames = 0;
        state.candidate = "";
        state.sawInvalid = true;
        setStatus("À espera de um número legível");
        return;
      }

      if (state.candidate === result.label) state.stableFrames += 1;
      else {
        state.candidate = result.label;
        state.stableFrames = 1;
      }

      if (state.stableFrames < 5) return;

      const changed = result.label !== state.lastRegistered;
      if (!changed && !state.sawInvalid) {
        setStatus(`Número ${result.label} estável — à espera do próximo resultado`);
        return;
      }

      const number = Number(result.label);
      if (!Number.isInteger(number) || number < 0 || number > 36) return;

      onSpin({ id: uid("roulette"), timestamp: Date.now(), number, source: "CAPTURE" });
      state.lastRegistered = result.label;
      state.sawInvalid = false;
      state.stableFrames = 0;
      state.candidate = "";
      setStatus(`Spin capturado: ${number}`);
    }, 140);

    return () => window.clearInterval(timer);
  }, [active, calibration, onSpin]);

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
          Calibrar número vencedor
        </button>

        <button
          type="button"
          className="live-secondary-button"
          onClick={forceRegister}
          disabled={readout === null}
        >
          Forçar registo
        </button>
      </div>

      <p className="live-capture-status"><strong>Estado:</strong> {status}</p>
      {calibrating && (
        <p className="live-calibration-help">
          Clica no centro da <strong>caixa onde aparece o último número vencedor</strong>.
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
        {calibration.point && (
          <span
            className="live-calibration-marker"
            style={{ left: `${calibration.point.x * 100}%`, top: `${calibration.point.y * 100}%` }}
          >
            1
          </span>
        )}
      </div>

      <div className="live-capture-single-readout">
        <span>Número reconhecido</span>
        <strong>{readout ?? "?"}</strong>
        <small>semelhança {Math.round(confidence * 100)}%</small>
      </div>

      <div className="live-capture-sliders">
        <label className="live-range-label">
          <span>Largura da zona</span>
          <input
            type="range"
            min="0.025"
            max="0.12"
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
            min="0.04"
            max="0.16"
            step="0.005"
            value={calibration.heightScale}
            onChange={(event) => updateSize("heightScale", Number(event.target.value))}
          />
          <strong>{calibration.heightScale.toFixed(3)}</strong>
        </label>
      </div>

      <p className="live-data-note">
        Na mesa que enviaste, o histórico fica no canto inferior direito. Para maior robustez, calibra a caixa do resultado mais recente quando o número está grande e legível. Repetições consecutivas do mesmo número podem exigir “Forçar registo”.
      </p>

      <canvas ref={canvasRef} hidden />
    </div>
  );
}
