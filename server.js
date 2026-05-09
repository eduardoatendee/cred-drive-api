const express    = require("express");
const bodyParser = require("body-parser");
const axios      = require("axios");
const mongoose   = require("mongoose");

// ─── MercadoPago – inicialização OPCIONAL ────────────────────────────────────
let mercadopago = null;
const MP_TOKEN = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;

if (MP_TOKEN) {
  try {
    mercadopago = require("mercadopago");
    mercadopago.configure({ access_token: MP_TOKEN });
    console.log("✅ MercadoPago configurado com sucesso");
  } catch (err) {
    console.error("❌ Erro ao configurar MercadoPago:", err.message);
    mercadopago = null;
  }
} else {
  console.warn("⚠️  MP_ACCESS_TOKEN não definido — MercadoPago DESATIVADO");
}
// ─────────────────────────────────────────────────────────────────────────────

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch(err => console.log(err));

const app = express();
app.use(bodyParser.json());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mercadopago: MP_TOKEN ? "configurado" : "não configurado",
    timestamp: new Date().toISOString(),
  });
});

const requireMercadoPago = (req, res, next) => {
  if (!mercadopago) {
    return res.status(503).json({
      error: "MercadoPago não configurado. Defina MP_ACCESS_TOKEN no Render.",
    });
  }
  next();
};

// Suas rotas aqui...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
