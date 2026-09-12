const https = require("https");

function enviarCodigo(email, codigo) {
    return new Promise((resolve, reject) => {

        const dados = JSON.stringify({
            sender: {
                name: "SlaxStore",
                email: process.env.SMTP_USER
            },

            to: [
                {
                    email: email
                }
            ],

            subject: "Seu código de verificação — SlaxStore",

            htmlContent: `
                <div style="font-family: Arial, sans-serif;">
                    <h2>SlaxStore</h2>

                    <p>Seu código de verificação é:</p>

                    <h1>${codigo}</h1>

                    <p>
                        Esse código expira em 15 minutos.
                    </p>

                    <p>
                        Se você não solicitou esse código,
                        ignore este e-mail.
                    </p>
                </div>
            `
        });

        const requisicao = https.request(
            {
                hostname: "api.brevo.com",
                path: "/v3/smtp/email",
                method: "POST",

                headers: {
                    "accept": "application/json",
                    "api-key": process.env.BREVO_API_KEY,
                    "content-type": "application/json",
                    "content-length": Buffer.byteLength(dados)
                }
            },

            (resposta) => {

                let respostaData = "";

                resposta.on(
                    "data",
                    (parte) => {
                        respostaData += parte;
                    }
                );

                resposta.on(
                    "end",
                    () => {

                        if (
                            resposta.statusCode >= 200 &&
                            resposta.statusCode < 300
                        ) {
                            resolve();
                            return;
                        }

                        console.error(
                            "Erro Brevo:",
                            resposta.statusCode,
                            respostaData
                        );

                        reject(
                            new Error(
                                "Falha ao enviar e-mail pela Brevo."
                            )
                        );
                    }
                );
            }
        );

        requisicao.on(
            "error",
            (erro) => {
                console.error(
                    "Erro de conexão com Brevo:",
                    erro
                );

                reject(erro);
            }
        );

        requisicao.write(dados);
        requisicao.end();
    });
}

module.exports = {
    enviarCodigo
};
