const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const {
readDb,
writeDb,
now
} = require("./database");

const {
registerUser,
loginUser,
verifyEmail,
resendVerificationCode,
authenticateToken,
requireAdmin,
publicUser,
findUserById,
findUserByEmail
} = require("./auth");

const {
sendVerificationEmail,
sendPasswordResetEmail
} = require("./email");

const {
getProducts,
getProductById,
createProduct,
updateProduct,
removeProduct
} = require("./products");

const {
createOrder,
getOrdersForUser,
getPurchasedOrders,
getSoldOrders,
getOrderById,
getAllOrders
} = require("./orders");

const {
moderationMiddleware,
banUser,
unbanUser,
suspendUser,
clearSuspension,
getModerationRecords,
deleteProductForModeration
} = require("./moderation");

const app = express();

const PORT = Number(process.env.PORT) || 3000;

app.set("trust proxy", 1);

app.use(
cors({
origin: true,
credentials: true
})
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
res.setHeader(
"X-Powered-By",
"SlaxStore"
);

next();
});

app.use((req, res, next) => {
if (
req.path.startsWith("/api/") &&
req.path !== "/api/health"
) {
return authenticateTokenOptional(
req,
res,
next
);
}

next();
});

function authenticateTokenOptional(
req,
res,
next
) {
const authorization =
req.headers.authorization || "";

if (!authorization.startsWith("Bearer ")) {
return next();
}

authenticateToken(req, res, () => {
next();
});
}

function errorMessage(error) {
return (
error?.message ||
"Ocorreu um erro inesperado."
);
}

function sendError(
res,
error,
status = 400
) {
console.error(error);

return res.status(status).json({
success: false,
message: errorMessage(error)
});
}

function requireAuthenticated(
req,
res,
next
) {
if (!req.user) {
return res.status(401).json({
success: false,
message: "Você precisa estar logado."
});
}

next();
}

app.get(
"/api/health",
(req, res) => {
res.json({
online: true,
name: "SlaxStore API",
version: "3.0.0",
time: now()
});
}
);

/* =========================
AUTH
========================= */

app.post(
"/api/auth/register",
async (req, res) => {
try {
const result = registerUser({
name: req.body.name,
email: req.body.email,
password: req.body.password
});

```
  let emailResult = null;

  try {
    emailResult =
      await sendVerificationEmail({
        to: result.user.email,
        name: result.user.name,
        code: result.verificationCode
      });
  } catch (emailError) {
    console.error(
      "Erro ao enviar e-mail:",
      emailError.message
    );
  }

  res.status(201).json({
    success: true,
    message:
      "Conta criada. Verifique seu e-mail.",
    user: result.user,
    emailSent:
      emailResult?.sent || false,
    developmentCode:
      emailResult?.development
        ? result.verificationCode
        : undefined
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

app.post(
"/api/auth/login",
(req, res) => {
try {
const result = loginUser({
email: req.body.email,
password: req.body.password
});

```
  res.json({
    success: true,
    message:
      "Login realizado com sucesso.",
    token: result.token,
    user: result.user
  });
} catch (error) {
  if (
    error.code ===
    "EMAIL_NOT_VERIFIED"
  ) {
    return res.status(403).json({
      success: false,
      message: error.message,
      code: "EMAIL_NOT_VERIFIED",
      user: error.user
    });
  }

  sendError(res, error, 401);
}
```

}
);

app.post(
"/api/auth/verify-email",
async (req, res) => {
try {
const result = verifyEmail({
email: req.body.email,
code: req.body.code
});

```
  res.json({
    success: true,
    message:
      "E-mail verificado com sucesso.",
    token: result.token,
    user: result.user
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

app.post(
"/api/auth/resend-code",
async (req, res) => {
try {
const result =
resendVerificationCode(
req.body.email
);

```
  let emailResult = null;

  try {
    emailResult =
      await sendVerificationEmail({
        to: result.user.email,
        name: result.user.name,
        code: result.verificationCode
      });
  } catch (emailError) {
    console.error(
      "Erro ao enviar código:",
      emailError.message
    );
  }

  res.json({
    success: true,
    message:
      "Novo código enviado.",
    emailSent:
      emailResult?.sent || false,
    developmentCode:
      emailResult?.development
        ? result.verificationCode
        : undefined
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

app.post(
"/api/auth/logout",
(req, res) => {
res.json({
success: true,
message: "Logout realizado."
});
}
);

app.get(
"/api/auth/me",
requireAuthenticated,
(req, res) => {
res.json({
success: true,
user: publicUser(req.user)
});
}
);

/* =========================
PROFILE
========================= */

app.get(
"/api/profile",
requireAuthenticated,
moderationMiddleware,
(req, res) => {
res.json({
success: true,
user: publicUser(req.user)
});
}
);

/* =========================
PRODUCTS
========================= */

app.get(
"/api/products",
(req, res) => {
try {
const products = getProducts({
category:
req.query.category ||
req.query.categoria ||
null,
search:
req.query.search ||
null,
sellerId:
req.query.sellerId ||
null
});

```
  res.json({
    success: true,
    products
  });
} catch (error) {
  sendError(res, error, 500);
}
```

}
);

app.get(
"/api/products/search",
(req, res) => {
try {
const products = getProducts({
search:
req.query.q ||
req.query.search ||
""
});

```
  res.json({
    success: true,
    products
  });
} catch (error) {
  sendError(res, error, 500);
}
```

}
);

app.get(
"/api/products/:id",
(req, res) => {
try {
const product =
getProductById(req.params.id);

```
  if (!product) {
    return res.status(404).json({
      success: false,
      message:
        "Produto não encontrado."
    });
  }

  res.json({
    success: true,
    product
  });
} catch (error) {
  sendError(res, error, 500);
}
```

}
);

app.post(
"/api/products",
requireAuthenticated,
moderationMiddleware,
(req, res) => {
try {
const product = createProduct({
sellerId: req.user.id,
sellerName: req.user.name,
name:
req.body.name ||
req.body.nome,
description:
req.body.description ||
req.body.descricao,
price:
req.body.price ??
req.body.preco,
category:
req.body.category ||
req.body.categoria,
image:
req.body.image ||
req.body.imageUrl ||
req.body.imagem ||
""
});

```
  res.status(201).json({
    success: true,
    message:
      "Produto publicado com sucesso.",
    product
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

app.put(
"/api/products/:id",
requireAuthenticated,
moderationMiddleware,
(req, res) => {
try {
const product =
updateProduct(
req.params.id,
req.user.id,
req.body
);

```
  res.json({
    success: true,
    message:
      "Produto atualizado.",
    product
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

app.delete(
"/api/products/:id",
requireAuthenticated,
moderationMiddleware,
(req, res) => {
try {
const result =
removeProduct(
req.params.id,
req.user.id
);

```
  res.json(result);
} catch (error) {
  sendError(res, error);
}
```

}
);

/* =========================
PURCHASES
========================= */

app.post(
"/api/products/:id/buy",
requireAuthenticated,
moderationMiddleware,
(req, res) => {
try {
const result = createOrder({
buyerId: req.user.id,
productId: req.params.id
});

```
  res.json({
    success: true,
    message:
      "Compra realizada com sucesso.",
    order: result.order,
    product: result.product,
    balance:
      result.buyerBalance
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

/* =========================
ORDERS
========================= */

app.get(
"/api/orders",
requireAuthenticated,
(req, res) => {
try {
res.json({
success: true,
orders:
getOrdersForUser(
req.user.id
)
});
} catch (error) {
sendError(res, error, 500);
}
}
);

app.get(
"/api/orders/purchases",
requireAuthenticated,
(req, res) => {
try {
res.json({
success: true,
orders:
getPurchasedOrders(
req.user.id
)
});
} catch (error) {
sendError(res, error, 500);
}
}
);

app.get(
"/api/orders/sales",
requireAuthenticated,
(req, res) => {
try {
res.json({
success: true,
orders:
getSoldOrders(
req.user.id
)
});
} catch (error) {
sendError(res, error, 500);
}
}
);

app.get(
"/api/orders/:id",
requireAuthenticated,
(req, res) => {
try {
const order =
getOrderById(
req.params.id,
req.user.id
);

```
  if (!order) {
    return res.status(404).json({
      success: false,
      message:
        "Pedido não encontrado."
    });
  }

  res.json({
    success: true,
    order
  });
} catch (error) {
  sendError(res, error, 500);
}
```

}
);

/* =========================
WALLET
========================= */

app.post(
"/api/wallet/withdraw",
requireAuthenticated,
moderationMiddleware,
(req, res) => {
try {
const amount = Math.round(
Number(
req.body.amount ??
req.body.valor
)
);

```
  if (
    !Number.isFinite(amount) ||
    amount < 200
  ) {
    return res.status(400).json({
      success: false,
      message:
        "O saque mínimo é R$ 2,00."
    });
  }

  const pixKey = String(
    req.body.pixKey ||
    req.body.pix ||
    ""
  ).trim();

  if (!pixKey) {
    return res.status(400).json({
      success: false,
      message:
        "Informe sua chave Pix."
    });
  }

  const db = readDb();

  const user = db.users.find(
    (item) =>
      Number(item.id) ===
      Number(req.user.id)
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message:
        "Usuário não encontrado."
    });
  }

  const balance = Number(
    user.balance || 0
  );

  if (balance < amount) {
    return res.status(400).json({
      success: false,
      message:
        "Saldo insuficiente."
    });
  }

  user.balance =
    balance - amount;

  user.updatedAt = now();

  const withdrawal = {
    id:
      Date.now().toString(36) +
      Math.random()
        .toString(36)
        .slice(2, 8),
    userId: Number(user.id),
    amount,
    pixKey,
    status: "pending",
    createdAt: now(),
    updatedAt: now()
  };

  db.withdrawals.push(
    withdrawal
  );

  writeDb(db);

  res.json({
    success: true,
    message:
      "Solicitação de saque enviada.",
    balance: user.balance,
    withdrawal
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

/* =========================
ADMIN
========================= */

app.get(
"/api/admin/orders",
requireAuthenticated,
requireAdmin,
(req, res) => {
try {
res.json({
success: true,
orders: getAllOrders()
});
} catch (error) {
sendError(res, error, 500);
}
}
);

app.get(
"/api/admin/withdrawals",
requireAuthenticated,
requireAdmin,
(req, res) => {
try {
const db = readDb();

```
  res.json({
    success: true,
    withdrawals:
      db.withdrawals || []
  });
} catch (error) {
  sendError(res, error, 500);
}
```

}
);

app.post(
"/api/admin/withdrawals/:id/approve",
requireAuthenticated,
requireAdmin,
(req, res) => {
try {
const db = readDb();

```
  const withdrawal =
    db.withdrawals.find(
      (item) =>
        String(item.id) ===
        String(req.params.id)
    );

  if (!withdrawal) {
    return res.status(404).json({
      success: false,
      message:
        "Saque não encontrado."
    });
  }

  withdrawal.status = "approved";
  withdrawal.approvedBy =
    req.user.id;
  withdrawal.updatedAt = now();

  writeDb(db);

  res.json({
    success: true,
    message:
      "Saque aprovado.",
    withdrawal
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

app.post(
"/api/admin/withdrawals/:id/reject",
requireAuthenticated,
requireAdmin,
(req, res) => {
try {
const db = readDb();

```
  const withdrawal =
    db.withdrawals.find(
      (item) =>
        String(item.id) ===
        String(req.params.id)
    );

  if (!withdrawal) {
    return res.status(404).json({
      success: false,
      message:
        "Saque não encontrado."
    });
  }

  if (
    withdrawal.status ===
    "rejected"
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Este saque já foi rejeitado."
    });
  }

  if (
    withdrawal.status ===
    "approved"
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Este saque já foi aprovado."
    });
  }

  const user = db.users.find(
    (item) =>
      Number(item.id) ===
      Number(withdrawal.userId)
  );

  if (user) {
    user.balance =
      Number(user.balance || 0) +
      Number(withdrawal.amount || 0);

    user.updatedAt = now();
  }

  withdrawal.status = "rejected";
  withdrawal.rejectedBy =
    req.user.id;
  withdrawal.reason =
    String(
      req.body.reason ||
      "Saque rejeitado."
    );
  withdrawal.updatedAt = now();

  writeDb(db);

  res.json({
    success: true,
    message:
      "Saque rejeitado e saldo devolvido.",
    withdrawal
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

app.post(
"/api/admin/users/:id/ban",
requireAuthenticated,
requireAdmin,
(req, res) => {
try {
const user =
banUser(
req.params.id,
req.body.reason,
req.user.id
);

```
  res.json({
    success: true,
    message:
      "Usuário banido.",
    user: publicUser(user)
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

app.post(
"/api/admin/users/:id/unban",
requireAuthenticated,
requireAdmin,
(req, res) => {
try {
const user =
unbanUser(
req.params.id,
req.user.id
);

```
  res.json({
    success: true,
    message:
      "Usuário desbanido.",
    user: publicUser(user)
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

app.post(
"/api/admin/users/:id/suspend",
requireAuthenticated,
requireAdmin,
(req, res) => {
try {
const user =
suspendUser(
req.params.id,
req.body.durationMinutes,
req.body.reason,
req.user.id
);

```
  res.json({
    success: true,
    message:
      "Usuário suspenso.",
    user: publicUser(user)
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

app.post(
"/api/admin/users/:id/unsuspend",
requireAuthenticated,
requireAdmin,
(req, res) => {
try {
const user =
clearSuspension(
req.params.id,
req.user.id
);

```
  res.json({
    success: true,
    message:
      "Suspensão removida.",
    user: publicUser(user)
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

app.get(
"/api/admin/users/:id/moderation",
requireAuthenticated,
requireAdmin,
(req, res) => {
try {
res.json({
success: true,
records:
getModerationRecords(
req.params.id
)
});
} catch (error) {
sendError(res, error, 500);
}
}
);

app.post(
"/api/admin/products/:id/remove",
requireAuthenticated,
requireAdmin,
(req, res) => {
try {
const product =
deleteProductForModeration(
req.params.id,
req.user.id,
req.body.reason
);

```
  res.json({
    success: true,
    message:
      "Produto removido pela moderação.",
    product
  });
} catch (error) {
  sendError(res, error);
}
```

}
);

/* =========================
ERROR HANDLERS
========================= */

app.use(
"/api",
(req, res) => {
res.status(404).json({
success: false,
message:
"Endpoint da API não encontrado."
});
}
);

const publicDirectory = path.join(
__dirname,
".."
);

app.use(
express.static(publicDirectory)
);

app.get(
"/",
(req, res) => {
res.sendFile(
path.join(
publicDirectory,
"index.html"
)
);
}
);

app.use(
(error, req, res, next) => {
console.error(
"Erro interno:",
error
);

```
if (res.headersSent) {
  return next(error);
}

res.status(500).json({
  success: false,
  message:
    "Erro interno do servidor."
});
```

}
);

app.listen(
PORT,
"0.0.0.0",
() => {
console.log(
"================================="
);
console.log(
"SLAXSTORE API ONLINE"
);
console.log(
`Porta: ${PORT}`
);
console.log(
"================================="
);
}
);
