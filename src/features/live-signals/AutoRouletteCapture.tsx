import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cropAroundPoint, recognizeLabel } from "./simpleOcr";
import type { RouletteSpin } from "./rouletteEngine";
import { uid } from "./core";

const CALIBRATION_KEY = "neurowin-roulette-auto-capture-v1";
const URL_KEY = "neurowin-roulette-game-url-v1";
const LABELS = Array.from({ length: 37 }, (_, index) => String(index));

type Calibration = {
  point: { x: number; y: number } | null;
  widthScale: number;
  heightScale: number;
};

const DEFAULT_URL = "https://www.bettilt746.com/pt/game/xxxtreme-lightning-roulette/real";

function loadCalibration(): Calibration {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (!raw) return { point: { x: 0.762, y: 0.797 }, widthScale: 0.05, heightScale: 0.075 };
    const parsed = JSON.parse(raw) as Calibration;
    return {
      point: parsed.point ?? { x: 0.762, y: 0.797 },
      widthScale: Number.isFinite(parsed.widthScale) ? parsed.widthScale : 0.05,
      heightScale: Number.isFinite(parsed.heightScale) ? parsed.heightScale : 0.075,
    };
  } catch {
    return { point: { x: 0.762, y: 0.797 }, widthScale: 0.05, heightScale: 0.075 };
  }
}

export default function AutoRouletteCapture({ onSpin }: { onSpin: (spin: RouletteSpin) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onSpinRef = useRef(onSpin);

  const [url, setUrl] = useState(() => localStorage.getItem(URL_KEY) || DEFAULT_URL);
  const [active, setActive] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibration, setCalibration] = useState<Calibration>(() => loadCalibration());
  const [readout, setReadout] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [status, setStatus] = useState("Não ligado");

  const machine = useRef({
    stableFrames: 0,
    candidate: "",
    lastRegistered: "",
    sawInvalid: true,
  });

  useEffect(() => {
    onSpinRef.current = onSpin;
  }, [onSpin]);

  function saveCalibration(value: Calibration) {
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(value));
  }

  function saveUrl(value: string) {
    setUrl(value);
    localStorage.setItem(URL_KEY, value);
  }

  function openGame() {
    if (!url.trim()) return;
    window.open(url.trim(), "_blank", "noopener,noreferrer");
  }

  async function connect() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 12, max: 20 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setActive(true);
      setPreviewOpen(true);
      setStatus("Ligado — à espera do número vencedor");
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setActive(false);
        setStatus("Ligação terminada");
      });
    } catch (error) {
      console.error(error);
      setStatus("Não foi possível ligar. Seleciona o separador da roleta quando o navegador pedir.");
    }
  }

  function disconnect() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
    setStatus("Não ligado");
  }

  function beginCalibration() {
    if (!active) return;
    setPreviewOpen(true);
    setCalibrating(true);
    setStatus("Calibração — clica no centro da caixa do resultado mais recente");
  }

  function onVideoClick(event: MouseEvent<HTMLVideoElement>) {
    if (!calibrating) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    const next = { ...calibration, point };
    setCalibration(next);
    saveCalibration(next);
    machine.current = { stableFrames: 0, candidate: "", lastRegistered: "", sawInvalid: true };
    setCalibrating(false);
    setStatus("Calibração guardada — a acompanhar resultados");
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
        return;
      }

      if (state.candidate === result.label) state.stableFrames += 1;
      else {
        state.candidate = result.label;
        state.stableFrames = 1;
      }

      if (state.stableFrames < 4) return;
      if (result.label === state.lastRegistered && !state.sawInvalid) return;

      const number = Number(result.label);
      if (!Number.isInteger(number) || number < 0 || number > 36) return;

      onSpinRef.current({
        id: uid("roulette-auto"),
        timestamp: Date.now(),
        number,
        source: "CAPTURE",
      });
      state.lastRegistered = result.label;
      state.sawInvalid = false;
      state.stableFrames = 0;
      state.candidate = "";
      setStatus(`Sincronizado — último número ${number}`);
    }, 160);

    return () => window.clearInterval(timer);
  }, [active, calibration]);

  return (
    <section className="auto-link-card premium-card">
      <div className="auto-link-head">
        <div>
          <span className="eyebrow">LIGAÇÃO AO JOGO</span>
          <h2>XXXtreme Lightning Roulette</h2>
          <p>Abre a roleta e liga o separador. A NeuroWin acompanha o número vencedor automaticamente.</p>
        </div>
        <span className={active ? "auto-status-pill is-on" : "auto-status-pill"}><i /> {active ? "LIGADO" : "DESLIGADO"}</span>
      </div>

      <div className="auto-link-row">
        <input value={url} onChange={(event) => saveUrl(event.target.value)} aria-label="Link atual da roleta" />
        <button type="button" className="live-secondary-button" onClick={openGame}>Abrir jogo</button>
        {!active ? (
          <button type="button" className="live-primary-button" onClick={connect}>LIGAR AO JOGO</button>
        ) : (
          <button type="button" className="live-secondary-button" onClick={disconnect}>Desligar</button>
        )}
      </div>

      <div className="auto-live-summary">
        <div><span>Estado</span><strong>{status}</strong></div>
        <div><span>Número lido</span><strong>{readout ?? "—"}</strong></div>
        <div><span>Qualidade OCR</span><strong>{Math.round(confidence * 100)}%</strong></div>
        <div><span>Janela de aposta</span><strong>19 s</strong></div>
      </div>

      {active && (
        <div className="auto-capture-actions">
          <button type="button" className="live-secondary-button" onClick={beginCalibration}>Calibrar resultado</button>
          <button type="button" className="live-ghost-button" onClick={() => setPreviewOpen((value) => !value)}>{previewOpen ? "Ocultar pré-visualização" : "Mostrar pré-visualização"}</button>
        </div>
      )}
      <div className={`auto-video-wrap ${!active || !previewOpen ? "is-preview-hidden" : ""}`}>
        <video ref={videoRef} muted playsInline onClick={onVideoClick} className={calibrating ? "is-calibrating" : ""} />
        {calibration.point && (
          <span className="live-calibration-marker" style={{ left: `${calibration.point.x * 100}%`, top: `${calibration.point.y * 100}%` }}>1</span>
        )}
      </div>
      <canvas ref={canvasRef} hidden />
    </section>
  );
}
