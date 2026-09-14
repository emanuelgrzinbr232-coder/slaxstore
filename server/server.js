require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const {
readDb,
writeDb,
nextId,
now
} = require("./database");

const {
register: registerAuth,
authRequired,
cleanUser
} = require("./auth");

const {
register: registerProducts
} = require("./products");

const {
register: registerOrders
} = require("./orders");

const {
register: registerModeration
} = require("./moderation");

const app = express();

const PORT = Number(process.env.PORT || 3000);

# /*

# CORS

*/

app.use(
cors({
origin: true,
credentials: false
})
);

# /*

# BODY

*/

app.use(
express.json({
limit: "5mb"
})
);

app.use(
express.urlencoded({
extended: true
})
);

# /*

# TESTE DA API

*/

app.get("/api/health", (_req, res) => {
res.json({
ok: true,
name: "SlaxStore API",
version: "2.0.0"
});
});

# /*

# REGISTRA OS SISTEMAS

*/

registerAuth(app);
registerProducts(app);
registerOrders(app);
registerModeration(app);

# /*

# PERFIL

*/

app.get(
"/api/profile",
authRequired,
(req, res) => {
const db = readDb();

```
const user = db.users.find(
  item =>
    String(item.id) ===
    String(req.auth.id)
);

if (!user) {
  return res.status(404).json({
    error: "Usuário não encontrado."
  });
}

res.json({
  user: cleanUser(user)
});
```

}
);

# /*

# SAQUE

*/

app.post(
"/api/wallet/withdraw",
authRequired,
(req, res) => {
const amount = Number(
req.body.amount
);

```
const method = String(
  req.body.method || "PIX"
).trim();

const pixKey = String(
  req.body.pixKey || ""
).trim();

if (
  !Number.isInteger(amount) ||
  amount < 200
) {
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
  item =>
    String(item.id) ===
    String(req.auth.id)
);

if (!user) {
  return res.status(404).json({
    error: "Usuário não encontrado."
  });
}

if (
  Number(user.balance || 0) <
  amount
) {
  return res.status(400).json({
    error: "Saldo insuficiente."
  });
}

user.balance =
  Number(user.balance || 0) -
  amount;

const withdrawal = {
  id: nextId(
    db,
    "withdrawal"
  ),

  userId: user.id,

  amount,

  method,

  pixKey,

  status: "pending",

  createdAt: now()
};

if (!Array.isArray(db.withdrawals)) {
  db.withdrawals = [];
}

db.withdrawals.push(
  withdrawal
);

writeDb(db);

res.json({
  message:
    "Saque solicitado com sucesso.",

  withdrawal,

  user: cleanUser(user)
});
```

}
);

# /*

# HISTÓRICO DE SAQUES

*/

app.get(
"/api/wallet/withdrawals",
authRequired,
(req, res) => {
const db = readDb();

```
const withdrawals =
  Array.isArray(db.withdrawals)
    ? db.withdrawals
        .filter(
          item =>
            String(
              item.userId
            ) ===
            String(
              req.auth.id
            )
        )
        .sort(
          (a, b) =>
            new Date(
              b.createdAt
            ) -
            new Date(
              a.createdAt
            )
        )
    : [];

res.json({
  withdrawals
});
```

}
);

# /*

# ADMIN - SAQUES

*/

app.get(
"/api/admin/withdrawals",
authRequired,
(req, res) => {
const db = readDb();

```
const admin = db.users.find(
  item =>
    String(item.id) ===
    String(req.auth.id)
);

if (
  !admin ||
  !admin.isAdmin
) {
  return res.status(403).json({
    error:
      "Acesso restrito à administração."
  });
}

const withdrawals =
  Array.isArray(db.withdrawals)
    ? db.withdrawals.map(
        withdrawal => {
          const user =
            db.users.find(
              item =>
                String(
                  item.id
                ) ===
                String(
                  withdrawal.userId
                )
            );

          return {
            ...withdrawal,

            username:
              user
                ? user.username
                : "Usuário",

            email:
              user
                ? user.email
                : ""
          };
        }
      )
    : [];

res.json({
  withdrawals
});
```

}
);

# /*

# ADMIN - ATUALIZAR SAQUE

*/

app.patch(
"/api/admin/withdrawals/:id",
authRequired,
(req, res) => {
const db = readDb();

```
const admin = db.users.find(
  item =>
    String(item.id) ===
    String(req.auth.id)
);

if (
  !admin ||
  !admin.isAdmin
) {
  return res.status(403).json({
    error:
      "Acesso restrito à administração."
  });
}

const withdrawal =
  Array.isArray(db.withdrawals)
    ? db.withdrawals.find(
        item =>
          String(item.id) ===
          String(
            req.params.id
          )
      )
    : null;

if (!withdrawal) {
  return res.status(404).json({
    error:
      "Saque não encontrado."
  });
}

const newStatus = String(
  req.body.status ||
  withdrawal.status
);

const allowed = [
  "pending",
  "processing",
  "paid",
  "rejected"
];

if (
  !allowed.includes(
    newStatus
  )
) {
  return res.status(400).json({
    error:
      "Status inválido."
  });
}

/*
Devolve o dinheiro se
o saque for rejeitado.
*/

if (
  withdrawal.status !==
    "rejected" &&
  newStatus ===
    "rejected"
) {
  const user =
    db.users.find(
      item =>
        String(item.id) ===
        String(
          withdrawal.userId
        )
    );

  if (user) {
    user.balance =
      Number(
        user.balance || 0
      ) +
      Number(
        withdrawal.amount || 0
      );
  }
}

withdrawal.status =
  newStatus;

writeDb(db);

res.json({
  message:
    "Saque atualizado.",

  withdrawal
});
```

}
);

# /*

# ARQUIVOS DO SITE

*/

/*
Estrutura:

SlaxStore/
├── index.html
├── package.json
└── Servidor/
├── server.js
├── database.js
├── auth.js
├── email.js
├── moderation.js
├── orders.js
└── products.js
*/

const sitePath =
path.join(
__dirname,
".."
);

app.use(
express.static(
sitePath
)
);

# /*

# ROTAS API NÃO ENCONTRADAS

*/

app.use(
"/api",
(_req, res) => {
res.status(404).json({
error:
"Rota da API não encontrada."
});
}
);

# /*

# ABRIR INDEX.HTML

*/

app.use(
(req, res, next) => {
res.sendFile(
path.join(
sitePath,
"index.html"
),
error => {
if (error) {
next(error);
}
}
);
}
);

# /*

# ERROS

*/

app.use(
(
error,
_req,
res,
_next
) => {
console.error(
"Erro interno:",
error
);

```
res.status(500).json({
  error:
    "Erro interno do servidor."
});
```

}
);

# /*

# INICIAR SERVIDOR

*/

app.listen(
PORT,
() => {
console.log(
"======================================"
);

```
console.log(
  "          SLAXSTORE ONLINE"
);

console.log(
  "======================================"
);

console.log(
  `Porta: ${PORT}`
);

console.log(
  "API: /api/health"
);

console.log(
  "======================================"
);
```

}
);
