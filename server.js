const express    = require("express");
const bodyParser = require("body-parser");
const mongoose   = require("mongoose");
const path       = require("path");

let mercadopago = null;
const MP_TOKEN  = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;

if (MP_TOKEN) {
  try {
    mercadopago = require("mercadopago");
    mercadopago.configure({ access_token: MP_TOKEN });
    console.log("✅ MercadoPago configurado");
  } catch (err) {
    console.error("❌ Erro MercadoPago:", err.message);
  }
} else {
  console.warn("⚠️  MP_ACCESS_TOKEN não definido — pagamentos desativados");
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => console.error("❌ MongoDB erro:", err.message));

const pagamentoSchema = new mongoose.Schema({
  tipo:          { type: String, enum: ["pix", "cartao"], required: true },
  valor:         { type: Number, required: true },
  status:        { type: String, default: "pendente" },
  mp_id:         { type: String },
  mp_status:     { type: String },
  descricao:     { type: String },
  pagador_nome:  { type: String },
  pagador_email: { type: String },
  pagador_cpf:   { type: String },
  pix_copia_cola:{ type: String },
  pix_qrcode:    { type: String },
  criado_em:     { type: Date, default: Date.now },
}, { timestamps: true });

const Pagamento = mongoose.model("Pagamento", pagamentoSchema);

const app = express();
app.use(bodyParser.json());

// ========== SERVIR ARQUIVOS ESTÁTICOS ==========
app.use(express.static(path.join(__dirname, "public")));

const requireMP = (req, res, next) => {
  if (!mercadopago) {
    return res.status(503).json({ erro: "MercadoPago não configurado." });
  }
  next();
};

// ========== ADMIN LOGIN ==========
app.post("/admin/login", (req, res) => {
  const { email, senha } = req.body;
  if (email === "admin@creddrive.com" && senha === "123456") {
    return res.json({ sucesso: true });
  }
  return res.status(401).json({ sucesso: false, erro: "Credenciais inválidas" });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mercadopago: MP_TOKEN ? "configurado" : "não configurado",
    timestamp: new Date().toISOString(),
  });
});

app.post("/pagamento/pix", requireMP, async (req, res) => {
  try {
    const { valor, descricao, pagador } = req.body;
    if (!valor || !pagador?.email || !pagador?.cpf) {
      return res.status(400).json({ erro: "Informe valor, pagador.email e pagador.cpf" });
    }
    const dados = {
      transaction_amount: Number(valor),
      description:        descricao || "Pagamento CredDrive",
      payment_method_id:  "pix",
      payer: {
        email:          pagador.email,
        first_name:     pagador.nome?.split(" ")[0] || "Cliente",
        last_name:      pagador.nome?.split(" ").slice(1).join(" ") || "",
        identification: { type: "CPF", number: pagador.cpf.replace(/\D/g, "") },
      },
    };
    const resposta  = await mercadopago.payment.create(dados);
    const mp        = resposta.body;
    const pagamento = await Pagamento.create({
      tipo: "pix", valor: Number(valor), status: mp.status,
      mp_id: String(mp.id), mp_status: mp.status, descricao,
      pagador_nome: pagador.nome, pagador_email: pagador.email, pagador_cpf: pagador.cpf,
      pix_copia_cola: mp.point_of_interaction?.transaction_data?.qr_code,
      pix_qrcode:     mp.point_of_interaction?.transaction_data?.qr_code_base64,
    });
    return res.status(201).json({
      sucesso: true, pagamento_id: pagamento._id, mp_id: mp.id, status: mp.status,
      pix_copia_cola: mp.point_of_interaction?.transaction_data?.qr_code,
      pix_qrcode_img: mp.point_of_interaction?.transaction_data?.qr_code_base64,
      expiracao:      mp.date_of_expiration,
    });
  } catch (err) {
    return res.status(500).json({ erro: "Erro ao criar PIX", detalhe: err.message });
  }
});

app.post("/pagamento/cartao", requireMP, async (req, res) => {
  try {
    const { valor, descricao, parcelas = 1, token, pagador } = req.body;
    if (!valor || !token || !pagador?.email || !pagador?.cpf) {
      return res.status(400).json({ erro: "Informe valor, token, pagador.email e pagador.cpf" });
    }
    const dados = {
      transaction_amount: Number(valor),
      token, description: descricao || "Pagamento CredDrive",
      installments: Number(parcelas),
      payment_method_id: req.body.payment_method_id || "visa",
      payer: {
        email: pagador.email,
        identification: { type: "CPF", number: pagador.cpf.replace(/\D/g, "") },
      },
    };
    const resposta  = await mercadopago.payment.create(dados);
    const mp        = resposta.body;
    const pagamento = await Pagamento.create({
      tipo: "cartao", valor: Number(valor), status: mp.status,
      mp_id: String(mp.id), mp_status: mp.status, descricao,
      pagador_nome: pagador.nome, pagador_email: pagador.email, pagador_cpf: pagador.cpf,
    });
    return res.status(201).json({
      sucesso: true, pagamento_id: pagamento._id, mp_id: mp.id,
      status: mp.status, status_detalhe: mp.status_detail,
      parcelas: mp.installments, valor: mp.transaction_amount,
    });
  } catch (err) {
    return res.status(500).json({ erro: "Erro ao processar cartão", detalhe: err.message });
  }
});

app.post("/pagamento/webhook", async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === "payment" && data?.id) {
      const resposta = await mercadopago.payment.findById(data.id);
      const mp       = resposta.body;
      const statusMap = { approved: "aprovado", rejected: "rejeitado", cancelled: "cancelado", refunded: "reembolsado", in_process: "processando", pending: "pendente" };
      await Pagamento.findOneAndUpdate({ mp_id: String(mp.id) }, { status: statusMap[mp.status] || mp.status, mp_status: mp.status });
    }
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(200);
  }
});

app.get("/pagamento/:id", async (req, res) => {
  try {
    const pagamento = await Pagamento.findById(req.params.id);
    if (!pagamento) return res.status(404).json({ erro: "Não encontrado" });
    return res.json({ sucesso: true, pagamento });
  } catch (err) {
    return res.status(500).json({ erro: "Erro ao buscar pagamento" });
  }
});

app.get("/pagamentos", async (req, res) => {
  try {
    const filtro = {};
    if (req.query.tipo)   filtro.tipo   = req.query.tipo;
    if (req.query.status) filtro.status = req.query.status;
    const pagamentos = await Pagamento.find(filtro).sort({ criado_em: -1 }).limit(100);
    return res.json({ sucesso: true, total: pagamentos.length, pagamentos });
  } catch (err) {
    return res.status(500).json({ erro: "Erro ao listar" });
  }
});

// ========== ROTAS HTML ==========
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 CredDrive API rodando na porta ${PORT}`));
