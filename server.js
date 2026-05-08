const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const mercadopago = require("mercadopago");
const mongoose = require("mongoose");

mongoose.connect("mongodb+srv://eduardoatendee_db_user:Eduardo123456@cluster0.gnuptpr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
.then(() => console.log("MongoDB conectado"))
.catch(err => console.log(err));

const app = express();
app.use(bodyParser.json());
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});
app.get("/pix", async (req, res) => {

const pagamento = await mercadopago.preference.create({
  body: {
    items: [
      {
        title: "Teste Cred Drive",
        quantity: 1,
        currency_id: "BRL",
        unit_price: 5.00
  }
 ]
 }
 });

    const link = pagamento.body.init_point;

    res.send(`
    <h1>Pagamento Gerado</h1>

    <a href="${link}" target="_blank">
        PAGAR COM MERCADO PAGO
    </a>
`);

});
app.get("/", (req, res) => {
  res.send("API Cred Drive funcionando");
});

const WHATSAPP_NUMBER = "5573981355575";


app.get("/teste", (req, res) => {
  res.send(`
    <h2>Teste Cred Drive</h2>

    <form method="POST" action="/cadastro">
      <input type="text" name="nome" placeholder="Nome"><br><br>

      <input type="text" name="cpf" placeholder="CPF"><br><br>

      <input type="text" name="telefone" placeholder="Telefone"><br><br>

      <button type="submit">Enviar</button>
    </form>
  `);
});
app.post("/cadastro", async (req, res) => {
  const { nome, cpf, telefone } = req.body;

  const mensagem = `
🚀 NOVO CADASTRO - CRED DRIVE

👤 Nome: ${nome}
📄 CPF: ${cpf}
📱 Telefone: ${telefone}

Entre em contato com o cliente.
`;

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensagem)}`;

  try {
    await axios.get(url);
    res.send("Enviado para WhatsApp!");
  } catch (error) {
    res.status(500).send("Erro ao enviar");
  }
});

app.listen(3000, () => {
  console.log("Servidor rodando...");
});
