import { Link } from "react-router-dom";
import { ShieldIcon } from "../components/Icons";

export default function ResponsibleGaming() {
  return (
    <main className="page narrow-page">
      <section className="premium-card text-panel led-border">
        <ShieldIcon className="large-icon" />
        <span className="eyebrow">18+ · JOGO RESPONSÁVEL</span>
        <h1>Informação antes da decisão.</h1>
        <p>Define limites de tempo e orçamento, evita perseguir perdas e não utilizes dinheiro necessário para despesas essenciais. A análise estatística reduz incerteza apenas em termos descritivos; não elimina o risco.</p>
        <p>Se sentires perda de controlo, interrompe a atividade e procura apoio especializado na tua região.</p>
        <Link className="secondary-button inline-button" to="/">Voltar ao início</Link>
      </section>
    </main>
  );
}
