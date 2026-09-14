const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "slaxstore-development-secret-change-this";

app.set("trust proxy", 1);

app.use(cors({
origin: true,
credentials: true
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

function ensureStorage() {
if (!fs.existsSync(DATA_DIR)) {
fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
fs.writeFileSync(USERS_FILE, "[]", "utf8");
}

if (!fs.existsSync(PRODUCTS_FILE)) {
fs.writeFileSync(PRODUCTS_FILE, "[]", "utf8");
}

if (!fs.existsSync(ORDERS_FILE)) {
fs.writeFileSync(ORDERS_FILE, "[]", "utf8");
}
}

ensureStorage();

function readJSON(file) {
try {
return JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
return [];
}
}

function writeJSON(file, data) {
fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function createToken(user) {
return jwt.sign(
{
id: user.id,
email: user.email
},
JWT_SECRET,
{
expiresIn: "7d"
}
);
}

function authMiddleware(req, res, next) {
const header = req.headers.authorization || "";

if (!header.startsWith("Bearer ")) {
return res.status(401).json({
error: "Não autenticado."
});
}

const token = header.slice(7);

try {
req.user = jwt.verify(token, JWT_SECRET);
next();
} catch {
return res.status(401).json({
error: "Sessão inválida ou expirada."
});
}
}

| /*                                                                         |
| -------------------------------------------------------------------------- |
| FRONTEND                                                                   |
| -------------------------------------------------------------------------- |
| */                                                                         |

app.get("/", (req, res) => {
res.sendFile(path.join(ROOT, "index.html"));
});

app.use(express.static(ROOT));

| /*                                                                         |
| -------------------------------------------------------------------------- |
| HEALTH                                                                     |
| -------------------------------------------------------------------------- |
| */                                                                         |

app.get("/api/health", (req, res) => {
res.json({
online: true,
name: "SlaxStore API",
version: "3.0.0"
});
});

| /*                                                                         |
| -------------------------------------------------------------------------- |
| AUTH                                                                       |
| -------------------------------------------------------------------------- |
| */                                                                         |

app.post("/api/auth/register", async (req, res) => {
try {
const { name, email, password } = req.body;

```
if (!name || !email || !password) {
  return res.status(400).json({
    error: "Nome, e-mail e senha são obrigatórios."
  });
}

if (password.length < 8) {
  return res.status(400).json({
    error: "A senha precisa ter pelo menos 8 caracteres."
  });
}

const normalizedEmail = String(email).trim().toLowerCase();

const users = readJSON(USERS_FILE);

const exists = users.find(
  user => user.email === normalizedEmail
);

if (exists) {
  return res.status(409).json({
    error: "Este e-mail já está cadastrado."
  });
}

const passwordHash = await bcrypt.hash(password, 12);

const user = {
  id: Date.now().toString(),
  name: String(name).trim(),
  email: normalizedEmail,
  passwordHash,
  balance: 0,
  role: "user",
  emailVerified: false,
  createdAt: new Date().toISOString()
};

users.push(user);
writeJSON(USERS_FILE, users);

const token = createToken(user);

return res.status(201).json({
  message: "Conta criada com sucesso.",
  token,
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    balance: user.balance,
    role: user.role,
    emailVerified: user.emailVerified
  }
});
```

} catch (error) {
console.error(error);

```
res.status(500).json({
  error: "Erro interno ao criar conta."
});
```

}
});

app.post("/api/auth/login", async (req, res) => {
try {
const { email, password } = req.body;

```
if (!email || !password) {
  return res.status(400).json({
    error: "E-mail e senha são obrigatórios."
  });
}

const normalizedEmail = String(email).trim().toLowerCase();

const users = readJSON(USERS_FILE);

const user = users.find(
  item => item.email === normalizedEmail
);

if (!user) {
  return res.status(401).json({
    error: "E-mail ou senha incorretos."
  });
}

const validPassword = await bcrypt.compare(
  password,
  user.passwordHash
);

if (!validPassword) {
  return res.status(401).json({
    error: "E-mail ou senha incorretos."
  });
}

const token = createToken(user);

res.json({
  message: "Login realizado com sucesso.",
  token,
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    balance: user.balance || 0,
    role: user.role,
    emailVerified: user.emailVerified
  }
});
```

} catch (error) {
console.error(error);

```
res.status(500).json({
  error: "Erro interno ao realizar login."
});
```

}
});

app.get("/api/profile", authMiddleware, (req, res) => {
const users = readJSON(USERS_FILE);

const user = users.find(
item => item.id === req.user.id
);

if (!user) {
return res.status(404).json({
error: "Usuário não encontrado."
});
}

res.json({
id: user.id,
name: user.name,
email: user.email,
balance: user.balance || 0,
role: user.role,
emailVerified: user.emailVerified
});
});

app.post("/api/auth/logout", (req, res) => {
res.json({
message: "Logout realizado."
});
});

| /*                                                                         |
| -------------------------------------------------------------------------- |
| PRODUTOS                                                                   |
| -------------------------------------------------------------------------- |
| */                                                                         |

app.get("/api/products", (req, res) => {
const products = readJSON(PRODUCTS_FILE);

res.json({
products
});
});

app.get("/api/products/search", (req, res) => {
const query = String(req.query.q || "")
.trim()
.toLowerCase();

const products = readJSON(PRODUCTS_FILE);

const results = products.filter(product => {
return (
String(product.name || "").toLowerCase().includes(query) ||
String(product.category || "").toLowerCase().includes(query) ||
String(product.description || "").toLowerCase().includes(query)
);
});

res.json({
products: results
});
});

app.post("/api/products", authMiddleware, (req, res) => {
const {
name,
category,
price,
description
} = req.body;

if (!name || !category || !price || !description) {
return res.status(400).json({
error: "Todos os campos são obrigatórios."
});
}

const numericPrice = Number(price);

if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
return res.status(400).json({
error: "Preço inválido."
});
}

const products = readJSON(PRODUCTS_FILE);

const product = {
id: Date.now().toString(),
sellerId: req.user.id,
name: String(name).trim(),
category: String(category).trim(),
price: Number(numericPrice.toFixed(2)),
description: String(description).trim(),
status: "active",
createdAt: new Date().toISOString()
};

products.push(product);
writeJSON(PRODUCTS_FILE, products);

res.status(201).json({
message: "Produto criado.",
product
});
});

| /*                                                                         |
| -------------------------------------------------------------------------- |
| PEDIDOS                                                                    |
| -------------------------------------------------------------------------- |
| */                                                                         |

app.get("/api/orders", authMiddleware, (req, res) => {
const orders = readJSON(ORDERS_FILE);

const userOrders = orders.filter(
order => order.buyerId === req.user.id
);

res.json({
orders: userOrders
});
});

app.post("/api/products/:id/buy", authMiddleware, (req, res) => {
const products = readJSON(PRODUCTS_FILE);

const product = products.find(
item => item.id === req.params.id
);

if (!product) {
return res.status(404).json({
error: "Produto não encontrado."
});
}

if (product.sellerId === req.user.id) {
return res.status(400).json({
error: "Você não pode comprar seu próprio produto."
});
}

/*

* IMPORTANTE:
* Esta rota NÃO movimenta dinheiro real.
*
* Para pagamentos reais será necessário integrar
* um provedor de pagamentos no backend e confirmar
* o pagamento através de webhook.
  */

return res.status(501).json({
error: "Pagamento ainda não conectado.",
message: "Nenhuma cobrança foi realizada."
});
});

| /*                                                                         |
| -------------------------------------------------------------------------- |
| CARTEIRA                                                                   |
| -------------------------------------------------------------------------- |
| */                                                                         |

app.get("/api/wallet", authMiddleware, (req, res) => {
const users = readJSON(USERS_FILE);

const user = users.find(
item => item.id === req.user.id
);

if (!user) {
return res.status(404).json({
error: "Usuário não encontrado."
});
}

res.json({
balance: user.balance || 0
});
});

app.post("/api/wallet/withdraw", authMiddleware, (req, res) => {
/*

* Não processa saque real.
* Esta rota existe apenas para preparar a API.
  */

res.status(501).json({
error: "Saques ainda não estão conectados.",
message: "Nenhum dinheiro foi enviado."
});
});

| /*                                                                         |
| -------------------------------------------------------------------------- |
| ADMIN                                                                      |
| -------------------------------------------------------------------------- |
| */                                                                         |

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

req.adminUser = user;
next();
}

app.get(
"/api/admin/users",
authMiddleware,
adminMiddleware,
(req, res) => {
const users = readJSON(USERS_FILE);

```
res.json({
  users: users.map(user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    balance: user.balance || 0,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt
  }))
});
```

}
);

app.get(
"/api/admin/orders",
authMiddleware,
adminMiddleware,
(req, res) => {
res.json({
orders: readJSON(ORDERS_FILE)
});
}
);

| /*                                                                         |
| -------------------------------------------------------------------------- |
| 404 API                                                                    |
| -------------------------------------------------------------------------- |
| */                                                                         |

app.use("/api", (req, res) => {
res.status(404).json({
error: "Endpoint não encontrado."
});
});

| /*                                                                         |
| -------------------------------------------------------------------------- |
| ERROS                                                                      |
| -------------------------------------------------------------------------- |
| */                                                                         |

app.use((error, req, res, next) => {
console.error(error);

if (res.headersSent) {
return next(error);
}

res.status(500).json({
error: "Erro interno do servidor."
});
});

| /*                                                                         |
| -------------------------------------------------------------------------- |
| START                                                                      |
| -------------------------------------------------------------------------- |
| */                                                                         |

app.listen(PORT, "0.0.0.0", () => {
console.log("=================================");
console.log("       SLAXSTORE API ONLINE");
console.log("=================================");
console.log(`Porta: ${PORT}`);
console.log(`Frontend: http://localhost:${PORT}`);
console.log(`Health: http://localhost:${PORT}/api/health`);
console.log("=================================");
});
