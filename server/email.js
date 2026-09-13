const nodemailer = require("nodemailer");

const verificationCodes = new Map();

function generateCode() {
return String(
Math.floor(
100000 +
Math.random() * 900000
)
);
}

function createTransport() {
const host =
process.env.SMTP_HOST;

const user =
process.env.SMTP_USER;

const pass =
process.env.SMTP_PASS;

const port =
Number(
process.env.SMTP_PORT || 587
);

/*

* Se SMTP não estiver configurado,
* o sistema funciona em modo de teste.
  */
  if (
  !host ||
  !user ||
  !pass
  ) {
  return null;
  }

return nodemailer.createTransport({
host,
port,

```
secure:
  port === 465,

auth: {
  user,
  pass
}
```

});
}

async function sendVerificationCode(
email
) {
const normalizedEmail =
String(email)
.trim()
.toLowerCase();

const code =
generateCode();

verificationCodes.set(
normalizedEmail,
{
code,

```
  expiresAt:
    Date.now() +
    10 * 60 * 1000
}
```

);

const transporter =
createTransport();

/*

* MODO DE TESTE
  */
  if (!transporter) {
  console.log("");
  console.log(
  "======================================"
  );
  console.log(
  "SLAXSTORE - CÓDIGO DE VERIFICAÇÃO"
  );
  console.log(
  `E-mail: ${normalizedEmail}`
  );
  console.log(
  `Código: ${code}`
  );
  console.log(
  "======================================"
  );
  console.log("");

```
return {
```

```
  sent: false,
  developmentCode: code
};
```

}

/*

* ENVIO REAL
  */
  await transporter.sendMail({
  from:
  process.env.EMAIL_FROM ||
  process.env.SMTP_USER,

```
to: normalizedEmail,
```

```
subject:
  "Código de verificação — SlaxStore",

html: `
  <!DOCTYPE html>
  <html>
  <body style="
    margin:0;
    padding:30px;
    background:#060a10;
    font-family:Arial,sans-serif;
    color:#ffffff;
  ">

    <div style="
      max-width:500px;
      margin:auto;
      background:#0d131d;
      border:1px solid #1c2b40;
      border-radius:18px;
      padding:30px;
      text-align:center;
    ">

      <h1 style="
        color:#087cff;
        margin-top:0;
      ">
        SlaxStore
      </h1>

      <p>
        Use o código abaixo para
        verificar seu e-mail:
      </p>

      <div style="
        display:inline-block;
        padding:18px 25px;
        margin:20px 0;
        border-radius:12px;
        background:#111a27;
        color:#ffffff;
        font-size:32px;
        font-weight:bold;
        letter-spacing:8px;
      ">
        ${code}
      </div>

      <p style="
        color:#8493a8;
      ">
        Este código expira em 10 minutos.
      </p>

    </div>

  </body>
  </html>
`
```

});

return {
sent: true
};
}

function verifyCode(
email,
code
) {
const normalizedEmail =
String(email)
.trim()
.toLowerCase();

const stored =
verificationCodes.get(
normalizedEmail
);

if (!stored) {
return false;
}

if (
Date.now() >
stored.expiresAt
) {
verificationCodes.delete(
normalizedEmail
);

```
return false;
```

}

const correct =
stored.code ===
String(code).trim();

if (correct) {
verificationCodes.delete(
normalizedEmail
);
}

return correct;
}

module.exports = {
sendVerificationCode,
verifyCode
};
