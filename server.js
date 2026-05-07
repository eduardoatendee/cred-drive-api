const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const mongoose = require("mongoose");


.then(() => console.log("MongoDB conectado"))
.catch(err => console.log(err));
const app = express();
app.use(bodyParser.json());

const WHATSAPP_NUMBER = "5573981355575";

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
