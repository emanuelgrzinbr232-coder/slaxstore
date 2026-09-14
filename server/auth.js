const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { readDb, writeDb, nextId, now } = require("./database");

const JWT_SECRET =
process.env.JWT_SECRET || "slaxstore-secret-change-this-in-production";

const TOKEN_EXPIRES_IN = "7d";

function cleanEmail(email) {
return String(email || "").trim().toLowerCase();
}

function cleanName(name) {
return String(name || "").trim();
}

function generateVerificationCode() {
return String(Math.floor(100000 + Math.random() * 900000));
}

function createToken(user) {
return jwt.sign(
{
id: user.id,
email: user.email
},
JWT_SECRET,
{
expiresIn: TOKEN_EXPIRES_IN
}
);
}

function publicUser(user) {
if (!user) return null;

return {
id: user.id,
name: user.name,
email: user.email,
verified: !!user.verified,
balance: Number(user.balance || 0),
role: user.role || "user",
createdAt: user.createdAt
};
}

function findUserById(id) {
const db = readDb();

return (
db.users.find(
(user) => Number(user.id) === Number(id)
) || null
);
}

function findUserByEmail(email) {
const db = readDb();
const normalizedEmail = cleanEmail(email);

return (
db.users.find(
(user) => cleanEmail(user.email) === normalizedEmail
) || null
);
}

function registerUser({ name, email, password }) {
const cleanUserName = cleanName(name);
const cleanUserEmail = cleanEmail(email);
const cleanPassword = String(password || "");

if (cleanUserName.length < 2) {
throw new Error("Nome inválido.");
}

if (cleanUserName.length > 40) {
throw new Error("O nome deve ter no máximo 40 caracteres.");
}

if (!cleanUserEmail || !cleanUserEmail.includes("@")) {
throw new Error("E-mail inválido.");
}

if (cleanPassword.length < 6) {
throw new Error("A senha deve ter pelo menos 6 caracteres.");
}

if (cleanPassword.length > 100) {
throw new Error("A senha é muito longa.");
}

const existingUser = findUserByEmail(cleanUserEmail);

if (existingUser) {
throw new Error("Este e-mail já está cadastrado.");
}

const db = readDb();

const passwordHash = bcrypt.hashSync(cleanPassword, 12);

const verificationCode = generateVerificationCode();

const user = {
id: nextId("user"),
name: cleanUserName,
email: cleanUserEmail,
passwordHash,
verified: false,
verificationCode,
verificationExpiresAt: Date.now() + 15 * 60 * 1000,
balance: 0,
role: "user",
createdAt: now(),
updatedAt: now()
};

db.users.push(user);

writeDb(db);

return {
user: publicUser(user),
verificationCode
};
}

function loginUser({ email, password }) {
const cleanUserEmail = cleanEmail(email);
const cleanPassword = String(password || "");

const user = findUserByEmail(cleanUserEmail);

if (!user) {
throw new Error("E-mail ou senha incorretos.");
}

const validPassword = bcrypt.compareSync(
cleanPassword,
user.passwordHash
);

if (!validPassword) {
throw new Error("E-mail ou senha incorretos.");
}

if (!user.verified) {
const error = new Error(
"Verifique seu e-mail antes de entrar."
);

```
error.code = "EMAIL_NOT_VERIFIED";
error.user = publicUser(user);

throw error;
```

}

const token = createToken(user);

return {
token,
user: publicUser(user)
};
}

function verifyEmail({ email, code }) {
const cleanUserEmail = cleanEmail(email);
const cleanCode = String(code || "").trim();

const db = readDb();

const user = db.users.find(
(item) => cleanEmail(item.email) === cleanUserEmail
);

if (!user) {
throw new Error("Usuário não encontrado.");
}

if (user.verified) {
const token = createToken(user);

```
return {
  token,
  user: publicUser(user)
};
```

}

if (!user.verificationCode) {
throw new Error("Código de verificação não encontrado.");
}

if (
!user.verificationExpiresAt ||
Date.now() > Number(user.verificationExpiresAt)
) {
throw new Error(
"O código expirou. Solicite um novo código."
);
}

if (cleanCode !== String(user.verificationCode)) {
throw new Error("Código de verificação inválido.");
}

user.verified = true;
user.verificationCode = null;
user.verificationExpiresAt = null;
user.updatedAt = now();

writeDb(db);

const token = createToken(user);

return {
token,
user: publicUser(user)
};
}

function resendVerificationCode(email) {
const cleanUserEmail = cleanEmail(email);

const db = readDb();

const user = db.users.find(
(item) => cleanEmail(item.email) === cleanUserEmail
);

if (!user) {
throw new Error("Usuário não encontrado.");
}

if (user.verified) {
throw new Error("Este e-mail já foi verificado.");
}

const verificationCode = generateVerificationCode();

user.verificationCode = verificationCode;
user.verificationExpiresAt =
Date.now() + 15 * 60 * 1000;
user.updatedAt = now();

writeDb(db);

return {
user: publicUser(user),
verificationCode
};
}

function authenticateToken(req, res, next) {
try {
const authorization = req.headers.authorization || "";

```
if (!authorization.startsWith("Bearer ")) {
  return res.status(401).json({
    success: false,
    message: "Token não fornecido."
  });
}

const token = authorization.substring(7).trim();

if (!token) {
  return res.status(401).json({
    success: false,
    message: "Token inválido."
  });
}

const decoded = jwt.verify(token, JWT_SECRET);

const user = findUserById(decoded.id);

if (!user) {
  return res.status(401).json({
    success: false,
    message: "Usuário não encontrado."
  });
}

req.user = user;

next();
```

} catch (error) {
return res.status(401).json({
success: false,
message: "Sessão inválida ou expirada."
});
}
}

function requireAdmin(req, res, next) {
if (!req.user) {
return res.status(401).json({
success: false,
message: "Não autenticado."
});
}

if (req.user.role !== "admin") {
return res.status(403).json({
success: false,
message: "Acesso permitido somente para administradores."
});
}

next();
}

function logoutUser() {
return {
success: true
};
}

module.exports = {
JWT_SECRET,
createToken,
publicUser,
findUserById,
findUserByEmail,
registerUser,
loginUser,
verifyEmail,
resendVerificationCode,
authenticateToken,
requireAdmin,
logoutUser
};
