import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cropAroundPoint, recognizeMultiplier } from "./simpleOcr";
import type { ChickenDifficulty, ChickenRoadRound } from "./chickenRoadEngine";
import { uid } from "./core";

const URL_KEY = "neurowin-chicken-road-url-v1";
const CALIBRATION_KEY = "neurowin-chicken-road-capture-v1";
const DEFAULT_URL = "https://rokubet301.com/pt/game/inout/chicken-road";

type Calibration = {
  point: { x: number; y: number } | null;
  widthScale: number;
  heightScale: number;
};

function loadCalibration(): Calibration {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (!raw) return { point: null, widthScale: 0.12, heightScale: 0.11 };
    const parsed = JSON.parse(raw) as Calibration;
    return {
      point: parsed.point ?? null,
      widthScale: Number.isFinite(parsed.widthScale) ? parsed.widthScale : 0.12,
      heightScale: Number.isFinite(parsed.heightScale) ? parsed.heightScale : 0.11,
    };
  } catch {
    return { point: null, widthScale: 0.12, heightScale: 0.11 };
  }
}

export default function ChickenRoadCapture({
  difficulty,
  onRound,
}: {
  difficulty: ChickenDifficulty;
  onRound: (round: ChickenRoadRound) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onRoundRef = useRef(onRound);

  const [url, setUrl] = useState(() => localStorage.getItem(URL_KEY) || DEFAULT_URL);
  const [active, setActive] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibration, setCalibration] = useState<Calibration>(() => loadCalibration());
  const [readout, setReadout] = useState<number | null>(null);
  const [ocrScore, setOcrScore] = useState(0);
  const [status, setStatus] = useState("Não ligado");

  const machine = useRef({
    candidate: "",
    stableFrames: 0,
    lastRegistered: "",
    sawInvalid: true,
  });

  useEffect(() => {
    onRoundRef.current = onRound;
  }, [onRound]);

  function saveUrl(value: string) {
    setUrl(value);
    localStorage.setItem(URL_KEY, value);
  }

  function saveCalibration(value: Calibration) {
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(value));
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
      setStatus("Ligado — calibra a zona onde aparece o multiplicador final da run");
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setActive(false);
        setStatus("Ligação terminada");
      });
    } catch (error) {
      console.error(error);
      setStatus("Não foi possível ligar. Seleciona o separador do Chicken Road.");
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
    setStatus("Calibração — clica no centro do multiplicador final/resultado da run");
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
    setCalibrating(false);
    machine.current = { candidate: "", stableFrames: 0, lastRegistered: "", sawInvalid: true };
    setStatus("Calibração guardada — a acompanhar runs");
  }

  function updateSize(key: "widthScale" | "heightScale", value: number) {
    setCalibration((current) => {
      const next = { ...current, [key]: value };
      saveCalibration(next);
      return next;
    });
  }

  useEffect(() => {
    if (!active || !calibration.point) return;

    let busy = false;
    const timer = window.setInterval(() => {
      if (busy) return;
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
      if (!crop) return;

      busy = true;
      try {
        const detected = recognizeMultiplier(crop);
        setReadout(detected.value);
        setOcrScore(detected.score);
        const state = machine.current;

        if (detected.value === null) {
          state.candidate = "";
          state.stableFrames = 0;
          state.sawInvalid = true;
          return;
        }

        const key = detected.value.toFixed(2);
        if (state.candidate === key) state.stableFrames += 1;
        else {
          state.candidate = key;
          state.stableFrames = 1;
        }

        if (state.stableFrames < 4) return;
        if (state.lastRegistered === key && !state.sawInvalid) return;

        onRoundRef.current({
          id: uid("chicken-auto"),
          timestamp: Date.now(),
          multiplier: detected.value,
          difficulty,
          source: "CAPTURE",
        });
        state.lastRegistered = key;
        state.sawInvalid = false;
        state.stableFrames = 0;
        state.candidate = "";
        setStatus(`Run sincronizada — ${detected.value.toFixed(2)}x`);
      } finally {
        busy = false;
      }
    }, 190);

    return () => window.clearInterval(timer);
  }, [active, calibration, difficulty]);

  return (
    <section className="auto-link-card premium-card">
      <div className="auto-link-head">
        <div>
          <span className="eyebrow">LIGAÇÃO AO JOGO</span>
          <h2>Chicken Road</h2>
          <p>Abre o jogo, liga o separador e calibra uma vez a zona onde aparece o multiplicador final da run.</p>
        </div>
        <span className={active ? "auto-status-pill is-on" : "auto-status-pill"}><i /> {active ? "LIGADO" : "DESLIGADO"}</span>
      </div>

      <div className="auto-link-row">
        <input value={url} onChange={(event) => saveUrl(event.target.value)} aria-label="Link atual do Chicken Road" />
        <button type="button" className="live-secondary-button" onClick={openGame}>Abrir jogo</button>
        {!active ? (
          <button type="button" className="live-primary-button" onClick={connect}>LIGAR AO JOGO</button>
        ) : (
          <button type="button" className="live-secondary-button" onClick={disconnect}>Desligar</button>
        )}
      </div>

      <div className="auto-live-summary">
        <div><span>Estado</span><strong>{status}</strong></div>
        <div><span>Multiplicador lido</span><strong>{readout === null ? "—" : `${readout.toFixed(2)}x`}</strong></div>
        <div><span>Qualidade OCR</span><strong>{Math.round(ocrScore * 100)}%</strong></div>
        <div><span>Tempo</span><strong>Sem limite</strong></div>
      </div>

      {active && (
        <>
          <div className="auto-capture-actions">
            <button type="button" className="live-secondary-button" onClick={beginCalibration}>Calibrar resultado</button>
            <button type="button" className="live-ghost-button" onClick={() => setPreviewOpen((value) => !value)}>{previewOpen ? "Ocultar pré-visualização" : "Mostrar pré-visualização"}</button>
          </div>
          <div className="auto-size-row">
            <label><span>Largura OCR</span><input type="range" min="0.05" max="0.25" step="0.005" value={calibration.widthScale} onChange={(event) => updateSize("widthScale", Number(event.target.value))} /></label>
            <label><span>Altura OCR</span><input type="range" min="0.05" max="0.22" step="0.005" value={calibration.heightScale} onChange={(event) => updateSize("heightScale", Number(event.target.value))} /></label>
          </div>
        </>
      )}

      <div className={`auto-video-wrap ${!active || !previewOpen ? "is-preview-hidden" : ""}`}>
        <video ref={videoRef} muted playsInline onClick={onVideoClick} className={calibrating ? "is-calibrating" : ""} />
        {calibration.point && <span className="live-calibration-marker" style={{ left: `${calibration.point.x * 100}%`, top: `${calibration.point.y * 100}%` }}>1</span>}
      </div>

      <canvas ref={canvasRef} hidden />
    </section>
  );
}
