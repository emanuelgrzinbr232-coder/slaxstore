const { readDb, writeDb, nextId, now } = require("./database");

function createModerationRecord({
userId,
action,
reason = "",
moderatorId = null,
metadata = {}
}) {
const db = readDb();

const record = {
id: nextId("moderation"),
userId: Number(userId),
action: String(action || "unknown"),
reason: String(reason || ""),
moderatorId: moderatorId ? Number(moderatorId) : null,
metadata,
createdAt: now()
};

db.moderation.push(record);

writeDb(db);

return record;
}

function getModerationRecords(userId = null) {
const db = readDb();

if (userId === null || userId === undefined) {
return db.moderation;
}

return db.moderation.filter(
(record) => Number(record.userId) === Number(userId)
);
}

function banUser(userId, reason, moderatorId = null) {
const db = readDb();

const user = db.users.find(
(item) => Number(item.id) === Number(userId)
);

if (!user) {
throw new Error("Usuário não encontrado.");
}

user.banned = true;
user.banReason = String(reason || "Violação das regras.");
user.bannedAt = now();
user.updatedAt = now();

writeDb(db);

createModerationRecord({
userId: user.id,
action: "ban",
reason: user.banReason,
moderatorId
});

return user;
}

function unbanUser(userId, moderatorId = null) {
const db = readDb();

const user = db.users.find(
(item) => Number(item.id) === Number(userId)
);

if (!user) {
throw new Error("Usuário não encontrado.");
}

user.banned = false;
user.banReason = null;
user.bannedAt = null;
user.updatedAt = now();

writeDb(db);

createModerationRecord({
userId: user.id,
action: "unban",
reason: "Banimento removido.",
moderatorId
});

return user;
}

function suspendUser(
userId,
durationMinutes,
reason,
moderatorId = null
) {
const db = readDb();

const user = db.users.find(
(item) => Number(item.id) === Number(userId)
);

if (!user) {
throw new Error("Usuário não encontrado.");
}

const duration = Number(durationMinutes);

if (!Number.isFinite(duration) || duration <= 0) {
throw new Error("Duração da suspensão inválida.");
}

user.suspendedUntil =
Date.now() + duration * 60 * 1000;

user.suspensionReason =
String(reason || "Violação das regras.");

user.updatedAt = now();

writeDb(db);

createModerationRecord({
userId: user.id,
action: "suspend",
reason: user.suspensionReason,
moderatorId,
metadata: {
durationMinutes: duration,
suspendedUntil: user.suspendedUntil
}
});

return user;
}

function clearSuspension(userId, moderatorId = null) {
const db = readDb();

const user = db.users.find(
(item) => Number(item.id) === Number(userId)
);

if (!user) {
throw new Error("Usuário não encontrado.");
}

user.suspendedUntil = null;
user.suspensionReason = null;
user.updatedAt = now();

writeDb(db);

createModerationRecord({
userId: user.id,
action: "unsuspend",
reason: "Suspensão removida.",
moderatorId
});

return user;
}

function isUserBlocked(user) {
if (!user) {
return {
blocked: true,
reason: "Usuário não encontrado."
};
}

if (user.banned === true) {
return {
blocked: true,
reason:
user.banReason ||
"Sua conta foi banida."
};
}

if (
user.suspendedUntil &&
Number(user.suspendedUntil) > Date.now()
) {
const remainingMs =
Number(user.suspendedUntil) - Date.now();

```
const remainingMinutes = Math.ceil(
  remainingMs / 60000
);

return {
  blocked: true,
  reason:
    user.suspensionReason ||
    "Sua conta está temporariamente suspensa.",
  remainingMinutes
};
```

}

return {
blocked: false,
reason: null
};
}

function moderationMiddleware(req, res, next) {
if (!req.user) {
return next();
}

const status = isUserBlocked(req.user);

if (!status.blocked) {
return next();
}

return res.status(403).json({
success: false,
message: status.reason,
moderation: {
blocked: true,
remainingMinutes:
status.remainingMinutes || null
}
});
}

function deleteProductForModeration(
productId,
moderatorId = null,
reason = "Produto removido pela moderação."
) {
const db = readDb();

const index = db.products.findIndex(
(product) =>
Number(product.id) === Number(productId)
);

if (index === -1) {
throw new Error("Produto não encontrado.");
}

const product = db.products[index];

product.moderated = true;
product.moderationReason = reason;
product.moderatedAt = now();
product.updatedAt = now();

db.products[index] = product;

writeDb(db);

if (product.sellerId) {
createModerationRecord({
userId: product.sellerId,
action: "product_removed",
reason,
moderatorId,
metadata: {
productId: product.id,
productName: product.name
}
});
}

return product;
}

module.exports = {
createModerationRecord,
getModerationRecords,
banUser,
unbanUser,
suspendUser,
clearSuspension,
isUserBlocked,
moderationMiddleware,
deleteProductForModeration
};
