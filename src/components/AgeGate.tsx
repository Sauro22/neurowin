import { useState } from "react";

const KEY = "neurowin-age-confirmed";

export function AgeGate() {
  const [visible, setVisible] = useState(() => localStorage.getItem(KEY) !== "yes");
  if (!visible) return null;

  return (
    <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <section className="age-card premium-card led-border">
        <div className="brand-mark large">N</div>
        <span className="eyebrow">ACESSO 18+</span>
        <h1 id="age-title">Confirma a tua idade</h1>
        <p>A App NeuroWin inclui conteúdos relacionados com apostas. Utiliza a plataforma de forma responsável.</p>
        <button
          className="primary-button"
          onClick={() => {
            localStorage.setItem(KEY, "yes");
            setVisible(false);
          }}
        >
          Tenho 18 anos ou mais
        </button>
      </section>
    </div>
  );
}
