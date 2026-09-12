const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",

    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

async function enviarCodigo(email, codigo) {
    await transporter.sendMail({
        from: process.env.EMAIL_FROM,

        to: email,

        subject: "Seu código de verificação — SlaxStore",

        text: `Olá!

Seu código de verificação da SlaxStore é:

${codigo}

Esse código expira em 15 minutos.

Se você não solicitou esse código, ignore este e-mail.`,

        html: `
            <div style="font-family: Arial, sans-serif;">
                <h2>SlaxStore</h2>

                <p>Seu código de verificação é:</p>

                <h1>${codigo}</h1>

                <p>
                    O código expira em 15 minutos.
                </p>
            </div>
        `
    });
}

module.exports = {
    enviarCodigo
};
