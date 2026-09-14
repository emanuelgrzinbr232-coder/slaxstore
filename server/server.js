const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET =
process.env.JWT_SECRET || "SLAXSTORE_CHANGE_THIS_SECRET_IN_RENDER";

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");

const USERS_FILE = path.join(DATA_DIR, "users.json");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

app.set("trust proxy", 1);

app.use(
cors({
origin: true,
credentials: true
})
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================================================
DATABASE SIMPLES
========================================================= */

function ensureFile(file, defaultValue = []) {
if (!fs.existsSync(file)) {
fs.writeFileSync(
file,
JSON.stringify(defaultValue, null, 2),
"utf8"
);
}
}

function ensureDatabase() {
if (!fs.existsSync(DATA_DIR)) {
fs.mkdirSync(DATA_DIR, {
recursive: true
});
}

ensureFile(USERS_FILE, []);
ensureFile(PRODUCTS_FILE, []);
ensureFile(ORDERS_FILE, []);
}

ensureDatabase();

function readJSON(file) {
try {
return JSON.parse(
fs.readFileSync(file, "utf8")
);
} catch (error) {
console.error("Erro lendo:", file, error);
return [];
}
}

function writeJSON(file, data) {
fs.writeFileSync(
file,
JSON.stringify(data, null, 2),
"utf8"
);
}

/* =========================================================
UTILITÁRIOS
========================================================= */

function generateId() {
return (
Date.now().toString(36) +
Math.random().toString(36).slice(2, 10)
);
}

function normalizeEmail(email) {
return String(email || "")
.trim()
.toLowerCase();
}

function createToken(user) {
return jwt.sign(
{
id: user.id,
email: user.email,
role: user.role
},
JWT_SECRET,
{
expiresIn: "7d"
}
);
}

function publicUser(user) {
return {
id: user.id,
name: user.name,
email: user.email,
balance: Number(user.balance || 0),
role: user.role || "user",
emailVerified: Boolean(user.emailVerified),
createdAt: user.createdAt
};
}

/* =========================================================
AUTENTICAÇÃO
========================================================= */

function authMiddleware(req, res, next) {
const authorization =
req.headers.authorization || "";

if (!authorization.startsWith("Bearer ")) {
return res.status(401).json({
error: "Autenticação necessária."
});
}

const token = authorization.substring(7);

try {
const decoded = jwt.verify(
token,
JWT_SECRET
);

```
req.user = decoded;

next();
```

} catch (error) {
return res.status(401).json({
error: "Sessão inválida ou expirada."
});
}
}

function adminMiddleware(req, res, next) {
const users = readJSON(USERS_FILE);

const user = users.find(
item => item.id === req.user.id
);

if (!user || user.role !== "admin") {
return res.status(403).json({
error: "Acesso administrativo negado."
});
}

req.admin = user;

next();
}

/* =========================================================
FRONTEND
========================================================= */

app.get("/", (req, res) => {
res.sendFile(
path.join(ROOT_DIR, "index.html")
);
});

app.use(
express.static(ROOT_DIR)
);

/* =========================================================
HEALTH
========================================================= */

app.get("/api/health", (req, res) => {
res.status(200).json({
online: true,
service: "SlaxStore",
api: "3.0.0",
version: "3.0.0",
server: "Servidor/server.js",
timestamp: new Date().toISOString()
});
});

/* =========================================================
AUTH — REGISTER
========================================================= */

app.post("/api/auth/register", async (req, res) => {
try {
const {
name,
email,
password
} = req.body;

```
if (!name || !email || !password) {
  return res.status(400).json({
    error:
      "Nome, e-mail e senha são obrigatórios."
  });
}

const cleanName = String(name).trim();
const cleanEmail = normalizeEmail(email);

if (cleanName.length < 2) {
  return res.status(400).json({
    error: "Nome inválido."
  });
}

if (password.length < 8) {
  return res.status(400).json({
    error:
      "A senha precisa ter pelo menos 8 caracteres."
  });
}

const users = readJSON(USERS_FILE);

const existingUser = users.find(
  user => user.email === cleanEmail
);

if (existingUser) {
  return res.status(409).json({
    error:
      "Já existe uma conta com este e-mail."
  });
}

const passwordHash =
  await bcrypt.hash(password, 12);

const user = {
  id: generateId(),
  name: cleanName,
  email: cleanEmail,
  passwordHash,
  balance: 0,
  role: "user",
  emailVerified: false,
  createdAt:
    new Date().toISOString()
};

users.push(user);

writeJSON(
  USERS_FILE,
  users
);

const token = createToken(user);

return res.status(201).json({
  success: true,
  message:
    "Conta criada com sucesso.",
  token,
  user: publicUser(user)
});
```

} catch (error) {
console.error(
"REGISTER ERROR:",
error
);

```
return res.status(500).json({
  error:
    "Erro interno ao criar a conta."
});
```

}
});

/* =========================================================
AUTH — LOGIN
========================================================= */

app.post("/api/auth/login", async (req, res) => {
try {
const {
email,
password
} = req.body;

```
if (!email || !password) {
  return res.status(400).json({
    error:
      "E-mail e senha são obrigatórios."
  });
}

const cleanEmail =
  normalizeEmail(email);

const users = readJSON(
  USERS_FILE
);

const user = users.find(
  item =>
    item.email === cleanEmail
);

if (!user) {
  return res.status(401).json({
    error:
      "E-mail ou senha incorretos."
  });
}

const validPassword =
  await bcrypt.compare(
    password,
    user.passwordHash
  );

if (!validPassword) {
  return res.status(401).json({
    error:
      "E-mail ou senha incorretos."
  });
}

const token =
  createToken(user);

return res.status(200).json({
  success: true,
  message:
    "Login realizado com sucesso.",
  token,
  user: publicUser(user)
});
```

} catch (error) {
console.error(
"LOGIN ERROR:",
error
);

```
return res.status(500).json({
  error:
    "Erro interno ao realizar login."
});
```

}
});

/* =========================================================
PROFILE
========================================================= */

app.get(
"/api/profile",
authMiddleware,
(req, res) => {
const users =
readJSON(USERS_FILE);

```
const user = users.find(
  item =>
    item.id === req.user.id
);

if (!user) {
  return res.status(404).json({
    error:
      "Usuário não encontrado."
  });
}

return res.json({
  success: true,
  user: publicUser(user)
});
```

}
);

/* =========================================================
LOGOUT
========================================================= */

app.post(
"/api/auth/logout",
(req, res) => {
res.json({
success: true,
message:
"Logout realizado."
});
}
);

/* =========================================================
PRODUTOS
========================================================= */

app.get(
"/api/products",
(req, res) => {
const products =
readJSON(PRODUCTS_FILE);

```
const activeProducts =
  products.filter(
    product =>
      product.status !==
      "deleted"
  );

res.json({
  success: true,
  products:
    activeProducts
});
```

}
);

/* =========================================================
BUSCA
========================================================= */

app.get(
"/api/products/search",
(req, res) => {
const query =
String(
req.query.q || ""
)
.trim()
.toLowerCase();

```
const products =
  readJSON(PRODUCTS_FILE);

const results =
  products.filter(
    product => {
      const text =
        `${product.name || ""} ${
          product.category || ""
        } ${
          product.description || ""
        }`.toLowerCase();

      return text.includes(query);
    }
  );

res.json({
  success: true,
  products: results
});
```

}
);

/* =========================================================
CRIAR PRODUTO
========================================================= */

app.post(
"/api/products",
authMiddleware,
(req, res) => {
const {
name,
category,
price,
description
} = req.body;

```
if (
  !name ||
  !category ||
  price === undefined ||
  !description
) {
  return res.status(400).json({
    error:
      "Nome, categoria, preço e descrição são obrigatórios."
  });
}

const numericPrice =
  Number(price);

if (
  !Number.isFinite(
    numericPrice
  ) ||
  numericPrice <= 0
) {
  return res.status(400).json({
    error:
      "Preço inválido."
  });
}

const products =
  readJSON(PRODUCTS_FILE);

const product = {
  id: generateId(),
  sellerId:
    req.user.id,
  name:
    String(name).trim(),
  category:
    String(category).trim(),
  price:
    Number(
      numericPrice.toFixed(2)
    ),
  description:
    String(
      description
    ).trim(),
  status: "active",
  createdAt:
    new Date().toISOString()
};

products.push(product);

writeJSON(
  PRODUCTS_FILE,
  products
);

res.status(201).json({
  success: true,
  message:
    "Produto criado com sucesso.",
  product
});
```

}
);

/* =========================================================
PEDIDOS DO USUÁRIO
========================================================= */

app.get(
"/api/orders",
authMiddleware,
(req, res) => {
const orders =
readJSON(ORDERS_FILE);

```
const userOrders =
  orders.filter(
    order =>
      order.buyerId ===
        req.user.id ||
      order.sellerId ===
        req.user.id
  );

res.json({
  success: true,
  orders:
    userOrders
});
```

}
);

/* =========================================================
COMPRA
========================================================= */

app.post(
"/api/products/:id/buy",
authMiddleware,
(req, res) => {
const products =
readJSON(PRODUCTS_FILE);

```
const product =
  products.find(
    item =>
      item.id ===
      req.params.id
  );

if (!product) {
  return res.status(404).json({
    error:
      "Produto não encontrado."
  });
}

if (
  product.sellerId ===
  req.user.id
) {
  return res.status(400).json({
    error:
      "Você não pode comprar seu próprio produto."
  });
}

/*
  PAGAMENTO REAL:

  Esta versão NÃO cobra dinheiro.

  Quando o provedor de pagamentos
  for conectado, o pedido deverá ser
  criado como "pending" e só deverá
  ser considerado pago depois de um
  webhook validado no servidor.
*/

return res.status(501).json({
  success: false,
  error:
    "Pagamento ainda não conectado.",
  message:
    "Nenhuma cobrança foi realizada."
});
```

}
);

/* =========================================================
CARTEIRA
========================================================= */

app.get(
"/api/wallet",
authMiddleware,
(req, res) => {
const users =
readJSON(USERS_FILE);

```
const user =
  users.find(
    item =>
      item.id ===
      req.user.id
  );

if (!user) {
  return res.status(404).json({
    error:
      "Usuário não encontrado."
  });
}

res.json({
  success: true,
  balance:
    Number(
      user.balance || 0
    )
});
```

}
);

/* =========================================================
DEPÓSITO
========================================================= */

app.post(
"/api/wallet/deposit",
authMiddleware,
(req, res) => {
/*
Não aceita depósito manual.

```
  Dinheiro real deverá entrar através
  de um provedor de pagamento.
*/

res.status(501).json({
  success: false,
  error:
    "Depósito ainda não conectado.",
  message:
    "Nenhum pagamento foi processado."
});
```

}
);

/* =========================================================
SAQUE
========================================================= */

app.post(
"/api/wallet/withdraw",
authMiddleware,
(req, res) => {
/*
Não realiza transferência real.
*/

```
res.status(501).json({
  success: false,
  error:
    "Saque ainda não conectado.",
  message:
    "Nenhum dinheiro foi transferido."
});
```

}
);

/* =========================================================
ADMIN — USUÁRIOS
========================================================= */

app.get(
"/api/admin/users",
authMiddleware,
adminMiddleware,
(req, res) => {
const users =
readJSON(USERS_FILE);

```
res.json({
  success: true,
  users:
    users.map(
      publicUser
    )
});
```

}
);

/* =========================================================
ADMIN — PEDIDOS
========================================================= */

app.get(
"/api/admin/orders",
authMiddleware,
adminMiddleware,
(req, res) => {
const orders =
readJSON(ORDERS_FILE);

```
res.json({
  success: true,
  orders
});
```

}
);

/* =========================================================
ADMIN — PRODUTOS
========================================================= */

app.get(
"/api/admin/products",
authMiddleware,
adminMiddleware,
(req, res) => {
const products =
readJSON(PRODUCTS_FILE);

```
res.json({
  success: true,
  products
});
```

}
);

/* =========================================================
API 404
========================================================= */

app.use(
"/api",
(req, res) => {
res.status(404).json({
success: false,
error:
"Endpoint da API não encontrado.",
path: req.originalUrl
});
}
);

/* =========================================================
ERROS
========================================================= */

app.use(
(error, req, res, next) => {
console.error(
"SERVER ERROR:",
error
);

```
if (res.headersSent) {
  return next(error);
}

res.status(500).json({
  success: false,
  error:
    "Erro interno do servidor."
});
```

}
);

/* =========================================================
START
========================================================= */

app.listen(
PORT,
"0.0.0.0",
() => {
console.log(
"========================================"
);
console.log(
"          SLAXSTORE ONLINE"
);
console.log(
"========================================"
);
console.log(
`API: 3.0.0`
);
console.log(
`Porta: ${PORT}`
);
console.log(
`Frontend: ${ROOT_DIR}/index.html`
);
console.log(
"Health: /api/health"
);
console.log(
"========================================"
);
}
);

````

### Depois de salvar

No GitHub, confirme que ficou exatamente:

```text
slaxstore/
├── index.html
├── package.json
└── Servidor/
    ├── server.js  ← ESTE
    ├── auth.js
    ├── database.js
    ├── email.js
    ├── moderation.js
    ├── orders.js
    └── products.js
````

Depois faça **Commit changes → Render → Manual Deploy → Deploy latest commit**.

O `/api/health` agora deve mostrar `api: "3.0.0"`. Se ainda aparecer `api: "2.0.0"`, significa que o Render está fazendo deploy de **outro commit/repositório/branch**, e não deste arquivo.
