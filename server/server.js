require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const {
registerUser,
loginUser,
verifyEmail,
resendVerificationCode,
authenticateToken,
requireAdmin,
publicUser,
} = require("./auth");

const {
readDb,
writeDb,
nextId,
now,
} = require("./database");

const {
createProduct,
getProducts,
getProductById,
updateProduct,
removeProduct,
publicProduct,
} = require("./products");

const {
createOrder,
getOrdersByUser,
getAllOrders,
} = require("./orders");

const {
sendVerificationEmail,
verifyEmailConnection,
} = require("./email");

const {
isUserBlocked,
banUser,
unbanUser,
suspendUser,
unsuspendUser,
getModerationRecords,
} = require("./moderation");

const app = express();

const PORT = Number(process.env.PORT) || 3000;

app.set("trust proxy", 1);

app.use(
cors({
origin: true,
credentials: true,
})
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
FUNÇÕES AUXILIARES
========================= */

function sendError(res, status, message) {
return res.status(status).json({
success: false,
message,
});
}

function sendSuccess(res, data = {}) {
return res.json({
success: true,
...data,
});
}

/* =========================
HEALTH CHECK
========================= */

app.get("/api/health", async (req, res) => {
return res.json({
online: true,
name: "SlaxStore API",
version: "3.0.0",
});
});

/* =========================
AUTH
========================= */

app.post("/api/auth/register", async (req, res) => {
try {
const { name, email, password } = req.body;

```
if (!name || !email || !password) {
  return sendError(
    res,
    400,
    "Nome, email e senha são obrigatórios."
  );
}

const result = await registerUser({
  name,
  email,
  password,
});

if (!result.success) {
  return sendError(res, 400, result.message);
}

try {
  await sendVerificationEmail(
    result.user.email,
    result.user.name,
    result.code
  );
} catch (emailError) {
  console.error(
    "Erro ao enviar email de verificação:",
    emailError.message
  );
}

return res.status(201).json({
  success: true,
  message:
    "Conta criada. Verifique seu email para ativar a conta.",
  user: result.user,
});
```

} catch (error) {
console.error("REGISTER ERROR:", error);
return sendError(res, 500, "Erro interno ao criar conta.");
}
});

app.post("/api/auth/login", async (req, res) => {
try {
const { email, password } = req.body;

```
if (!email || !password) {
  return sendError(
    res,
    400,
    "Email e senha são obrigatórios."
  );
}

const result = await loginUser(email, password);

if (!result.success) {
  return sendError(res, 401, result.message);
}

if (isUserBlocked(result.user.id)) {
  return sendError(
    res,
    403,
    "Sua conta está bloqueada."
  );
}

return res.json({
  success: true,
  message: "Login realizado com sucesso.",
  token: result.token,
  user: result.user,
});
```

} catch (error) {
console.error("LOGIN ERROR:", error);
return sendError(res, 500, "Erro interno ao fazer login.");
}
});

app.post("/api/auth/verify-email", async (req, res) => {
try {
const { email, code } = req.body;

```
if (!email || !code) {
  return sendError(
    res,
    400,
    "Email e código são obrigatórios."
  );
}

const result = await verifyEmail(email, code);

if (!result.success) {
  return sendError(res, 400, result.message);
}

return res.json({
  success: true,
  message: "Email verificado com sucesso.",
  token: result.token,
  user: result.user,
});
```

} catch (error) {
console.error("VERIFY EMAIL ERROR:", error);
return sendError(
res,
500,
"Erro ao verificar email."
);
}
});

app.post("/api/auth/resend-code", async (req, res) => {
try {
const { email } = req.body;

```
if (!email) {
  return sendError(
    res,
    400,
    "Informe seu email."
  );
}

const result = await resendVerificationCode(email);

if (!result.success) {
  return sendError(res, 400, result.message);
}

try {
  await sendVerificationEmail(
    result.user.email,
    result.user.name,
    result.code
  );
} catch (emailError) {
  console.error(
    "Erro ao reenviar email:",
    emailError.message
  );
}

return sendSuccess(res, {
  message: "Novo código enviado.",
});
```

} catch (error) {
console.error("RESEND ERROR:", error);
return sendError(
res,
500,
"Erro ao reenviar código."
);
}
});

app.post("/api/auth/logout", authenticateToken, (req, res) => {
return sendSuccess(res, {
message: "Logout realizado.",
});
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
return res.json({
success: true,
user: publicUser(req.user),
});
});

/* =========================
PROFILE
========================= */

app.get("/api/profile", authenticateToken, (req, res) => {
return res.json({
success: true,
user: publicUser(req.user),
});
});

/* =========================
PRODUTOS
========================= */

app.get("/api/products", (req, res) => {
try {
const products = getProducts();

```
return res.json({
  success: true,
  products: products.map(publicProduct),
});
```

} catch (error) {
console.error("PRODUCTS ERROR:", error);
return sendError(
res,
500,
"Erro ao carregar produtos."
);
}
});

app.get("/api/products/search", (req, res) => {
try {
const query = String(req.query.q || "")
.trim()
.toLowerCase();

```
if (!query) {
  const products = getProducts();

  return res.json({
    success: true,
    products: products.map(publicProduct),
  });
}

const products = getProducts().filter((product) => {
  const text = [
    product.name,
    product.description,
    product.category,
  ]
    .join(" ")
    .toLowerCase();

  return text.includes(query);
});

return res.json({
  success: true,
  products: products.map(publicProduct),
});
```

} catch (error) {
console.error("SEARCH PRODUCTS ERROR:", error);
return sendError(
res,
500,
"Erro ao pesquisar produtos."
);
}
});

app.get("/api/products/:id", (req, res) => {
try {
const product = getProductById(req.params.id);

```
if (!product) {
  return sendError(
    res,
    404,
    "Produto não encontrado."
  );
}

return res.json({
  success: true,
  product: publicProduct(product),
});
```

} catch (error) {
console.error("GET PRODUCT ERROR:", error);
return sendError(
res,
500,
"Erro ao carregar produto."
);
}
});

app.post("/api/products", authenticateToken, async (req, res) => {
try {
if (!req.user.verified) {
return sendError(
res,
403,
"Verifique seu email antes de vender."
);
}

```
if (isUserBlocked(req.user.id)) {
  return sendError(
    res,
    403,
    "Sua conta está bloqueada."
  );
}

const result = createProduct({
  ...req.body,
  sellerId: req.user.id,
});

if (!result.success) {
  return sendError(res, 400, result.message);
}

return res.status(201).json({
  success: true,
  message: "Produto publicado com sucesso.",
  product: publicProduct(result.product),
});
```

} catch (error) {
console.error("CREATE PRODUCT ERROR:", error);
return sendError(
res,
500,
"Erro ao publicar produto."
);
}
});

app.put(
"/api/products/:id",
authenticateToken,
async (req, res) => {
try {
const product = getProductById(req.params.id);

```
  if (!product) {
    return sendError(
      res,
      404,
      "Produto não encontrado."
    );
  }

  if (
    product.sellerId !== req.user.id &&
    req.user.role !== "admin"
  ) {
    return sendError(
      res,
      403,
      "Você não pode editar este produto."
    );
  }

  const result = updateProduct(
    req.params.id,
    req.body
  );

  if (!result.success) {
    return sendError(res, 400, result.message);
  }

  return res.json({
    success: true,
    message: "Produto atualizado.",
    product: publicProduct(result.product),
  });
} catch (error) {
  console.error("UPDATE PRODUCT ERROR:", error);
  return sendError(
    res,
    500,
    "Erro ao atualizar produto."
  );
}
```

}
);

app.delete(
"/api/products/:id",
authenticateToken,
async (req, res) => {
try {
const product = getProductById(req.params.id);

```
  if (!product) {
    return sendError(
      res,
      404,
      "Produto não encontrado."
    );
  }

  if (
    product.sellerId !== req.user.id &&
    req.user.role !== "admin"
  ) {
    return sendError(
      res,
      403,
      "Você não pode remover este produto."
    );
  }

  const result = removeProduct(req.params.id);

  if (!result.success) {
    return sendError(res, 400, result.message);
  }

  return sendSuccess(res, {
    message: "Produto removido.",
  });
} catch (error) {
  console.error("DELETE PRODUCT ERROR:", error);
  return sendError(
    res,
    500,
    "Erro ao remover produto."
  );
}
```

}
);

/* =========================
COMPRAS
========================= */

app.post(
"/api/products/:id/buy",
authenticateToken,
async (req, res) => {
try {
if (!req.user.verified) {
return sendError(
res,
403,
"Verifique seu email antes de comprar."
);
}

```
  if (isUserBlocked(req.user.id)) {
    return sendError(
      res,
      403,
      "Sua conta está bloqueada."
    );
  }

  const result = createOrder(
    req.user.id,
    req.params.id
  );

  if (!result.success) {
    return sendError(res, 400, result.message);
  }

  return res.json({
    success: true,
    message: "Compra realizada com sucesso.",
    order: result.order,
    balance: result.balance,
  });
} catch (error) {
  console.error("BUY ERROR:", error);
  return sendError(
    res,
    500,
    "Erro ao realizar compra."
  );
}
```

}
);

app.get("/api/orders", authenticateToken, (req, res) => {
try {
const orders = getOrdersByUser(req.user.id);

```
return res.json({
  success: true,
  orders,
});
```

} catch (error) {
console.error("ORDERS ERROR:", error);
return sendError(
res,
500,
"Erro ao carregar pedidos."
);
}
});

/* =========================
CARTEIRA
========================= */

app.post(
"/api/wallet/withdraw",
authenticateToken,
(req, res) => {
try {
const { amount, pixKey } = req.body;

```
  const value = Number(amount);

  if (!Number.isInteger(value)) {
    return sendError(
      res,
      400,
      "Valor inválido."
    );
  }

  if (value < 200) {
    return sendError(
      res,
      400,
      "O saque mínimo é R$ 2,00."
    );
  }

  if (!pixKey || String(pixKey).trim().length < 3) {
    return sendError(
      res,
      400,
      "Informe uma chave Pix válida."
    );
  }

  const db = readDb();

  const user = db.users.find(
    (item) => item.id === req.user.id
  );

  if (!user) {
    return sendError(
      res,
      404,
      "Usuário não encontrado."
    );
  }

  if (user.balance < value) {
    return sendError(
      res,
      400,
      "Saldo insuficiente."
    );
  }

  user.balance -= value;

  const withdrawal = {
    id: nextId("withdrawal"),
    userId: user.id,
    amount: value,
    pixKey: String(pixKey).trim(),
    status: "pending",
    createdAt: now(),
    updatedAt: now(),
  };

  db.withdrawals.push(withdrawal);

  writeDb(db);

  return res.json({
    success: true,
    message: "Solicitação de saque enviada.",
    withdrawal,
    balance: user.balance,
  });
} catch (error) {
  console.error("WITHDRAW ERROR:", error);
  return sendError(
    res,
    500,
    "Erro ao solicitar saque."
  );
}
```

}
);

/* =========================
ADMIN
========================= */

app.get(
"/api/admin/orders",
authenticateToken,
requireAdmin,
(req, res) => {
return res.json({
success: true,
orders: getAllOrders(),
});
}
);

app.get(
"/api/admin/withdrawals",
authenticateToken,
requireAdmin,
(req, res) => {
const db = readDb();

```
return res.json({
  success: true,
  withdrawals: db.withdrawals,
});
```

}
);

app.get(
"/api/admin/moderation",
authenticateToken,
requireAdmin,
(req, res) => {
return res.json({
success: true,
records: getModerationRecords(),
});
}
);

app.post(
"/api/admin/users/:id/ban",
authenticateToken,
requireAdmin,
(req, res) => {
const result = banUser(
req.params.id,
req.body.reason || "Violação das regras."
);

```
if (!result.success) {
  return sendError(res, 400, result.message);
}

return sendSuccess(res, {
  message: "Usuário banido.",
});
```

}
);

app.post(
"/api/admin/users/:id/unban",
authenticateToken,
requireAdmin,
(req, res) => {
const result = unbanUser(req.params.id);

```
if (!result.success) {
  return sendError(res, 400, result.message);
}

return sendSuccess(res, {
  message: "Usuário desbanido.",
});
```

}
);

app.post(
"/api/admin/users/:id/suspend",
authenticateToken,
requireAdmin,
(req, res) => {
const result = suspendUser(
req.params.id,
req.body.reason || "Conta suspensa."
);

```
if (!result.success) {
  return sendError(res, 400, result.message);
}

return sendSuccess(res, {
  message: "Usuário suspenso.",
});
```

}
);

app.post(
"/api/admin/users/:id/unsuspend",
authenticateToken,
requireAdmin,
(req, res) => {
const result = unsuspendUser(req.params.id);

```
if (!result.success) {
  return sendError(res, 400, result.message);
}

return sendSuccess(res, {
  message: "Suspensão removida.",
});
```

}
);

app.delete(
"/api/admin/products/:id",
authenticateToken,
requireAdmin,
(req, res) => {
const result = removeProduct(req.params.id);

```
if (!result.success) {
  return sendError(res, 400, result.message);
}

return sendSuccess(res, {
  message: "Produto removido pela administração.",
});
```

}
);

/* =========================
EMAIL
========================= */

app.get(
"/api/admin/email-status",
authenticateToken,
requireAdmin,
async (req, res) => {
try {
const configured = await verifyEmailConnection();

```
  return res.json({
    success: true,
    configured,
  });
} catch (error) {
  return sendError(
    res,
    500,
    "Erro ao verificar email."
  );
}
```

}
);

/* =========================
FRONTEND
========================= */

const frontendPath = path.join(__dirname, "..");

app.use(express.static(frontendPath));

app.use((req, res, next) => {
if (
req.path.startsWith("/api/") ||
req.method !== "GET"
) {
return next();
}

return res.sendFile(
path.join(frontendPath, "index.html")
);
});

/* =========================
ERROS
========================= */

app.use((err, req, res, next) => {
console.error("SERVER ERROR:", err);

if (res.headersSent) {
return next(err);
}

return res.status(500).json({
success: false,
message: "Erro interno do servidor.",
});
});

/* =========================
START
========================= */

app.listen(PORT, "0.0.0.0", () => {
console.log("=================================");
console.log("SLAXSTORE API ONLINE");
console.log(`Porta: ${PORT}`);
console.log("=================================");
});
