const {
readDb,
writeDb,
nextId,
now
} = require("./server-database");

const {
authRequired
} = require("./auth");

function adminRequired(
req,
res,
next
) {
const db = readDb();

const user =
db.users.find(
item =>
String(item.id) ===
String(req.auth.id)
);

if (
!user ||
!user.isAdmin
) {
return res.status(403).json({
error:
"Acesso restrito à administração."
});
}

req.adminUser =
user;

next();
}

function register(app) {
/*

* DENUNCIAR PRODUTO
  */
  app.post(
  "/api/moderation/report",
  authRequired,
  (req, res) => {
  const reason =
  String(
  req.body.reason || ""
  ).trim();

  const productId =
  String(
  req.body.productId || ""
  ).trim();

  if (!reason) {
  return res.status(400).json({
  error:
  "Informe o motivo da denúncia."
  });
  }

  const db = readDb();

  const report = {
  id:
  nextId(
  db,
  "moderation"
  ),

  reporterId:
  req.auth.id,

  productId:
  productId || null,

  reason,

  status:
  "pending",

  createdAt:
  now()
  };

  db.moderation.push(
  report
  );

  writeDb(db);

  res.status(201).json({
  message:
  "Denúncia enviada.",

  report
  });
  }
  );

/*

* LISTAR DENÚNCIAS
  */
  app.get(
  "/api/admin/moderation",
  authRequired,
  adminRequired,
  (req, res) => {
  const db = readDb();

  res.json({
  reports:
  db.moderation
  });
  }
  );

/*

* ALTERAR STATUS DA DENÚNCIA
  */
  app.patch(
  "/api/admin/moderation/:id",
  authRequired,
  adminRequired,
  (req, res) => {
  const db = readDb();

  const report =
  db.moderation.find(
  item =>
  String(item.id) ===
  String(req.params.id)
  );

  if (!report) {
  return res.status(404).json({
  error:
  "Denúncia não encontrada."
  });
  }

  const allowedStatuses = [
  "pending",
  "reviewing",
  "resolved",
  "rejected"
  ];

  const newStatus =
  String(
  req.body.status ||
  report.status
  );

  if (
  !allowedStatuses.includes(
  newStatus
  )
  ) {
  return res.status(400).json({
  error:
  "Status inválido."
  });
  }

  report.status =
  newStatus;

  writeDb(db);

  res.json({
  message:
  "Denúncia atualizada.",

  report
  });
  }
  );

/*

* ESTATÍSTICAS DO ADMIN
  */
  app.get(
  "/api/admin/stats",
  authRequired,
  adminRequired,
  (req, res) => {
  const db = readDb();

  res.json({
  users:
  db.users.length,

  products:
  db.products.filter(
  product =>
  product.status ===
  "active"
  ).length,

  orders:
  db.orders.length,

  pendingReports:
  db.moderation.filter(
  report =>
  report.status ===
  "pending"
  ).length,

  withdrawals:
  db.withdrawals.length
  });
  }
  );

/*

* LISTAR USUÁRIOS PARA ADMIN
  */
  app.get(
  "/api/admin/users",
  authRequired,
  adminRequired,
  (req, res) => {
  const db = readDb();

  const users =
  db.users.map(
  user => ({
  id: user.id,
  username:
  user.username,
  email:
  user.email,
  balance:
  Number(
  user.balance || 0
  ),
  verified:
  Boolean(
  user.verified
  ),
  isAdmin:
  Boolean(
  user.isAdmin
  ),
  createdAt:
  user.createdAt
  })
  );

  res.json({
  users
  });
  }
  );
  }

module.exports = {
register,
adminRequired
};
