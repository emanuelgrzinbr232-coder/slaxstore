const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const db = require("./database");
const { enviarCodigo } = require("./email");

const router = express.Router();


/* ================================
   GERAR CÓDIGO
================================ */

function gerarCodigo() {
    return String(
        crypto.randomInt(100000, 1000000)
    );
}


/* ================================
   CADASTRO
================================ */

router.post("/register", async (req, res) => {

    try {

        const {
            username,
            email,
            password
        } = req.body;


        if (!username || !email || !password) {

            return res.status(400).json({
                error: "Preencha todos os campos."
            });

        }


        if (username.length < 3) {

            return res.status(400).json({
                error:
                    "O nome deve ter pelo menos 3 caracteres."
            });

        }


        if (password.length < 8) {

            return res.status(400).json({
                error:
                    "A senha precisa ter pelo menos 8 caracteres."
            });

        }


        const emailNormalizado =
            email.toLowerCase().trim();


        const existente =
            db.prepare(`
                SELECT id
                FROM users
                WHERE email = ?
                   OR username = ?
            `).get(
                emailNormalizado,
                username
            );


        if (existente) {

            return res.status(409).json({
                error:
                    "E-mail ou nome de usuário já cadastrado."
            });

        }


        const passwordHash =
            await bcrypt.hash(password, 12);


        const codigo =
            gerarCodigo();


        const codigoHash =
            await bcrypt.hash(codigo, 10);


        const agora =
            Date.now();


        const expiracao =
            agora + (15 * 60 * 1000);


        const result =
            db.prepare(`
                INSERT INTO users
                (
                    username,
                    email,
                    password_hash,
                    verification_code_hash,
                    verification_expires,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                username,
                emailNormalizado,
                passwordHash,
                codigoHash,
                expiracao,
                agora
            );


        await enviarCodigo(
            emailNormalizado,
            codigo
        );


        res.status(201).json({

            message:
                "Conta criada. Verifique seu e-mail.",

            userId:
                result.lastInsertRowid

        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error:
                "Erro interno ao criar a conta."
        });

    }

});


/* ================================
   VERIFICAR E-MAIL
================================ */

router.post("/verify-email", async (req, res) => {

    try {

        const {
            email,
            code
        } = req.body;


        if (!email || !code) {

            return res.status(400).json({
                error:
                    "Informe o e-mail e o código."
            });

        }


        const emailNormalizado =
            email.toLowerCase().trim();


        const user =
            db.prepare(`
                SELECT *
                FROM users
                WHERE email = ?
            `).get(
                emailNormalizado
            );


        if (!user) {

            return res.status(404).json({
                error:
                    "Conta não encontrada."
            });

        }


        if (user.email_verified) {

            return res.json({
                message:
                    "E-mail já verificado."
            });

        }


        if (
            !user.verification_expires ||
            Date.now() > user.verification_expires
        ) {

            return res.status(400).json({
                error:
                    "Código expirado."
            });

        }


        const correto =
            await bcrypt.compare(
                code,
                user.verification_code_hash
            );


        if (!correto) {

            return res.status(400).json({
                error:
                    "Código incorreto."
            });

        }


        db.prepare(`
            UPDATE users

            SET
                email_verified = 1,
                verification_code_hash = NULL,
                verification_expires = NULL

            WHERE id = ?
        `).run(
            user.id
        );


        res.json({
            message:
                "E-mail verificado com sucesso."
        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error:
                "Erro interno."
        });

    }

});


/* ================================
   LOGIN
================================ */

router.post("/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;


        if (!email || !password) {

            return res.status(400).json({
                error:
                    "Informe seu e-mail e sua senha."
            });

        }


        const emailNormalizado =
            email.toLowerCase().trim();


        const user =
            db.prepare(`
                SELECT *
                FROM users
                WHERE email = ?
            `).get(
                emailNormalizado
            );


        if (!user) {

            return res.status(401).json({
                error:
                    "E-mail ou senha incorretos."
            });

        }


        const senhaCorreta =
            await bcrypt.compare(
                password,
                user.password_hash
            );


        if (!senhaCorreta) {

            return res.status(401).json({
                error:
                    "E-mail ou senha incorretos."
            });

        }


        if (!user.email_verified) {

            return res.status(403).json({
                error:
                    "Verifique seu e-mail antes de entrar."
            });

        }


        const token =
            jwt.sign(
                {
                    id: user.id,
                    username: user.username
                },

                process.env.JWT_SECRET,

                {
                    expiresIn: "7d"
                }
            );


        res.json({

            message:
                "Login realizado.",

            token,

            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }

        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error:
                "Erro interno."
        });

    }

});


/* ================================
   ESQUECI MINHA SENHA
================================ */

router.post(
    "/forgot-password",
    async (req, res) => {

        try {

            const {
                email
            } = req.body;


            if (!email) {

                return res.status(400).json({
                    error:
                        "Informe seu e-mail."
                });

            }


            const emailNormalizado =
                email.toLowerCase().trim();


            const user =
                db.prepare(`
                    SELECT *
                    FROM users
                    WHERE email = ?
                `).get(
                    emailNormalizado
                );


            /*
             * Não revelamos se o e-mail
             * existe ou não.
             */

            if (!user) {

                return res.json({

                    message:
                        "Se o e-mail estiver cadastrado, você receberá um código."

                });

            }


            if (!user.email_verified) {

                return res.status(400).json({
                    error:
                        "Verifique seu e-mail antes de recuperar a senha."
                });

            }


            const codigo =
                gerarCodigo();


            const codigoHash =
                await bcrypt.hash(
                    codigo,
                    10
                );


            const expiracao =
                Date.now() +
                (15 * 60 * 1000);


            db.prepare(`
                UPDATE users

                SET
                    verification_code_hash = ?,
                    verification_expires = ?

                WHERE id = ?
            `).run(
                codigoHash,
                expiracao,
                user.id
            );


            await enviarCodigo(
                emailNormalizado,
                codigo
            );


            res.json({

                message:
                    "Se o e-mail estiver cadastrado, você receberá um código."

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


/* ================================
   REDEFINIR SENHA
================================ */

router.post(
    "/reset-password",
    async (req, res) => {

        try {

            const {
                email,
                code,
                newPassword
            } = req.body;


            if (
                !email ||
                !code ||
                !newPassword
            ) {

                return res.status(400).json({
                    error:
                        "Preencha todos os campos."
                });

            }


            if (newPassword.length < 8) {

                return res.status(400).json({
                    error:
                        "A nova senha precisa ter pelo menos 8 caracteres."
                });

            }


            const emailNormalizado =
                email.toLowerCase().trim();


            const user =
                db.prepare(`
                    SELECT *
                    FROM users
                    WHERE email = ?
                `).get(
                    emailNormalizado
                );


            if (!user) {

                return res.status(400).json({
                    error:
                        "Código inválido."
                });

            }


            if (
                !user.verification_code_hash ||
                !user.verification_expires
            ) {

                return res.status(400).json({
                    error:
                        "Código inválido ou expirado."
                });

            }


            if (
                Date.now() >
                user.verification_expires
            ) {

                return res.status(400).json({
                    error:
                        "Código expirado."
                });

            }


            const correto =
                await bcrypt.compare(
                    code,
                    user.verification_code_hash
                );


            if (!correto) {

                return res.status(400).json({
                    error:
                        "Código incorreto."
                });

            }


            const novaSenhaHash =
                await bcrypt.hash(
                    newPassword,
                    12
                );


            db.prepare(`
                UPDATE users

                SET
                    password_hash = ?,
                    verification_code_hash = NULL,
                    verification_expires = NULL

                WHERE id = ?
            `).run(
                novaSenhaHash,
                user.id
            );


            res.json({

                message:
                    "Senha alterada com sucesso."

            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível alterar a senha."
            });

        }

    }
);


module.exports = router;
