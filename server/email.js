const https = require("https");

function getConfig() {
return {
apiKey: process.env.BREVO_API_KEY,
fromEmail: process.env.EMAIL_FROM || "SlaxStore [noreply@example.com](mailto:noreply@example.com)",
};
}

function parseFromEmail(value) {
const match = value.match(/<([^>]+)>/);

if (match) {
return {
email: match[1].trim(),
name: value.replace(match[0], "").trim() || "SlaxStore",
};
}

return {
email: value.trim(),
name: "SlaxStore",
};
}

function sendBrevoEmail({ to, subject, html }) {
return new Promise((resolve, reject) => {
const config = getConfig();

```
if (!config.apiKey) {
  return reject(
    new Error("BREVO_API_KEY não configurada no ambiente.")
  );
}

const sender = parseFromEmail(config.fromEmail);

const payload = JSON.stringify({
  sender: {
    name: sender.name,
    email: sender.email,
  },
  to: [
    {
      email: to,
    },
  ],
  subject,
  htmlContent: html,
});

const request = https.request(
  {
    hostname: "api.brevo.com",
    path: "/v3/smtp/email",
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": config.apiKey,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
    },
  },
  (response) => {
    let body = "";

    response.on("data", (chunk) => {
      body += chunk;
    });

    response.on("end", () => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        let data = {};

        try {
          data = body ? JSON.parse(body) : {};
        } catch {}

        resolve(data);
        return;
      }

      reject(
        new Error(
          `Brevo retornou HTTP ${response.statusCode}: ${body}`
        )
      );
    });
  }
);

request.on("error", reject);

request.write(payload);
request.end();
```

});
}

async function sendVerificationEmail(email, name, code) {
const safeName = String(name || "usuário");

return sendBrevoEmail({
to: email,
subject: "Seu código de verificação - SlaxStore",
html: ` <div style="font-family:Arial,sans-serif;background:#080b12;padding:30px;"> <div style="max-width:520px;margin:auto;background:#111827;border-radius:16px;padding:30px;color:white;"> <h1 style="color:#3b82f6;">SLAXSTORE</h1>

```
      <p>Olá, ${safeName}!</p>

      <p>Seu código de verificação é:</p>

      <div style="
        background:#0b1220;
        border:1px solid #2563eb;
        border-radius:12px;
        padding:18px;
        text-align:center;
        font-size:32px;
        font-weight:bold;
        letter-spacing:8px;
        color:#60a5fa;
      ">
        ${code}
      </div>

      <p style="color:#9ca3af;">
        Esse código é válido por alguns minutos.
      </p>

      <p style="color:#9ca3af;">
        Se você não criou uma conta na SlaxStore, ignore este email.
      </p>
    </div>
  </div>
`,
```

});
}

async function sendPasswordResetEmail(email, name, code) {
const safeName = String(name || "usuário");

return sendBrevoEmail({
to: email,
subject: "Código para redefinir sua senha - SlaxStore",
html: ` <div style="font-family:Arial,sans-serif;background:#080b12;padding:30px;"> <div style="max-width:520px;margin:auto;background:#111827;border-radius:16px;padding:30px;color:white;"> <h1 style="color:#3b82f6;">SLAXSTORE</h1>

```
      <p>Olá, ${safeName}!</p>

      <p>Recebemos uma solicitação para redefinir sua senha.</p>

      <p>Seu código é:</p>

      <div style="
        background:#0b1220;
        border:1px solid #2563eb;
        border-radius:12px;
        padding:18px;
        text-align:center;
        font-size:32px;
        font-weight:bold;
        letter-spacing:8px;
        color:#60a5fa;
      ">
        ${code}
      </div>

      <p style="color:#9ca3af;">
        Se você não solicitou isso, ignore este email.
      </p>
    </div>
  </div>
`,
```

});
}

async function verifyEmailConnection() {
if (!process.env.BREVO_API_KEY) {
console.warn("BREVO_API_KEY não configurada.");
return false;
}

console.log("Configuração da Brevo encontrada.");
return true;
}

module.exports = {
sendVerificationEmail,
sendPasswordResetEmail,
verifyEmailConnection,
};
