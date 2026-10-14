import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { API_URL } from "../lib/api";
import {
  BrainIcon,
  ChartIcon,
  ChevronRightIcon,
  SendIcon,
  ShieldIcon,
} from "../components/Icons";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Health = {
  ai: boolean;
  aiModel?: string;
};

const HISTORY_KEY = "neurowin-ai-history-v3";

function readHistory(): Message[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function shortTitle(value: string) {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return "Nova conversa";
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

export default function AI() {
  const [messages, setMessages] = useState<Message[]>(readHistory);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-80)));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((response) => response.json())
      .then((data: Health) => setHealth(data))
      .catch(() => setHealth({ ai: false }));
  }, []);

  const currentTitle = useMemo(() => {
    const firstUserMessage = messages.find((message) => message.role === "user");
    return shortTitle(firstUserMessage?.content || "Nova conversa");
  }, [messages]);

  async function send(event: FormEvent) {
    event.preventDefault();

    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    const assistantId = crypto.randomUUID();

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setError("");
    setLoading(true);
    setReceiving(false);

    try {
      const response = await fetch(`${API_URL}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages
            .slice(-6)
            .map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!response.ok) {
        let message = "Falha ao contactar a NeuroWin AI.";

        try {
          const data = await response.json();
          if (data?.error) message = String(data.error);
        } catch {
          // Resposta sem JSON.
        }

        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("O servidor não iniciou o streaming da resposta.");
      }

      setReceiving(true);
      setMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
        },
      ]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;

        fullText += chunk;

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, content: fullText }
              : message
          )
        );
      }

      const tail = decoder.decode();
      if (tail) {
        fullText += tail;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, content: fullText }
              : message
          )
        );
      }

      if (!fullText.trim()) {
        throw new Error("A NeuroWin AI não devolveu conteúdo.");
      }
    } catch (err) {
      setMessages((current) =>
        current.filter((message) => message.id !== assistantId)
      );
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível obter resposta."
      );
    } finally {
      setReceiving(false);
      setLoading(false);
    }
  }

  function newConversation() {
  setMessages([]);
  setError("");
  setInput("");
}

  function clearHistory() {
    const confirmed = window.confirm("Queres apagar todo o histórico da conversa?");
    if (!confirmed) return;

    localStorage.removeItem(HISTORY_KEY);
    setMessages([]);
    setError("");
    setInput("");
  }

  return (
    <main className="ai-page ai-page-premium">
      {/* ======================================
          SIDEBAR
      ====================================== */}
      <aside className="ai-sidebar">
        <div className="ai-side-brand">
          <span className="brand-mark brand-mark-logo">N</span>
          <div>
            <strong>NeuroWin AI</strong>
            <small>O teu assistente de análise</small>
          </div>
        </div>

        <button type="button" className="ai-new" onClick={newConversation}>
          <span>＋</span> Nova conversa
        </button>
        <button
          type="button"
          className="ai-new"
          onClick={clearHistory}
          disabled={messages.length === 0}
        >
          Apagar histórico
        </button>
        <div className="ai-sidebar-section">
          <span className="ai-sidebar-label">CONVERSA ATUAL</span>
          <div className="ai-conversation-card premium-card">
            <span className="ai-conversation-icon"><BrainIcon /></span>
            <div>
              <strong>{currentTitle}</strong>
              <small>{messages.length} mensagens</small>
            </div>
          </div>
        </div>

        <div className="ai-sidebar-section ai-sidebar-topics">
          <span className="ai-sidebar-label">ATALHOS</span>
          <button type="button" onClick={() => setInput("Explica-me variância em apostas desportivas de forma simples.")}>Variância</button>
          <button type="button" onClick={() => setInput("Como interpreto uma probabilidade implícita?")}>Probabilidade implícita</button>
          <button type="button" onClick={() => setInput("Ajuda-me a estruturar uma gestão de risco responsável.")}>Gestão de risco</button>
        </div>

        <div className="ai-sidebar-status premium-card">
          <i className={health?.ai ? "status-dot" : "status-dot muted"} />
          <div>
            <strong>{health?.ai ? "AI online" : "AI indisponível"}</strong>
            <small>{health?.aiModel || "Verifica GEMINI_API_KEY"}</small>
          </div>
        </div>
      </aside>

      {/* ======================================
          MAIN
      ====================================== */}
      <section className="ai-main">
        <header className="ai-header premium-card led-border hero-stadium">
          <div className="ai-header-copy">
            <span className="eyebrow">NEUROWIN AI</span>
            <div className="ai-title-row">
              <h1>Assistente de análise</h1>
              <span className={health?.ai ? "ai-online-badge online" : "ai-online-badge"}>
                <i /> {health?.ai ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
            <p>
              O teu assistente com IA para análise estatística, probabilidade, variância e gestão de risco.
            </p>
          </div>

          <div className="ai-header-visual" aria-hidden="true">
            <div className="hero-logo-cube ai-cube"><BrainIcon /></div>
            <div className="hero-rings" />
          </div>
        </header>

        <div className="ai-thread">
          {/* ==================================
              WELCOME
          ================================== */}
          {messages.length === 0 && (
            <section className="ai-welcome premium-card led-border">
              <span className="ai-welcome-icon"><BrainIcon /></span>
              <h2>O que queres <span>analisar?</span></h2>
              <p>
                Pergunta sobre probabilidade, interpretação de dados, gestão de banca,
                variância, risco ou outro tema relacionado com análise desportiva.
              </p>

              <div className="ai-prompt-grid">
                <button type="button" onClick={() => setInput("Explica o impacto da variância nos meus resultados.")}>
                  <span className="prompt-icon"><ChartIcon /></span>
                  <div><strong>Variância</strong><small>Explica o impacto da variância nos meus resultados.</small></div>
                  <ChevronRightIcon />
                </button>

                <button type="button" onClick={() => setInput("Calcula e explica como interpretar probabilidades implícitas das odds.")}>
                  <span className="prompt-icon prompt-percent">%</span>
                  <div><strong>Probabilidade implícita</strong><small>Calcula e interpreta probabilidades das odds.</small></div>
                  <ChevronRightIcon />
                </button>

                <button type="button" onClick={() => setInput("Como devo gerir a minha banca de forma sustentável?")}>
                  <span className="prompt-icon"><ShieldIcon /></span>
                  <div><strong>Gestão de risco</strong><small>Como gerir a banca de forma responsável.</small></div>
                  <ChevronRightIcon />
                </button>
              </div>
            </section>
          )}

          {/* ==================================
              MENSAGENS
          ================================== */}
          {messages.map((message) => (
            <article key={message.id} className={`ai-message ${message.role}`}>
              <div className="ai-message-avatar">
                {message.role === "assistant" ? <BrainIcon /> : "TU"}
              </div>

              <div className="ai-message-body">
                <span>{message.role === "assistant" ? "NeuroWin AI" : "Tu"}</span>

                {message.role === "assistant" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {message.content}
                  </ReactMarkdown>
                ) : (
                  <p>{message.content}</p>
                )}
              </div>
            </article>
          ))}

          {loading && !receiving && (
            <article className="ai-message assistant">
              <div className="ai-message-avatar"><BrainIcon /></div>
              <div className="ai-message-body">
                <span>NeuroWin AI</span>
                <div className="typing"><i /><i /><i /></div>
              </div>
            </article>
          )}

          {error && <div className="form-error ai-error">{error}</div>}
          <div ref={endRef} />
        </div>

        {/* ======================================
            COMPOSER
        ====================================== */}
        <form className="ai-composer premium-card led-border" onSubmit={send}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Escreve a tua pergunta…"
            rows={1}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className="ai-send"
            disabled={loading || !input.trim()}
            aria-label="Enviar"
          >
            <SendIcon />
          </button>
        </form>
      </section>
    </main>
  );
}
