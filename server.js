/**
 * server.js — Proxy seguro para "Pareja Virtual · Lion Queen Díaz"
 * -----------------------------------------------------------------
 * Este servidor guarda la API Key de OpenAI SOLO en el servidor (variable de entorno
 * OPENAI_API_KEY) y la agrega como cabecera `Authorization: Bearer <API_KEY>` antes de
 * reenviar cada petición a https://api.openai.com/v1/*. El navegador del usuario nunca
 * ve la clave: el index.html solo le habla a este proxy (rutas /v1/chat/completions y
 * /v1/audio/speech), tal como espera CONFIG.PROXY_URL="/v1" en index.html.
 *
 * ⚠️ NUNCA escribas tu API Key real dentro de este archivo ni la subas a un repositorio.
 * Configúrala como variable de entorno:
 *
 *   Local (desarrollo):
 *     1) Copia .env.example a .env
 *     2) Pon tu clave ahí:  OPENAI_API_KEY=sk-...
 *     3) node server.js
 *
 *   Vercel / Render / Railway (producción):
 *     Panel del proyecto → Settings → Environment Variables →
 *     agrega OPENAI_API_KEY con tu clave. NO la pongas en el código.
 *
 * Requiere Node 18+ (usa fetch nativo). Instala dependencias con: npm install
 */
const path = require("path");
const express = require("express");
const cors = require("cors");

// Carga variables desde .env si existe (no falla si el paquete no está instalado)
try { require("dotenv").config(); } catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE = "https://api.openai.com/v1";

if (!OPENAI_API_KEY) {
  console.warn(
    "⚠️  OPENAI_API_KEY no está configurada. Define esta variable de entorno antes de " +
    "iniciar el servidor (ver .env.example). Mientras tanto, /v1/* responderá con error " +
    "y la app usará su motor de respaldo local automáticamente."
  );
}

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Sirve el frontend (index.html, assets/, historias.json) desde la misma carpeta
app.use(express.static(path.join(__dirname), { extensions: ["html"] }));

function requireKey(res) {
  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY no configurada en el servidor." });
    return false;
  }
  return true;
}

/**
 * Chat del personaje → gpt-4o-mini
 * El cliente (index.html) envía exactamente el mismo body que espera la API de OpenAI
 * ({ model, messages, temperature, ... }); este proxy solo agrega la cabecera Authorization.
 */
app.post("/v1/chat/completions", async (req, res) => {
  if (!requireKey(res)) return;
  try {
    const upstream = await fetch(OPENAI_BASE + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + OPENAI_API_KEY,
      },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("Error /v1/chat/completions:", err.message);
    res.status(502).json({ error: "No se pudo contactar a OpenAI." });
  }
});

/**
 * Voz del personaje → tts-1
 * El cliente envía { model:"tts-1", voice, input } — la voz (onyx/echo/fable/nova/shimmer/alloy)
 * la decide el frontend según el personaje o el tono elegido, este proxy no la fuerza a una sola.
 * Devuelve el audio en crudo (audio/mpeg) para que <audio> lo reproduzca directamente.
 */
app.post("/v1/audio/speech", async (req, res) => {
  if (!requireKey(res)) return;
  try {
    const upstream = await fetch(OPENAI_BASE + "/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + OPENAI_API_KEY,
      },
      body: JSON.stringify(req.body),
    });
    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).send(errText);
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.set("Content-Type", "audio/mpeg");
    res.send(buf);
  } catch (err) {
    console.error("Error /v1/audio/speech:", err.message);
    res.status(502).json({ error: "No se pudo contactar a OpenAI." });
  }
});

// Salud del servicio (útil para Render/Railway/Vercel health checks)
app.get("/health", (req, res) => {
  res.json({ ok: true, openaiConfigured: !!OPENAI_API_KEY });
});

app.listen(PORT, () => {
  console.log(`✅ Pareja Virtual · proxy activo en http://localhost:${PORT}`);
  console.log(`   Frontend servido desde este mismo puerto (index.html, assets/, historias.json)`);
  console.log(`   OPENAI_API_KEY ${OPENAI_API_KEY ? "configurada ✔" : "NO configurada ✖ (ver .env.example)"}`);
});
