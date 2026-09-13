const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const db = require("./database");
const { enviarCodigo } = require("./email");

const router = express.Router();

function gerarCodigo() {
    return String(
        crypto.randomInt(100000, 1000000)
    );
}

function autenticar(req, res, next) {

    const header =
        req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Você precisa estar conectado."
        });
    }

    const token =
        header.substring(7);

    try {

        const dados =
            jwt.verify(
                token,
                process.env.JWT_SECRET
            );

        const user =
            db.prepare(`
                SELECT *
                FROM users
                WHERE id = ?
            `).get(dados.id);

        if (!user) {
            return res.status(401).json({
                error: "Usuário não encontrado."
            });
        }

        if (user.suspended) {
            return res.status(403).json({
                error: "Sua conta está suspensa."
            });
        }

        req.user = user;

        next();

    } catch {

        return res.status(401).json({
            error: "Sessão inválida ou expirada."
        });
    }
}


/*
========================================
CADASTRO
========================================
*/

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
            await bcrypt.hash(
                password,
                12
            );

        const codigo =
            gerarCodigo();

        const codigoHash =
            await bcrypt.hash(
                codigo,
                10
            );

        const agora =
            Date.now();

        const expiracao =
            agora +
            15 * 60 * 1000;

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


/*
========================================
VERIFICAR E-MAIL
========================================
*/

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
            `).get(emailNormalizado);

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
        `).run(user.id);

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


/*
========================================
LOGIN
========================================
*/

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
            `).get(emailNormalizado);

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

        if (user.suspended) {
            return res.status(403).json({
                error:
                    "Sua conta está suspensa."
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
                email: user.email,
                avatar_url: user.avatar_url,
                bio: user.bio,
                seller_verified:
                    !!user.seller_verified,
                verification_status:
                    user.verification_status,
                rating_positive:
                    user.rating_positive,
                rating_neutral:
                    user.rating_neutral,
                rating_negative:
                    user.rating_negative
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


/*
========================================
RECUPERAR SENHA
========================================
*/

router.post(
    "/forgot-password",
    async (req, res) => {

        try {

            const { email } =
                req.body;

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
                    SELECT id
                    FROM users
                    WHERE email = ?
                `).get(emailNormalizado);

            if (!user) {
                return res.status(404).json({
                    error:
                        "Nenhuma conta encontrada com esse e-mail."
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
                15 * 60 * 1000;

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
                    "Código enviado para seu e-mail."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro interno ao enviar o código."
            });
        }
    }
);


/*
========================================
REDEFINIR SENHA
========================================
*/

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
                `).get(emailNormalizado);

            if (!user) {
                return res.status(404).json({
                    error:
                        "Conta não encontrada."
                });
            }

            if (
                !user.verification_code_hash ||
                !user.verification_expires
            ) {
                return res.status(400).json({
                    error:
                        "Nenhum código foi solicitado."
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

            const passwordHash =
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
                passwordHash,
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
                    "Erro interno ao redefinir a senha."
            });
        }
    }
);


/*
========================================
MEU PERFIL
========================================
*/

router.get(
    "/me",
    autenticar,
    (req, res) => {

        const user = req.user;

        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                avatar_url: user.avatar_url,
                bio: user.bio,
                email_verified:
                    !!user.email_verified,
                seller_verified:
                    !!user.seller_verified,
                verification_status:
                    user.verification_status,
                rating_positive:
                    user.rating_positive,
                rating_neutral:
                    user.rating_neutral,
                rating_negative:
                    user.rating_negative,
                created_at:
                    user.created_at
            }
        });
    }
);


/*
========================================
ATUALIZAR PERFIL
========================================
*/

router.put(
    "/profile",
    autenticar,
    (req, res) => {

        try {

            const {
                username,
                bio,
                avatar_url
            } = req.body;

            if (
                username &&
                username.length < 3
            ) {
                return res.status(400).json({
                    error:
                        "O nome precisa ter pelo menos 3 caracteres."
                });
            }

            if (username) {

                const outro =
                    db.prepare(`
                        SELECT id
                        FROM users
                        WHERE username = ?
                          AND id != ?
                    `).get(
                        username,
                        req.user.id
                    );

                if (outro) {
                    return res.status(409).json({
                        error:
                            "Esse nome de usuário já está sendo usado."
                    });
                }
            }

            db.prepare(`
                UPDATE users
                SET
                    username = COALESCE(?, username),
                    bio = COALESCE(?, bio),
                    avatar_url = COALESCE(?, avatar_url)
                WHERE id = ?
            `).run(
                username || null,
                bio ?? null,
                avatar_url ?? null,
                req.user.id
            );

            const user =
                db.prepare(`
                    SELECT
                        id,
                        username,
                        email,
                        avatar_url,
                        bio,
                        seller_verified,
                        verification_status,
                        rating_positive,
                        rating_neutral,
                        rating_negative
                    FROM users
                    WHERE id = ?
                `).get(req.user.id);

            res.json({
                message:
                    "Perfil atualizado.",
                user
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao atualizar perfil."
            });
        }
    }
);


/*
========================================
ALTERAR SENHA
========================================
*/

router.put(
    "/password",
    autenticar,
    async (req, res) => {

        try {

            const {
                currentPassword,
                newPassword
            } = req.body;

            if (
                !currentPassword ||
                !newPassword
            ) {
                return res.status(400).json({
                    error:
                        "Preencha as senhas."
                });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({
                    error:
                        "A nova senha precisa ter pelo menos 8 caracteres."
                });
            }

            const correto =
                await bcrypt.compare(
                    currentPassword,
                    req.user.password_hash
                );

            if (!correto) {
                return res.status(400).json({
                    error:
                        "A senha atual está incorreta."
                });
            }

            const hash =
                await bcrypt.hash(
                    newPassword,
                    12
                );

            db.prepare(`
                UPDATE users
                SET password_hash = ?
                WHERE id = ?
            `).run(
                hash,
                req.user.id
            );

            res.json({
                message:
                    "Senha alterada."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao alterar senha."
            });
        }
    }
);


/*
========================================
SOLICITAR VERIFICAÇÃO
========================================
*/

router.post(
    "/verification/request",
    autenticar,
    (req, res) => {

        const existente =
            db.prepare(`
                SELECT id
                FROM verification_requests
                WHERE user_id = ?
                  AND status = 'pending'
            `).get(req.user.id);

        if (existente) {
            return res.status(409).json({
                error:
                    "Você já possui uma verificação em análise."
            });
        }

        const agora =
            Date.now();

        db.prepare(`
            INSERT INTO verification_requests
            (
                user_id,
                status,
                provider,
                created_at,
                updated_at
            )
            VALUES (?, 'pending', 'external_kyc', ?, ?)
        `).run(
            req.user.id,
            agora,
            agora
        );

        db.prepare(`
            UPDATE users
            SET verification_status = 'pending'
            WHERE id = ?
        `).run(req.user.id);

        res.json({
            message:
                "Solicitação enviada para verificação."
        });
    }
);


module.exports = {
    router,
    autenticar
};
