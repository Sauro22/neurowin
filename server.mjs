import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { setupSecurityRoutes } from "./security-routes.mjs";
import { setupSportsRoutes } from "./sports-routes.mjs";

dotenv.config({ quiet: true });

/* ==========================================
   01. SERVIDOR
========================================== */

const app = express();
const PORT = Number(process.env.PORT) || 3001;

/* ==========================================
   02. CORS
========================================== */

const configuredOrigin = String(
  process.env.FRONTEND_ORIGIN || "http://localhost:5173"
).trim();

const allowedOrigins = new Set([
  configuredOrigin,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.disable("x-powered-by");
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origem CORS não autorizada."));
    },
  })
);
app.use(express.json({ limit: "2mb" }));

/* ==========================================
   03. GEMINI
========================================== */

const GEMINI_API_KEY = String(
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
).trim();

const GEMINI_MODEL = String(
  process.env.GEMINI_MODEL || "gemini-3.8-flash"
).trim();

const GEMINI_FAST_MODEL = String(
  process.env.GEMINI_FAST_MODEL || "gemini-3.5-flash-lite"
).trim();

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;


/* ==========================================
   04. HEALTH
========================================== */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    application: "App NeuroWin",
    server: "online",
    ai: Boolean(ai),
    aiModel: GEMINI_FAST_MODEL,
    sports: Boolean(
      process.env.APISPORTS_KEY ||
      process.env.API_FOOTBALL_KEY
    ),
    timestamp: new Date().toISOString(),
  });
});

/* ==========================================
   05. NEUROWIN AI
========================================== */

function normaliseHistory(value) {
  return Array.isArray(value) ? value.slice(-8) : [];
}

function buildChatPrompt(message, history) {
  const historyText = history
    .map((item) => {
      const role = item?.role === "assistant"
        ? "Assistente"
        : "Utilizador";
      const content = String(
        item?.content || item?.text || ""
      ).trim();
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");

  return `
Tu és a NeuroWin AI, um assistente premium de análise estatística e apoio à decisão.
Responde em português de Portugal, salvo se o utilizador escrever claramente noutro idioma.
Sê claro, técnico quando necessário e prudente com probabilidades e apostas.
Não prometas resultados futuros nem apresentes apostas como garantidas.
Distingue dados observados, estimativas e incerteza.
Para perguntas simples, responde de forma curta e imediata.
Evita introduções longas e repetições desnecessárias.

${historyText ? `Contexto recente:\n${historyText}\n` : ""}
Utilizador: ${message}
`.trim();
}

function candidateModels() {
  return [
    GEMINI_FAST_MODEL,
    GEMINI_MODEL,
    "gemini-3.8-flash",
  ].filter(
    (value, index, array) =>
      value && array.indexOf(value) === index
  );
}

function generationConfigFor(model) {
  return {
    thinkingConfig: {
      thinkingLevel: String(model).includes("flash-lite")
        ? "minimal"
        : "low",
    },
    maxOutputTokens: 1000,
  };
}

app.post("/api/chat", async (req, res) => {
  if (!ai) {
    return res.status(503).json({
      ok: false,
      error: "Gemini não está configurado no servidor.",
    });
  }

  const message = String(
    req.body?.message || req.body?.prompt || ""
  ).trim();

  const history = normaliseHistory(req.body?.history);

  if (!message) {
    return res.status(400).json({
      ok: false,
      error: "Mensagem vazia.",
    });
  }

  const prompt = buildChatPrompt(message, history);
  let lastError = null;

  for (const model of candidateModels()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: generationConfigFor(model),
      });

      const text =
        typeof response.text === "string"
          ? response.text.trim()
          : "";

      if (!text) {
        throw new Error("O modelo não devolveu texto.");
      }

      return res.json({
        ok: true,
        model,
        reply: text,
      });
    } catch (error) {
      lastError = error;
      console.error(
        `Gemini ${model}:`,
        error?.message || error
      );
    }
  }

  return res.status(502).json({
    ok: false,
    error:
      lastError instanceof Error
        ? lastError.message
        : "Não foi possível obter resposta da IA.",
  });
});

app.post("/api/chat/stream", async (req, res) => {
  if (!ai) {
    return res.status(503).json({
      ok: false,
      error: "Gemini não está configurado no servidor.",
    });
  }

  const message = String(
    req.body?.message || req.body?.prompt || ""
  ).trim();

  const history = normaliseHistory(req.body?.history);

  if (!message) {
    return res.status(400).json({
      ok: false,
      error: "Mensagem vazia.",
    });
  }

  const prompt = buildChatPrompt(message, history);
  let lastError = null;

  for (const model of candidateModels()) {
    let started = false;

    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: prompt,
        config: generationConfigFor(model),
      });

      res.status(200);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("X-NeuroWin-Model", model);
      res.flushHeaders?.();

      for await (const chunk of stream) {
        const text =
          typeof chunk?.text === "string"
            ? chunk.text
            : "";

        if (!text) continue;

        started = true;
        res.write(text);
      }

      if (!started) {
        throw new Error("O modelo não devolveu texto.");
      }

      return res.end();
    } catch (error) {
      lastError = error;
      console.error(
        `Gemini stream ${model}:`,
        error?.message || error
      );

      if (res.headersSent) {
        return res.end(
          "\n\n[Não foi possível concluir a resposta.]"
        );
      }
    }
  }

  return res.status(502).json({
    ok: false,
    error:
      lastError instanceof Error
        ? lastError.message
        : "Não foi possível obter resposta da IA.",
  });
});

/* ==========================================
   06. SEGURANÇA / AUTH
========================================== */

setupSecurityRoutes(app);

/* ==========================================
   07. DESPORTO
========================================== */

app.get("/api/sports/test", (req, res) => {
  res.json({
    ok: true,
    message: "SPORTS TEST OK",
  });
});

console.log("→ A registar rotas de Desporto...");

setupSportsRoutes(app);

/* ==========================================
   FRONTEND PRODUÇÃO
========================================== */

app.use(express.static("dist"));

app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  res.sendFile(
    "index.html",
    {
      root: "dist",
    },
  );
});

/* ==========================================
   08. 404 API
========================================== */

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Endpoint não encontrado.",
  });
});

/* ==========================================
   09. ERROS
========================================== */

app.use((error, req, res, next) => {
  console.error("NeuroWin server error:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    ok: false,
    error: "Erro interno do servidor.",
  });
});

/* ==========================================
   10. START
========================================== */

app.listen(PORT, () => {
  console.log(`✓ NeuroWin backend em http://localhost:${PORT}`);
});

