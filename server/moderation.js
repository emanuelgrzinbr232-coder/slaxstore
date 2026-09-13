const express = require("express");

const db = require("./database");
const { autenticar } = require("./auth");

const router = express.Router();


/*
========================================
VERIFICAR MODERADOR
========================================
*/

function moderador(req, res, next) {

    if (!req.user) {
        return res.status(401).json({
            error: "Você precisa estar conectado."
        });
    }

    if (
        req.user.role !== "admin" &&
        req.user.role !== "moderator"
    ) {

        return res.status(403).json({
            error:
                "Acesso permitido somente para moderadores."
        });
    }

    next();
}


/*
========================================
PAINEL — RESUMO
GET /api/moderation
========================================
*/

router.get(
    "/",
    autenticar,
    moderador,
    (req, res) => {

        try {

            const produtosPendentes =
                db.prepare(`
                    SELECT COUNT(*) AS total
                    FROM products
                    WHERE status = 'pending'
                `).get().total;

            const denunciasPendentes =
                db.prepare(`
                    SELECT COUNT(*) AS total
                    FROM reports
                    WHERE status = 'pending'
                `).get().total;

            const verificacoesPendentes =
                db.prepare(`
                    SELECT COUNT(*) AS total
                    FROM verification_requests
                    WHERE status = 'pending'
                `).get().total;

            const pedidosComProblema =
                db.prepare(`
                    SELECT COUNT(*) AS total
                    FROM orders
                    WHERE status = 'problem'
                `).get().total;

            res.json({

                panel: "SlaxGuard",

                pending: {
                    products:
                        produtosPendentes,

                    reports:
                        denunciasPendentes,

                    verifications:
                        verificacoesPendentes,

                    order_problems:
                        pedidosComProblema
                }

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao carregar painel."
            });
        }
    }
);


/*
========================================
LISTAR ANÚNCIOS
GET /api/moderation/products
========================================
*/

router.get(
    "/products",
    autenticar,
    moderador,
    (req, res) => {

        try {

            const status =
                String(
                    req.query.status || "pending"
                );

            const permitidos = [
                "pending",
                "approved",
                "rejected",
                "paused"
            ];

            if (
                !permitidos.includes(status)
            ) {

                return res.status(400).json({
                    error:
                        "Status inválido."
                });
            }

            const produtos = db.prepare(`
                SELECT

                    p.*,

                    u.username AS seller_username,
                    u.email AS seller_email,
                    u.avatar_url AS seller_avatar,
                    u.seller_verified,

                    u.rating_positive,
                    u.rating_neutral,
                    u.rating_negative

                FROM products p

                INNER JOIN users u
                    ON u.id = p.seller_id

                WHERE p.status = ?

                ORDER BY p.created_at ASC
            `).all(status);

            res.json({
                products:
                    produtos
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao carregar anúncios."
            });
        }
    }
);


/*
========================================
APROVAR ANÚNCIO
POST /api/moderation/products/:id/approve
========================================
*/

router.post(
    "/products/:id/approve",
    autenticar,
    moderador,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const produto = db.prepare(`
                SELECT *
                FROM products
                WHERE id = ?
            `).get(id);

            if (!produto) {

                return res.status(404).json({
                    error:
                        "Anúncio não encontrado."
                });
            }

            if (
                produto.status !== "pending"
            ) {

                return res.status(400).json({
                    error:
                        "Este anúncio não está pendente."
                });
            }

            db.prepare(`
                UPDATE products

                SET
                    status = 'approved',
                    updated_at = ?

                WHERE id = ?
            `).run(
                Date.now(),
                id
            );

            res.json({
                message:
                    "Anúncio aprovado."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao aprovar anúncio."
            });
        }
    }
);


/*
========================================
REJEITAR ANÚNCIO
POST /api/moderation/products/:id/reject
========================================
*/

router.post(
    "/products/:id/reject",
    autenticar,
    moderador,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const reason =
                String(
                    req.body.reason || ""
                ).trim();

            if (
                reason.length < 3
            ) {

                return res.status(400).json({
                    error:
                        "Informe o motivo da rejeição."
                });
            }

            if (
                reason.length > 1000
            ) {

                return res.status(400).json({
                    error:
                        "O motivo é muito grande."
                });
            }

            const produto = db.prepare(`
                SELECT *
                FROM products
                WHERE id = ?
            `).get(id);

            if (!produto) {

                return res.status(404).json({
                    error:
                        "Anúncio não encontrado."
                });
            }

            db.prepare(`
                UPDATE products

                SET
                    status = 'rejected',
                    updated_at = ?

                WHERE id = ?
            `).run(
                Date.now(),
                id
            );

            /*
            Guardamos a decisão como mensagem
            para manter histórico interno.
            */

            db.prepare(`
                INSERT INTO messages (
                    order_id,
                    sender_id,
                    message,
                    created_at
                )

                SELECT
                    0,
                    ?,
                    ?,
                    ?

                WHERE EXISTS (
                    SELECT 1
                    FROM orders
                    WHERE product_id = ?
                )
            `).run(
                req.user.id,
                `[MODERAÇÃO] Anúncio rejeitado: ${reason}`,
                Date.now(),
                id
            );

            res.json({
                message:
                    "Anúncio rejeitado.",
                reason:
                    reason
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao rejeitar anúncio."
            });
        }
    }
);


/*
========================================
LISTAR DENÚNCIAS
GET /api/moderation/reports
========================================
*/

router.get(
    "/reports",
    autenticar,
    moderador,
    (req, res) => {

        try {

            const status =
                String(
                    req.query.status || "pending"
                );

            const reports = db.prepare(`
                SELECT

                    r.*,

                    reporter.username
                        AS reporter_username,

                    reported.username
                        AS reported_username,

                    p.title
                        AS product_title

                FROM reports r

                INNER JOIN users reporter
                    ON reporter.id = r.reporter_id

                LEFT JOIN users reported
                    ON reported.id =
                       r.reported_user_id

                LEFT JOIN products p
                    ON p.id = r.product_id

                WHERE r.status = ?

                ORDER BY r.created_at ASC
            `).all(status);

            res.json({
                reports
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao carregar denúncias."
            });
        }
    }
);


/*
========================================
RESOLVER DENÚNCIA
POST /api/moderation/reports/:id/resolve
========================================
*/

router.post(
    "/reports/:id/resolve",
    autenticar,
    moderador,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const status =
                String(
                    req.body.status || "resolved"
                );

            const permitidos = [
                "resolved",
                "dismissed"
            ];

            if (
                !permitidos.includes(status)
            ) {

                return res.status(400).json({
                    error:
                        "Status inválido."
                });
            }

            const report = db.prepare(`
                SELECT *
                FROM reports
                WHERE id = ?
            `).get(id);

            if (!report) {

                return res.status(404).json({
                    error:
                        "Denúncia não encontrada."
                });
            }

            db.prepare(`
                UPDATE reports

                SET status = ?

                WHERE id = ?
            `).run(
                status,
                id
            );

            res.json({
                message:
                    status === "resolved"
                        ? "Denúncia resolvida."
                        : "Denúncia arquivada."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao resolver denúncia."
            });
        }
    }
);


/*
========================================
VERIFICAÇÕES
GET /api/moderation/verifications
========================================
*/

router.get(
    "/verifications",
    autenticar,
    moderador,
    (req, res) => {

        try {

            const verificacoes =
                db.prepare(`
                    SELECT

                        v.*,

                        u.username,
                        u.email,
                        u.avatar_url,

                        u.seller_verified,
                        u.verification_status

                    FROM verification_requests v

                    INNER JOIN users u
                        ON u.id = v.user_id

                    WHERE v.status = 'pending'

                    ORDER BY v.created_at ASC
                `).all();

            res.json({
                verifications:
                    verificacoes
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao carregar verificações."
            });
        }
    }
);


/*
========================================
APROVAR VERIFICAÇÃO
POST /api/moderation/verifications/:id/approve
========================================
*/

router.post(
    "/verifications/:id/approve",
    autenticar,
    moderador,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const verificacao = db.prepare(`
                SELECT *
                FROM verification_requests
                WHERE id = ?
            `).get(id);

            if (!verificacao) {

                return res.status(404).json({
                    error:
                        "Solicitação não encontrada."
                });
            }

            const agora =
                Date.now();

            const aprovar =
                db.transaction(() => {

                    db.prepare(`
                        UPDATE verification_requests

                        SET
                            status = 'approved',
                            moderator_note = ?,
                            updated_at = ?

                        WHERE id = ?
                    `).run(
                        "Aprovado pela moderação.",
                        agora,
                        id
                    );

                    db.prepare(`
                        UPDATE users

                        SET
                            seller_verified = 1,
                            verification_status = 'approved'

                        WHERE id = ?
                    `).run(
                        verificacao.user_id
                    );
                });

            aprovar();

            res.json({
                message:
                    "Verificação aprovada."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao aprovar verificação."
            });
        }
    }
);


/*
========================================
REJEITAR VERIFICAÇÃO
POST /api/moderation/verifications/:id/reject
========================================
*/

router.post(
    "/verifications/:id/reject",
    autenticar,
    moderador,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const note =
                String(
                    req.body.note || ""
                ).trim();

            if (!note) {

                return res.status(400).json({
                    error:
                        "Informe o motivo da rejeição."
                });
            }

            const verificacao = db.prepare(`
                SELECT *
                FROM verification_requests
                WHERE id = ?
            `).get(id);

            if (!verificacao) {

                return res.status(404).json({
                    error:
                        "Solicitação não encontrada."
                });
            }

            const agora =
                Date.now();

            const rejeitar =
                db.transaction(() => {

                    db.prepare(`
                        UPDATE verification_requests

                        SET
                            status = 'rejected',
                            moderator_note = ?,
                            updated_at = ?

                        WHERE id = ?
                    `).run(
                        note,
                        agora,
                        id
                    );

                    db.prepare(`
                        UPDATE users

                        SET
                            seller_verified = 0,
                            verification_status = 'rejected'

                        WHERE id = ?
                    `).run(
                        verificacao.user_id
                    );
                });

            rejeitar();

            res.json({
                message:
                    "Verificação rejeitada."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao rejeitar verificação."
            });
        }
    }
);


/*
========================================
SUSPENDER USUÁRIO
POST /api/moderation/users/:id/suspend
========================================
*/

router.post(
    "/users/:id/suspend",
    autenticar,
    moderador,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

            if (
                id === req.user.id
            ) {

                return res.status(400).json({
                    error:
                        "Você não pode suspender sua própria conta."
                });
            }

            const usuario = db.prepare(`
                SELECT id, username, role
                FROM users
                WHERE id = ?
            `).get(id);

            if (!usuario) {

                return res.status(404).json({
                    error:
                        "Usuário não encontrado."
                });
            }

            /*
            Moderadores não podem suspender
            administradores.
            */

            if (
                usuario.role === "admin" &&
                req.user.role !== "admin"
            ) {

                return res.status(403).json({
                    error:
                        "Somente um administrador pode suspender um administrador."
                });
            }

            db.prepare(`
                UPDATE users
                SET suspended = 1
                WHERE id = ?
            `).run(id);

            res.json({
                message:
                    `Usuário ${usuario.username} suspenso.`
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao suspender usuário."
            });
        }
    }
);


/*
========================================
REATIVAR USUÁRIO
POST /api/moderation/users/:id/unsuspend
========================================
*/

router.post(
    "/users/:id/unsuspend",
    autenticar,
    moderador,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const usuario = db.prepare(`
                SELECT id, username
                FROM users
                WHERE id = ?
            `).get(id);

            if (!usuario) {

                return res.status(404).json({
                    error:
                        "Usuário não encontrado."
                });
            }

            db.prepare(`
                UPDATE users
                SET suspended = 0
                WHERE id = ?
            `).run(id);

            res.json({
                message:
                    `Usuário ${usuario.username} reativado.`
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao reativar usuário."
            });
        }
    }
);


module.exports = router;
