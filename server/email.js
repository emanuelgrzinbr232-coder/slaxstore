const nodemailer = require("nodemailer");

let transporter = null;

function createTransporter() {
if (transporter) {
return transporter;
}

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

if (!host || !user || !pass) {
return null;
}

transporter = nodemailer.createTransport({
host,
port,
secure: port === 465,
auth: {
user,
pass
}
});

return transporter;
}

async function sendVerificationEmail({
to,
name,
code
}) {
const mailer = createTransporter();

/*

* Se o SMTP ainda não estiver configurado,
* mostramos o código no console para testes.
  */
  if (!mailer) {
  console.log("=================================");
  console.log("SLAXSTORE - CÓDIGO DE VERIFICAÇÃO");
  console.log("E-mail:", to);
  console.log("Código:", code);
  console.log("=================================");

```
return {
```

```
  sent: false,
  development: true,
  code
};
```

}

const from =
process.env.SMTP_FROM ||
process.env.SMTP_USER;

await mailer.sendMail({
from: `"SlaxStore" <${from}>`,
to,
subject: "Código de verificação - SlaxStore",
text: `Olá ${name || ""}!

Seu código de verificação do SlaxStore é:

${code}

Esse código expira em 15 minutos.

Se você não criou uma conta no SlaxStore, ignore este e-mail.

SlaxStore`,
    html: ` <div style="
     background:#05070d;
     padding:40px 20px;
     font-family:Arial,sans-serif;
     color:#ffffff;
   "> <div style="
       max-width:520px;
       margin:auto;
       background:#0b1020;
       border:1px solid #1d2b4d;
       border-radius:18px;
       padding:30px;
       text-align:center;
     "> <h1 style="
         margin:0 0 10px;
         color:#3b82f6;
       ">
SLAXSTORE </h1>

```
      <p style="
        color:#b8c2d9;
        font-size:16px;
      ">
        Olá ${name || ""}! Confirme seu endereço de e-mail.
      </p>

      <div style="
        margin:30px 0;
        padding:20px;
        border-radius:14px;
        background:#070b14;
        border:1px solid #243657;
      ">
        <div style="
          color:#8fa3c7;
          font-size:13px;
          margin-bottom:10px;
        ">
          SEU CÓDIGO
        </div>

        <strong style="
          font-size:34px;
          letter-spacing:8px;
          color:#ffffff;
        ">
          ${code}
        </strong>
      </div>

      <p style="
        color:#8fa3c7;
        font-size:13px;
      ">
        Este código expira em 15 minutos.
      </p>

      <p style="
        color:#687895;
        font-size:12px;
        margin-top:25px;
      ">
        Se você não criou uma conta no SlaxStore,
        ignore este e-mail.
      </p>
    </div>
  </div>
`
```

});

return {
sent: true,
development: false
};
}

async function sendPasswordResetEmail({
to,
name,
code
}) {
const mailer = createTransporter();

if (!mailer) {
console.log("=================================");
console.log("SLAXSTORE - CÓDIGO DE RECUPERAÇÃO");
console.log("E-mail:", to);
console.log("Código:", code);
console.log("=================================");

```
return {
  sent: false,
  development: true,
  code
};
```

}

const from =
process.env.SMTP_FROM ||
process.env.SMTP_USER;

await mailer.sendMail({
from: `"SlaxStore" <${from}>`,
to,
subject: "Recuperação de senha - SlaxStore",
text: `Olá ${name || ""}!

Seu código para recuperar sua senha do SlaxStore é:

${code}

Esse código expira em 15 minutos.

Se você não solicitou a recuperação, ignore este e-mail.

SlaxStore`,
    html: ` <div style="
     background:#05070d;
     padding:40px 20px;
     font-family:Arial,sans-serif;
     color:#ffffff;
   "> <div style="
       max-width:520px;
       margin:auto;
       background:#0b1020;
       border:1px solid #1d2b4d;
       border-radius:18px;
       padding:30px;
       text-align:center;
     "> <h1 style="
         margin:0 0 10px;
         color:#3b82f6;
       ">
SLAXSTORE </h1>

```
      <p style="color:#b8c2d9;">
        Solicitação de recuperação de senha.
      </p>

      <div style="
        margin:30px 0;
        padding:20px;
        border-radius:14px;
        background:#070b14;
        border:1px solid #243657;
      ">
        <div style="
          color:#8fa3c7;
          font-size:13px;
          margin-bottom:10px;
        ">
          CÓDIGO
        </div>

        <strong style="
          font-size:34px;
          letter-spacing:8px;
        ">
          ${code}
        </strong>
      </div>

      <p style="
        color:#8fa3c7;
        font-size:13px;
      ">
        Este código expira em 15 minutos.
      </p>
    </div>
  </div>
`
```

});

return {
sent: true,
development: false
};
}

async function verifyEmailConnection() {
const mailer = createTransporter();

if (!mailer) {
return false;
}

try {
await mailer.verify();
return true;
} catch (error) {
console.error(
"SMTP indisponível:",
error.message
);

```
return false;
```

}
}

module.exports = {
sendVerificationEmail,
sendPasswordResetEmail,
verifyEmailConnection
};
