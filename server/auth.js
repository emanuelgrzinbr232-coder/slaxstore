const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const db = require("./database");
const { enviarCodigo } = require("./email");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.warn("AVISO: JWT_SECRET não configurado.");
}

function gerarToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role
        },
        JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );
}

function autenticar(req, res, next) {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Faça login para continuar."
        });
    }

    const token = header.slice(7);

    try {
        const payload = jwt.verify(token, JWT_SECRET);

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(payload.id);

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

function limparUsuario(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        email_verified: !!user.email_verified,
        avatar_url: user.avatar_url,
        bio: user.bio,
        seller_verified: !!user.seller_verified,
        verification_status: user.verification_status,
        role: user.role,
        suspended: !!user.suspended,
        rating_positive: user.rating_positive,
        rating_neutral: user.rating_neutral,
        rating_negative: user.rating_negative,
        created_at: user.created_at
    };
}

/*
 * CADASTRO
 */
router.post("/register", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!username || username.length < 3 || username.length > 30) {
            return res.status(400).json({
                error: "O nome de usuário deve ter entre 3 e 30 caracteres."
            });
        }

        if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
            return res.status(400).json({
                error: "O nome de usuário possui caracteres inválidos."
            });
        }

        if (!email || !email.includes("@")) {
            return res.status(400).json({
                error: "Digite um e-mail válido."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: "A senha precisa ter pelo menos 8 caracteres."
            });
        }

        const existente = db.prepare(`
            SELECT id
            FROM users
            WHERE LOWER(email) = ? OR LOWER(username) = ?
        `).get(email, username.toLowerCase());

        if (existente) {
            return res.status(409).json({
                error: "Esse e-mail ou nome de usuário já está cadastrado."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const codigo = crypto
            .randomInt(100000, 1000000)
            .toString();

        const codigoHash = crypto
            .createHash("sha256")
            .update(codigo)
            .digest("hex");

        const expiracao = Date.now() + 15 * 60 * 1000;

        const adminEmail = String(
            process.env.ADMIN_EMAIL || ""
        ).trim().toLowerCase();

        const role =
            email === adminEmail
                ? "admin"
                : "user";

        const resultado = db.prepare(`
            INSERT INTO users (
                username,
                email,
                password_hash,
                email_verified,
                role,
                verification_code_hash,
                verification_expires
            )
            VALUES (?, ?, ?, 0, ?, ?, ?)
        `).run(
            username,
            email,
            passwordHash,
            role,
            codigoHash,
            expiracao
        );

        try {
            await enviarCodigo(email, codigo);
        } catch (erro) {
            db.prepare(`
                DELETE FROM users
                WHERE id = ?
            `).run(resultado.lastInsertRowid);

            console.error(erro);

            return res.status(500).json({
                error: "Não foi possível enviar o código de verificação."
            });
        }

        return res.status(201).json({
            success: true,
            message: "Conta criada. Verifique seu e-mail.",
            user_id: resultado.lastInsertRowid
        });

    } catch (erro) {
        console.error("Erro no cadastro:", erro);

        return res.status(500).json({
            error: "Erro interno ao criar a conta."
        });
    }
});

/*
 * VERIFICAR E-MAIL
 */
router.post("/verify-email", async (req, res) => {
    try {
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const codigo = String(req.body.codigo || "").trim();

        if (!email || !codigo) {
            return res.status(400).json({
                error: "Informe o e-mail e o código."
            });
        }

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE LOWER(email) = ?
        `).get(email);

        if (!user) {
            return res.status(404).json({
                error: "Usuário não encontrado."
            });
        }

        if (user.email_verified) {
            return res.json({
                success: true,
                message: "E-mail já verificado."
            });
        }

        if (
            !user.verification_expires ||
            Date.now() > user.verification_expires
        ) {
            return res.status(400).json({
                error: "O código expirou. Solicite outro."
            });
        }

        const codigoHash = crypto
            .createHash("sha256")
            .update(codigo)
            .digest("hex");

        if (codigoHash !== user.verification_code_hash) {
            return res.status(400).json({
                error: "Código de verificação incorreto."
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

        return res.json({
            success: true,
            message: "E-mail verificado com sucesso."
        });

    } catch (erro) {
        console.error("Erro na verificação:", erro);

        return res.status(500).json({
            error: "Erro interno na verificação."
        });
    }
});

/*
 * REENVIAR CÓDIGO
 */
router.post("/resend-code", async (req, res) => {
    try {
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE LOWER(email) = ?
        `).get(email);

        if (!user) {
            return res.json({
                success: true,
                message: "Se o e-mail estiver cadastrado, um novo código será enviado."
            });
        }

        if (user.email_verified) {
            return res.status(400).json({
                error: "Esse e-mail já foi verificado."
            });
        }

        const codigo = crypto
            .randomInt(100000, 1000000)
            .toString();

        const codigoHash = crypto
            .createHash("sha256")
            .update(codigo)
            .digest("hex");

        const expiracao = Date.now() + 15 * 60 * 1000;

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

        await enviarCodigo(email, codigo);

        return res.json({
            success: true,
            message: "Novo código enviado."
        });

    } catch (erro) {
        console.error("Erro ao reenviar código:", erro);

        return res.status(500).json({
            error: "Não foi possível enviar o novo código."
        });
    }
});

/*
 * LOGIN
 */
router.post("/login", async (req, res) => {
    try {
        const login = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const password = String(req.body.password || "");

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE LOWER(email) = ?
        `).get(login);

        if (!user) {
            return res.status(401).json({
                error: "E-mail ou senha incorretos."
            });
        }

        if (user.suspended) {
            return res.status(403).json({
                error: "Sua conta está suspensa."
            });
        }

        const senhaCorreta = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!senhaCorreta) {
            return res.status(401).json({
                error: "E-mail ou senha incorretos."
            });
        }

        const token = gerarToken(user);

        return res.json({
            success: true,
            token,
            user: limparUsuario(user)
        });

    } catch (erro) {
        console.error("Erro no login:", erro);

        return res.status(500).json({
            error: "Erro interno ao fazer login."
        });
    }
});

/*
 * USUÁRIO LOGADO
 */
router.get("/me", autenticar, (req, res) => {
    return res.json({
        user: limparUsuario(req.user)
    });
});

/*
 * ALTERAR PERFIL
 */
router.put("/profile", autenticar, (req, res) => {
    try {
        const username =
            req.body.username !== undefined
                ? String(req.body.username).trim()
                : req.user.username;

        const bio =
            req.body.bio !== undefined
                ? String(req.body.bio)
                : req.user.bio;

        const avatarUrl =
            req.body.avatar_url !== undefined
                ? String(req.body.avatar_url)
                : req.user.avatar_url;

        if (
            username.length < 3 ||
            username.length > 30
        ) {
            return res.status(400).json({
                error: "O nome deve ter entre 3 e 30 caracteres."
            });
        }

        if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
            return res.status(400).json({
                error: "O nome possui caracteres inválidos."
            });
        }

        if (bio.length > 500) {
            return res.status(400).json({
                error: "A bio pode ter no máximo 500 caracteres."
            });
        }

        if (avatarUrl && avatarUrl.length > 700000) {
            return res.status(400).json({
                error: "A foto de perfil é muito grande."
            });
        }

        if (
            avatarUrl &&
            !(
                avatarUrl.startsWith("http://") ||
                avatarUrl.startsWith("https://") ||
                avatarUrl.startsWith("data:image/")
            )
        ) {
            return res.status(400).json({
                error: "Formato de foto inválido."
            });
        }

        const outroUsuario = db.prepare(`
            SELECT id
            FROM users
            WHERE LOWER(username) = ?
            AND id != ?
        `).get(
            username.toLowerCase(),
            req.user.id
        );

        if (outroUsuario) {
            return res.status(409).json({
                error: "Esse nome de usuário já está sendo usado."
            });
        }

        db.prepare(`
            UPDATE users
            SET
                username = ?,
                bio = ?,
                avatar_url = ?
            WHERE id = ?
        `).run(
            username,
            bio,
            avatarUrl || null,
            req.user.id
        );

        const atualizado = db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(req.user.id);

        return res.json({
            success: true,
            user: limparUsuario(atualizado)
        });

    } catch (erro) {
        console.error("Erro ao atualizar perfil:", erro);

        return res.status(500).json({
            error: "Não foi possível atualizar o perfil."
        });
    }
});

/*
 * ALTERAR SENHA
 */
router.put("/password", autenticar, async (req, res) => {
    try {
        const senhaAtual = String(
            req.body.current_password || ""
        );

        const novaSenha = String(
            req.body.new_password || ""
        );

        if (!senhaAtual || !novaSenha) {
            return res.status(400).json({
                error: "Preencha as duas senhas."
            });
        }

        if (novaSenha.length < 8) {
            return res.status(400).json({
                error: "A nova senha precisa ter pelo menos 8 caracteres."
            });
        }

        const correta = await bcrypt.compare(
            senhaAtual,
            req.user.password_hash
        );

        if (!correta) {
            return res.status(400).json({
                error: "A senha atual está incorreta."
            });
        }

        const hash = await bcrypt.hash(
            novaSenha,
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

        return res.json({
            success: true,
            message: "Senha alterada com sucesso."
        });

    } catch (erro) {
        console.error("Erro ao alterar senha:", erro);

        return res.status(500).json({
            error: "Não foi possível alterar a senha."
        });
    }
});

/*
 * SOLICITAR VERIFICAÇÃO DE VENDEDOR
 *
 * Não armazena documentos pessoais.
 */
router.post(
    "/verification/request",
    autenticar,
    (req, res) => {
        try {
            if (!req.user.email_verified) {
                return res.status(400).json({
                    error: "Verifique seu e-mail antes de solicitar a verificação."
                });
            }

            if (req.user.seller_verified) {
                return res.status(400).json({
                    error: "Sua conta já está verificada como vendedor."
                });
            }

            const existente = db.prepare(`
                SELECT *
                FROM verification_requests
                WHERE user_id = ?
            `).get(req.user.id);

            if (
                existente &&
                existente.status === "pending"
            ) {
                return res.status(400).json({
                    error: "Sua solicitação já está em análise."
                });
            }

            if (existente) {
                db.prepare(`
                    UPDATE verification_requests
                    SET
                        status = 'pending',
                        note = NULL,
                        reviewed_at = NULL,
                        created_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                `).run(req.user.id);
            } else {
                db.prepare(`
                    INSERT INTO verification_requests (
                        user_id,
                        status
                    )
                    VALUES (?, 'pending')
                `).run(req.user.id);
            }

            db.prepare(`
                UPDATE users
                SET verification_status = 'pending'
                WHERE id = ?
            `).run(req.user.id);

            return res.json({
                success: true,
                message: "Solicitação enviada para análise."
            });

        } catch (erro) {
            console.error(
                "Erro na solicitação de verificação:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível enviar a solicitação."
            });
        }
    }
);

module.exports = {
    router,
    autenticar
};
