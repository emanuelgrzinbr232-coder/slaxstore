
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const {
  readDb,
  writeDb,
  nextId,
  now
} = require("./server-database");

const {
  register: registerAuth,
  authRequired,
  cleanUser
} = require("./auth");

const { register: registerProducts } = require("./product");
const { register: registerOrders } = require("./orders");
const { register: registerModeration } = require("./moderation");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const sitePath = path.join(__dirname, "..");

// CORS
app.use(cors({
  origin: true,
  credentials: false
}));

// BODY
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// TESTE DA API
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: "SlaxStore API",
    version: "1.0.0"
  });
});

// REGISTRA OS SISTEMAS
registerAuth(app);
registerProducts(app);
registerOrders(app);
registerModeration(app);

// PERFIL
app.get("/api/profile", authRequired, (req, res) => {
  const db = readDb();

  const user = db.users.find(
    item => String(item.id) === String(req.auth.id)
  );

  if (!user) {
    return res.status(404).json({
      error: "Usuário não encontrado."
    });
  }

  res.json({
    user: cleanUser(user)
  });
});

// SAQUE
// O index.html envia amount em CENTAVOS.
// R$ 2,00 = 200 | R$ 10,00 = 1000
app.post("/api/wallet/withdraw", authRequired, (req, res) => {
  const amount = Number(req.body.amount);
  const method = String(req.body.method || "PIX").trim();
  const pixKey = String(req.body.pixKey || "").trim();

  if (!Number.isInteger(amount) || amount < 200) {
    return res.status(400).json({
      error: "O saque mínimo é R$ 2,00."
    });
  }

  if (!pixKey) {
    return res.status(400).json({
      error: "Informe sua chave PIX."
    });
  }

  const db = readDb();

  const user = db.users.find(
    item => String(item.id) === String(req.auth.id)
  );

  if (!user) {
    return res.status(404).json({
      error: "Usuário não encontrado."
    });
  }

  if (Number(user.balance || 0) < amount) {
    return res.status(400).json({
      error: "Saldo insuficiente."
    });
  }

  // Reserva o dinheiro imediatamente.
  user.balance -= amount;

  const withdrawal = {
    id: nextId(db, "withdrawal"),
    userId: user.id,
    amount,
    method,
    pixKey,
    status: "pending",
    createdAt: now()
  };

  db.withdrawals.push(withdrawal);
  writeDb(db);

  res.json({
    message: "Saque solicitado com sucesso.",
    withdrawal,
    user: cleanUser(user)
  });
});

// HISTÓRICO DE SAQUES
app.get("/api/wallet/withdrawals", authRequired, (req, res) => {
  const db = readDb();

  const withdrawals = db.withdrawals
    .filter(item => String(item.userId) === String(req.auth.id))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ withdrawals });
});

// ADMIN - SAQUES
app.get("/api/admin/withdrawals", authRequired, (req, res) => {
  const db = readDb();

  const admin = db.users.find(
    item => String(item.id) === String(req.auth.id)
  );

  if (!admin || !admin.isAdmin) {
    return res.status(403).json({
      error: "Acesso restrito à administração."
    });
  }

  const withdrawals = db.withdrawals.map(withdrawal => {
    const user = db.users.find(
      item => String(item.id) === String(withdrawal.userId)
    );

    return {
      ...withdrawal,
      username: user ? user.username : "Usuário",
      email: user ? user.email : ""
    };
  });

  res.json({ withdrawals });
});

// ADMIN - ATUALIZAR SAQUE
app.patch("/api/admin/withdrawals/:id", authRequired, (req, res) => {
  const db = readDb();

  const admin = db.users.find(
    item => String(item.id) === String(req.auth.id)
  );

  if (!admin || !admin.isAdmin) {
    return res.status(403).json({
      error: "Acesso restrito à administração."
    });
  }

  const withdrawal = db.withdrawals.find(
    item => String(item.id) === String(req.params.id)
  );

  if (!withdrawal) {
    return res.status(404).json({
      error: "Saque não encontrado."
    });
  }

  const newStatus = String(req.body.status || withdrawal.status);
  const allowed = ["pending", "processing", "paid", "rejected"];

  if (!allowed.includes(newStatus)) {
    return res.status(400).json({
      error: "Status inválido."
    });
  }

  // Devolve o valor ao saldo somente quando muda para rejeitado.
  if (withdrawal.status !== "rejected" && newStatus === "rejected") {
    const user = db.users.find(
      item => String(item.id) === String(withdrawal.userId)
    );

    if (user) {
      user.balance = Number(user.balance || 0) +
        Number(withdrawal.amount || 0);
    }
  }

  withdrawal.status = newStatus;
  writeDb(db);

  res.json({
    message: "Saque atualizado.",
    withdrawal
  });
});

// ARQUIVOS DO SITE
// Espera-se que index.html esteja na pasta principal do projeto.
app.use(express.static(sitePath));

// ROTAS DESCONHECIDAS DA API: respondem JSON, não o index.html.
app.use("/api", (_req, res) => {
  res.status(404).json({
    error: "Rota da API não encontrada."
  });
});

// QUALQUER OUTRA ROTA ENTREGA O SITE.
// Usar middleware evita o problema de app.get("*") no Express 5.
app.use((req, res, next) => {
  res.sendFile(path.join(sitePath, "index.html"), error => {
    if (error) next(error);
  });
});

// ERROS
app.use((error, _req, res, _next) => {
  console.error("Erro interno:", error);

  res.status(500).json({
    error: "Erro interno do servidor."
  });
});

// INICIAR
app.listen(PORT, () => {
  console.log("SLAXSTORE ONLINE");
  console.log(`Porta: ${PORT}`);
});
