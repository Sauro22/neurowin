import { useState } from "react";
import { ChartIcon, ChevronRightIcon, SignalIcon } from "../components/Icons";
import BacBoModule from "../features/live-signals/BacBoModule";
import FootballStudioModule from "../features/live-signals/FootballStudioModule";
import LightningRouletteModule from "../features/live-signals/LightningRouletteModule";
import ChickenRoadModule from "../features/live-signals/ChickenRoadModule";

type SignalModuleId =
  | "bac-bo"
  | "football-studio"
  | "lightning-roulette"
  | "chicken-road";

const modules: Array<{
  id: SignalModuleId;
  title: string;
  image: string;
  description: string;
  status: string;
}> = [
  {
    id: "bac-bo",
    title: "Bac Bo",
    image: "/assets/bac-bo.jpg",
    description:
      "Liga o separador do Bac Bo, lê o histórico visível e acompanha novas rondas automaticamente.",
    status: "Ligação ao jogo · histórico automático · 10 s",
  },
  {
    id: "football-studio",
    title: "Football Studio",
    image: "/assets/football-studio.jpg",
    description:
      "Liga o Football Studio e acompanha automaticamente o histórico Casa, Visitante e Empate.",
    status: "Ligação ao jogo · histórico automático · 11 s",
  },
  {
    id: "lightning-roulette",
    title: "XXXtreme Lightning Roulette",
    image: "/assets/lightning-roulette.jpg",
    description:
      "Liga a XXXtreme Lightning Roulette, lê o número vencedor e atualiza a análise a cada spin.",
    status: "Ligação ao jogo · leitura automática · 19 s",
  },
  {
    id: "chicken-road",
    title: "Chicken Road",
    image: "/assets/chicken.jpg",
    description:
      "Liga o Chicken Road, acompanha o multiplicador final das runs e analisa cada dificuldade separadamente.",
    status: "Ligação ao jogo · leitura automática · sem limite",
  },
];

export default function Signals() {
  const [selected, setSelected] = useState<SignalModuleId | null>(null);

  if (selected === "bac-bo") {
    return <BacBoModule onBack={() => setSelected(null)} />;
  }

  if (selected === "football-studio") {
    return <FootballStudioModule onBack={() => setSelected(null)} />;
  }

  if (selected === "lightning-roulette") {
    return <LightningRouletteModule onBack={() => setSelected(null)} />;
  }

  if (selected === "chicken-road") {
    return <ChickenRoadModule onBack={() => setSelected(null)} />;
  }

  return (
    <main className="page signals-page">
      <section className="signals-hero premium-card led-border hero-stadium">
        <div>
          <span className="eyebrow"><SignalIcon /> SINAIS</span>
          <h1>
            Análise <span>estatística</span>
          </h1>
          <p>
            Liga cada jogo ao respetivo separador, recolhe resultados visíveis automaticamente e atualiza a análise em tempo real. Sem geração aleatória de sinais.
          </p>
        </div>

        <div className="signals-hero-visual" aria-hidden="true">
          <div className="signals-chart-orb"><ChartIcon /></div>
          <div className="signals-bars">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>

        <span className="signals-ready quiet-pill">
          <i className="status-dot" /> Motores prontos
        </span>
      </section>

      <section className="signal-grid signal-grid-premium">
        {modules.map((item) => (
          <article
            key={item.id}
            className="signal-card premium-card led-border signal-card-clickable"
            role="button"
            tabIndex={0}
            onClick={() => setSelected(item.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelected(item.id);
              }
            }}
          >
            <div className="signal-image">
              <img src={item.image} alt={item.title} />
              <span />
            </div>

            <div className="signal-copy">
              <small>MÓDULO AO VIVO</small>
              <h2>{item.title}</h2>
              <p>{item.description}</p>

              <div className="signal-state signal-state-ready">
                <i className="status-dot" />
                {item.status}
              </div>
            </div>

            <span className="signal-arrow" aria-hidden="true">
              <ChevronRightIcon />
            </span>
          </article>
        ))}
      </section>
    </main>
  );
}
