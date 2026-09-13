const express = require("express");

const db = require("./database");
const { autenticar } = require("./auth");

const router = express.Router();


/* ==========================================
   VERIFICAR ADMIN / MODERADOR
========================================== */

function exigirModerador(req, res, next) {

    if (
        !req.user ||
        (
            req.user.role !== "admin" &&
            req.user.role !== "moderator"
        )
    ) {
        return res.status(403).json({
            error:
                "Acesso permitido somente para administradores ou moderadores."
        });
    }

    next();
}


/* ==========================================
   PRODUTOS PENDENTES
   GET /api/moderation/products
========================================== */

router.get(
    "/products",
    autenticar,
    exigirModerador,
    (req, res) => {

        try {

            const status =
                String(
                    req.query.status || "pending"
                );

            const statusPermitidos = [
                "pending",
                "approved",
                "rejected",
                "paused"
            ];

            if (
                !statusPermitidos.includes(status)
            ) {
                return res.status(400).json({
                    error:
                        "Status inválido."
                });
            }

            const produtos =
                db.prepare(`
                    SELECT
                        p.*,

                        u.username
                            AS seller_username,

                        u.email
                            AS seller_email,

                        u.seller_verified,

                        u.verification_status

                    FROM products p

                    INNER JOIN users u
                        ON u.id = p.seller_id

                    WHERE p.status = ?

                    ORDER BY
                        p.created_at ASC
                `)
                .all(status);

            res.json({
                products:
                    produtos
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao carregar produtos."
            });
        }
    }
);


/* ==========================================
   APROVAR PRODUTO
   POST /api/moderation/products/:id/approve
========================================== */

router.post(
    "/products/:id/approve",
    autenticar,
    exigirModerador,
    (req, res) => {

        try {

            const id =
                Number.parseInt(
                    req.params.id,
                    10
                );

            const produto =
                db.prepare(`
                    SELECT *
                    FROM products
                    WHERE id = ?
                `)
                .get(id);

            if (!produto) {

                return res.status(404).json({
                    error:
                        "Produto não encontrado."
                });
            }

            db.prepare(`
                UPDATE products

                SET
                    status = 'approved',
                    updated_at = ?

                WHERE id = ?
            `)
            .run(
                Date.now(),
                id
            );

            res.json({
                message:
                    "Produto aprovado com sucesso."
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao aprovar produto."
            });
        }
    }
);


/* ==========================================
   REJEITAR PRODUTO
   POST /api/moderation/products/:id/reject
========================================== */

router.post(
    "/products/:id/reject",
    autenticar,
    exigirModerador,
    (req, res) => {

        try {

            const id =
                Number.parseInt(
                    req.params.id,
                    10
                );

            const motivo =
                String(
                    req.body.reason || ""
                ).trim();

            if (!motivo) {

                return res.status(400).json({
                    error:
                        "Informe o motivo da rejeição."
                });
            }

            if (motivo.length > 2000) {

                return res.status(400).json({
                    error:
                        "O motivo é muito grande."
                });
            }

            const produto =
                db.prepare(`
                    SELECT *
                    FROM products
                    WHERE id = ?
                `)
                .get(id);

            if (!produto) {

                return res.status(404).json({
                    error:
                        "Produto não encontrado."
                });
            }

            db.prepare(`
                UPDATE products

                SET
                    status = 'rejected',
                    updated_at = ?

                WHERE id = ?
            `)
            .run(
                Date.now(),
                id
            );

            res.json({
                message:
                    "Produto rejeitado.",
                reason:
                    motivo
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao rejeitar produto."
            });
        }
    }
);


/* ==========================================
   DENÚNCIAS
   GET /api/moderation/reports
========================================== */

router.get(
    "/reports",
    autenticar,
    exigirModerador,
    (req, res) => {

        try {

            const reports =
                db.prepare(`
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

                    ORDER BY
                        r.created_at DESC
                `)
                .all();

            res.json({
                reports
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao carregar denúncias."
            });
        }
    }
);


/* ==========================================
   RESOLVER DENÚNCIA
   POST /api/moderation/reports/:id/resolve
========================================== */

router.post(
    "/reports/:id/resolve",
    autenticar,
    exigirModerador,
    (req, res) => {

        try {

            const id =
                Number.parseInt(
                    req.params.id,
                    10
                );

            const report =
                db.prepare(`
                    SELECT *
                    FROM reports
                    WHERE id = ?
                `)
                .get(id);

            if (!report) {

                return res.status(404).json({
                    error:
                        "Denúncia não encontrada."
                });
            }

            db.prepare(`
                UPDATE reports

                SET
                    status = 'resolved'

                WHERE id = ?
            `)
            .run(id);

            res.json({
                message:
                    "Denúncia resolvida."
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao resolver denúncia."
            });
        }
    }
);


/* ==========================================
   VERIFICAÇÕES DE VENDEDORES
   GET /api/moderation/verifications
========================================== */

router.get(
    "/verifications",
    autenticar,
    exigirModerador,
    (req, res) => {

        try {

            const requests =
                db.prepare(`
                    SELECT
                        v.*,

                        u.username,
                        u.email,
                        u.seller_verified,
                        u.verification_status

                    FROM verification_requests v

                    INNER JOIN users u
                        ON u.id = v.user_id

                    ORDER BY
                        v.created_at ASC
                `)
                .all();

            res.json({
                verifications:
                    requests
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao carregar verificações."
            });
        }
    }
);


/* ==========================================
   APROVAR VERIFICAÇÃO
   POST /api/moderation/verifications/:id/approve
========================================== */

router.post(
    "/verifications/:id/approve",
    autenticar,
    exigirModerador,
    (req, res) => {

        try {

            const id =
                Number.parseInt(
                    req.params.id,
                    10
                );

            const verification =
                db.prepare(`
                    SELECT *
                    FROM verification_requests
                    WHERE id = ?
                `)
                .get(id);

            if (!verification) {

                return res.status(404).json({
                    error:
                        "Solicitação não encontrada."
                });
            }

            const agora =
                Date.now();

            db.transaction(() => {

                db.prepare(`
                    UPDATE verification_requests

                    SET
                        status = 'approved',
                        updated_at = ?

                    WHERE id = ?
                `)
                .run(
                    agora,
                    id
                );

                db.prepare(`
                    UPDATE users

                    SET
                        seller_verified = 1,
                        verification_status = 'approved'

                    WHERE id = ?
                `)
                .run(
                    verification.user_id
                );

            })();

            res.json({
                message:
                    "Vendedor verificado com sucesso."
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao aprovar verificação."
            });
        }
    }
);


/* ==========================================
   REJEITAR VERIFICAÇÃO
   POST /api/moderation/verifications/:id/reject
========================================== */

router.post(
    "/verifications/:id/reject",
    autenticar,
    exigirModerador,
    (req, res) => {

        try {

            const id =
                Number.parseInt(
                    req.params.id,
                    10
                );

            const motivo =
                String(
                    req.body.reason || ""
                ).trim();

            if (!motivo) {

                return res.status(400).json({
                    error:
                        "Informe o motivo da rejeição."
                });
            }

            const verification =
                db.prepare(`
                    SELECT *
                    FROM verification_requests
                    WHERE id = ?
                `)
                .get(id);

            if (!verification) {

                return res.status(404).json({
                    error:
                        "Solicitação não encontrada."
                });
            }

            const agora =
                Date.now();

            db.transaction(() => {

                db.prepare(`
                    UPDATE verification_requests

                    SET
                        status = 'rejected',
                        moderator_note = ?,
                        updated_at = ?

                    WHERE id = ?
                `)
                .run(
                    motivo,
                    agora,
                    id
                );

                db.prepare(`
                    UPDATE users

                    SET
                        seller_verified = 0,
                        verification_status = 'rejected'

                    WHERE id = ?
                `)
                .run(
                    verification.user_id
                );

            })();

            res.json({
                message:
                    "Verificação rejeitada."
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao rejeitar verificação."
            });
        }
    }
);


/* ==========================================
   SUSPENDER USUÁRIO
   POST /api/moderation/users/:id/suspend
========================================== */

router.post(
    "/users/:id/suspend",
    autenticar,
    exigirModerador,
    (req, res) => {

        try {

            const id =
                Number.parseInt(
                    req.params.id,
                    10
                );

            if (
                id === req.user.id
            ) {
                return res.status(400).json({
                    error:
                        "Você não pode suspender sua própria conta."
                });
            }

            const usuario =
                db.prepare(`
                    SELECT
                        id,
                        username,
                        role,
                        suspended

                    FROM users

                    WHERE id = ?
                `)
                .get(id);

            if (!usuario) {

                return res.status(404).json({
                    error:
                        "Usuário não encontrado."
                });
            }

            if (
                usuario.role === "admin" &&
                req.user.role !== "admin"
            ) {
                return res.status(403).json({
                    error:
                        "Moderadores não podem suspender administradores."
                });
            }

            db.prepare(`
                UPDATE users

                SET suspended = 1

                WHERE id = ?
            `)
            .run(id);

            res.json({
                message:
                    "Usuário suspenso."
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao suspender usuário."
            });
        }
    }
);


/* ==========================================
   REATIVAR USUÁRIO
   POST /api/moderation/users/:id/unsuspend
========================================== */

router.post(
    "/users/:id/unsuspend",
    autenticar,
    exigirModerador,
    (req, res) => {

        try {

            const id =
                Number.parseInt(
                    req.params.id,
                    10
                );

            const usuario =
                db.prepare(`
                    SELECT
                        id,
                        username,
                        role

                    FROM users

                    WHERE id = ?
                `)
                .get(id);

            if (!usuario) {

                return res.status(404).json({
                    error:
                        "Usuário não encontrado."
                });
            }

            if (
                usuario.role === "admin" &&
                req.user.role !== "admin"
            ) {
                return res.status(403).json({
                    error:
                        "Moderadores não podem alterar administradores."
                });
            }

            db.prepare(`
                UPDATE users

                SET suspended = 0

                WHERE id = ?
            `)
            .run(id);

            res.json({
                message:
                    "Usuário reativado."
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao reativar usuário."
            });
        }
    }
);


/* ==========================================
   CRIAR DENÚNCIA
   POST /api/moderation/report
========================================== */

router.post(
    "/report",
    autenticar,
    (req, res) => {

        try {

            const {
                product_id = null,
                reported_user_id = null,
                reason,
                description = ""
            } = req.body;

            const motivo =
                String(
                    reason || ""
                ).trim();

            const detalhes =
                String(
                    description || ""
                ).trim();

            if (!motivo) {

                return res.status(400).json({
                    error:
                        "Informe o motivo da denúncia."
                });
            }

            if (motivo.length > 200) {

                return res.status(400).json({
                    error:
                        "O motivo é muito grande."
                });
            }

            if (detalhes.length > 2000) {

                return res.status(400).json({
                    error:
                        "A descrição é muito grande."
                });
            }

            let produtoId = null;
            let usuarioId = null;

            if (product_id !== null) {

                produtoId =
                    Number.parseInt(
                        product_id,
                        10
                    );

                if (
                    !Number.isInteger(
                        produtoId
                    )
                ) {
                    return res.status(400).json({
                        error:
                            "Produto inválido."
                    });
                }

                const produto =
                    db.prepare(`
                        SELECT id
                        FROM products
                        WHERE id = ?
                    `)
                    .get(produtoId);

                if (!produto) {

                    return res.status(404).json({
                        error:
                            "Produto não encontrado."
                    });
                }
            }

            if (reported_user_id !== null) {

                usuarioId =
                    Number.parseInt(
                        reported_user_id,
                        10
                    );

                if (
                    !Number.isInteger(
                        usuarioId
                    )
                ) {
                    return res.status(400).json({
                        error:
                            "Usuário inválido."
                    });
                }

                const usuario =
                    db.prepare(`
                        SELECT id
                        FROM users
                        WHERE id = ?
                    `)
                    .get(usuarioId);

                if (!usuario) {

                    return res.status(404).json({
                        error:
                            "Usuário não encontrado."
                    });
                }
            }

            if (
                produtoId === null &&
                usuarioId === null
            ) {
                return res.status(400).json({
                    error:
                        "A denúncia precisa estar relacionada a um produto ou usuário."
                });
            }

            db.prepare(`
                INSERT INTO reports
                (
                    reporter_id,
                    product_id,
                    reported_user_id,
                    reason,
                    description,
                    status,
                    created_at
                )

                VALUES
                (?, ?, ?, ?, ?, 'pending', ?)
            `)
            .run(
                req.user.id,
                produtoId,
                usuarioId,
                motivo,
                detalhes,
                Date.now()
            );

            res.status(201).json({
                message:
                    "Denúncia enviada para análise."
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao enviar denúncia."
            });
        }
    }
);


module.exports = router;
