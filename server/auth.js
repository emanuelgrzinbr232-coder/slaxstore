const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const {
readDb,
writeDb,
nextId,
now
} = require("./server-database");

const {
sendVerificationCode,
verifyCode
} = require("./email");

const JWT_SECRET =
process.env.JWT_SECRET ||
"SLAXSTORE_CHANGE_THIS_SECRET_BEFORE_PRODUCTION";

function cleanUser(user) {
if (!user) return null;

return {
id: user.id,
username: user.username,
nome: user.username,
email: user.email,

```
balance: Number(user.balance || 0),
saldo: Number(user.balance || 0),

verified: Boolean(user.verified),
isAdmin: Boolean(user.isAdmin),

createdAt: user.createdAt
```

};
}

function createToken(user) {
return jwt.sign(
{
id: user.id,
email: user.email
},
JWT_SECRET,
{
expiresIn: "30d"
}
);
}

function authRequired(req, res, next) {
const authorization =
req.headers.authorization || "";

if (!authorization.startsWith("Bearer ")) {
return res.status(401).json({
error: "Você precisa estar logado."
});
}

const token = authorization.substring(7);

try {
const decoded = jwt.verify(
token,
JWT_SECRET
);

```
req.auth = decoded;

next();
```

} catch (error) {
return res.status(401).json({
error: "Sua sessão expirou."
});
}
}

function optionalAuth(req, res, next) {
const authorization =
req.headers.authorization || "";

if (authorization.startsWith("Bearer ")) {
const token = authorization.substring(7);

```
try {
  req.auth = jwt.verify(
    token,
    JWT_SECRET
  );
} catch {}
```

}

next();
}

function findUser(db, id) {
return db.users.find(
user => String(user.id) === String(id)
);
}

function register(app) {
/*

* CADASTRO
  */
  app.post(
  "/api/auth/register",
  async (req, res) => {
  try {
  const username =
  String(req.body.username || "").trim();

  const email =
  String(req.body.email || "")
  .trim()
  .toLowerCase();

  const password =
  String(req.body.password || "");

  if (username.length < 3) {
  return res.status(400).json({
  error:
  "O nome de usuário precisa ter pelo menos 3 caracteres."
  });
  }

  if (username.length > 30) {
  return res.status(400).json({
  error:
  "O nome de usuário pode ter no máximo 30 caracteres."
  });
  }

  if (
  !/^[^\s@]+@[^\s@]+.[^\s@]+$/.test(
  email
  )
  ) {
  return res.status(400).json({
  error: "Digite um e-mail válido."
  });
  }

  if (password.length < 6) {
  return res.status(400).json({
  error:
  "A senha precisa ter pelo menos 6 caracteres."
  });
  }

  const db = readDb();

  const emailExists = db.users.some(
  user => user.email === email
  );

  if (emailExists) {
  return res.status(409).json({
  error:
  "Este e-mail já está cadastrado."
  });
  }

  const usernameExists = db.users.some(
  user =>
  user.username.toLowerCase() ===
  username.toLowerCase()
  );

  if (usernameExists) {
  return res.status(409).json({
  error:
  "Este nome de usuário já está em uso."
  });
  }

  const passwordHash =
  await bcrypt.hash(password, 12);

  const user = {
  id: nextId(db, "user"),

  ```
   username,
   email,

   passwordHash,

   balance: 0,

   verified: false,

   isAdmin: false,

   createdAt: now()
  ```

  };

  db.users.push(user);

  writeDb(db);

  const emailResult =
  await sendVerificationCode(email);

  res.status(201).json({
  message:
  "Conta criada. Verifique seu e-mail.",

  ```
   email,

   user: cleanUser(user),

   /*
    * Só aparece quando o SMTP não está configurado.
    * Serve para desenvolvimento/testes.
    */
   developmentCode:
     emailResult.developmentCode || null
  ```

  });
  } catch (error) {
  console.error(
  "Erro no cadastro:",
  error
  );

  res.status(500).json({
  error: "Erro ao criar sua conta."
  });
  }
  }
  );

/*

* LOGIN
  */
  app.post(
  "/api/auth/login",
  async (req, res) => {
  try {
  const email =
  String(req.body.email || "")
  .trim()
  .toLowerCase();

  const password =
  String(req.body.password || "");

  const db = readDb();

  const user = db.users.find(
  item => item.email === email
  );

  if (!user) {
  return res.status(401).json({
  error:
  "E-mail ou senha incorretos."
  });
  }

  const passwordCorrect =
  await bcrypt.compare(
  password,
  user.passwordHash
  );

  if (!passwordCorrect) {
  return res.status(401).json({
  error:
  "E-mail ou senha incorretos."
  });
  }

  const token =
  createToken(user);

  res.json({
  message:
  "Login realizado com sucesso.",

  ```
   token,

   user: cleanUser(user),

   requiresVerification:
     !user.verified
  ```

  });
  } catch (error) {
  console.error(
  "Erro no login:",
  error
  );

  res.status(500).json({
  error: "Erro ao entrar."
  });
  }
  }
  );

/*

* USUÁRIO LOGADO
  */
  app.get(
  "/api/auth/me",
  authRequired,
  (req, res) => {
  const db = readDb();

  const user =
  findUser(db, req.auth.id);

  if (!user) {
  return res.status(401).json({
  error:
  "Usuário não encontrado."
  });
  }

  res.json({
  user: cleanUser(user)
  });
  }
  );

/*

* VERIFICAR E-MAIL
  */
  app.post(
  "/api/auth/verify-email",
  (req, res) => {
  const email =
  String(req.body.email || "")
  .trim()
  .toLowerCase();

  const code =
  String(req.body.code || "").trim();

  if (
  !verifyCode(
  email,
  code
  )
  ) {
  return res.status(400).json({
  error:
  "Código inválido ou expirado."
  });
  }

  const db = readDb();

  const user = db.users.find(
  item => item.email === email
  );

  if (!user) {
  return res.status(404).json({
  error:
  "Usuário não encontrado."
  });
  }

  user.verified = true;

  writeDb(db);

  const token =
  createToken(user);

  res.json({
  message:
  "E-mail verificado com sucesso.",

  token,

  user: cleanUser(user)
  });
  }
  );

/*

* REENVIAR CÓDIGO
  */
  app.post(
  "/api/auth/resend-code",
  async (req, res) => {
  try {
  const email =
  String(req.body.email || "")
  .trim()
  .toLowerCase();

  const db = readDb();

  const user = db.users.find(
  item => item.email === email
  );

  if (!user) {
  return res.status(404).json({
  error:
  "E-mail não encontrado."
  });
  }

  if (user.verified) {
  return res.status(400).json({
  error:
  "Este e-mail já foi verificado."
  });
  }

  const result =
  await sendVerificationCode(
  email
  );

  res.json({
  message:
  "Novo código enviado.",

  ```
   developmentCode:
     result.developmentCode || null
  ```

  });
  } catch (error) {
  console.error(error);

  res.status(500).json({
  error:
  "Não foi possível enviar o código."
  });
  }
  }
  );

/*

* LOGOUT
*
* Como o login usa JWT, o logout no servidor
* apenas confirma a saída. O index.html remove
* o token do navegador.
  */
  app.post(
  "/api/auth/logout",
  authRequired,
  (_req, res) => {
  res.json({
  message:
  "Sessão encerrada."
  });
  }
  );

/*

* PERFIL PÚBLICO
  */
  app.get(
  "/api/auth/user/:id",
  optionalAuth,
  (req, res) => {
  const db = readDb();

  const user =
  findUser(
  db,
  req.params.id
  );

  if (!user) {
  return res.status(404).json({
  error:
  "Usuário não encontrado."
  });
  }

  res.json({
  user: cleanUser(user)
  });
  }
  );
  }

module.exports = {
register,
authRequired,
optionalAuth,
cleanUser
};
