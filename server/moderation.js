const express = require("express");

const db = require("./database");
const { autenticar } = require("./auth");

const router = express.Router();

function exigirModerador(req, res, next) {
    if (
        !req.user ||
        !["admin", "moderator"].includes(req.user.role)
    ) {
        return res.status(403).json({
            error: "Acesso restrito à moderação."
        });
    }

    next();
}

/*
 * PRODUTOS PARA MODERAÇÃO
 */
router.get(
    "/products",
    autenticar,
    exigirModerador,
    (req, res) => {
        try {
            const status = String(
                req.query.status || "pending"
            );

            const permitidos = [
                "pending",
                "approved",
                "rejected",
                "paused"
            ];

            if (!permitidos.includes(status)) {
                return res.status(400).json({
                    error: "Status inválido."
                });
            }

            const produtos = db.prepare(`
                SELECT
                    p.*,

                    u.username AS seller_username,
                    u.email AS seller_email,
                    u.avatar_url AS seller_avatar_url,
                    u.seller_verified

                FROM products p

                INNER JOIN users u
                    ON u.id = p.seller_id

                WHERE p.status = ?

                ORDER BY p.created_at ASC
            `).all(status);

            return res.json({
                products: produtos
            });

        } catch (erro) {
            console.error(
                "Erro ao carregar produtos para moderação:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível carregar os produtos."
            });
        }
    }
);

/*
 * APROVAR PRODUTO
 */
router.post(
    "/products/:id/approve",
    autenticar,
    exigirModerador,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const resultado = db.prepare(`
                UPDATE products
                SET
                    status = 'approved',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                AND status = 'pending'
            `).run(id);

            if (resultado.changes !== 1) {
                return res.status(404).json({
                    error: "Produto pendente não encontrado."
                });
            }

            return res.json({
                success: true,
                message: "Produto aprovado."
            });

        } catch (erro) {
            console.error(
                "Erro ao aprovar produto:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível aprovar o produto."
            });
        }
    }
);

/*
 * REJEITAR PRODUTO
 */
router.post(
    "/products/:id/reject",
    autenticar,
    exigirModerador,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const motivo = String(
                req.body.reason || ""
            ).trim();

            if (!motivo) {
                return res.status(400).json({
                    error: "Informe o motivo da rejeição."
                });
            }

            if (motivo.length > 1000) {
                return res.status(400).json({
                    error: "Motivo muito grande."
                });
            }

            const resultado = db.prepare(`
                UPDATE products
                SET
                    status = 'rejected',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                AND status = 'pending'
            `).run(id);

            if (resultado.changes !== 1) {
                return res.status(404).json({
                    error: "Produto pendente não encontrado."
                });
            }

            return res.json({
                success: true,
                message: "Produto rejeitado.",
                reason: motivo
            });

        } catch (erro) {
            console.error(
                "Erro ao rejeitar produto:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível rejeitar o produto."
            });
        }
    }
);

/*
 * SOLICITAÇÕES DE VERIFICAÇÃO
 */
router.get(
    "/verifications",
    autenticar,
    exigirModerador,
    (req, res) => {
        try {
            const status = String(
                req.query.status || "pending"
            );

            const permitidos = [
                "pending",
                "approved",
                "rejected"
            ];

            if (!permitidos.includes(status)) {
                return res.status(400).json({
                    error: "Status inválido."
                });
            }

            const verificacoes = db.prepare(`
                SELECT
                    vr.id,
                    vr.user_id,
                    vr.status,
                    vr.note,
                    vr.created_at,
                    vr.reviewed_at,

                    u.username,
                    u.email,
                    u.avatar_url,
                    u.bio,
                    u.seller_verified,
                    u.verification_status

                FROM verification_requests vr

                INNER JOIN users u
                    ON u.id = vr.user_id

                WHERE vr.status = ?

                ORDER BY vr.created_at ASC
            `).all(status);

            return res.json({
                verifications: verificacoes
            });

        } catch (erro) {
            console.error(
                "Erro ao carregar verificações:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível carregar as verificações."
            });
        }
    }
);

/*
 * APROVAR VENDEDOR
 */
router.post(
    "/verifications/:id/approve",
    autenticar,
    exigirModerador,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const verificacao = db.prepare(`
                SELECT *
                FROM verification_requests
                WHERE id = ?
            `).get(id);

            if (!verificacao) {
                return res.status(404).json({
                    error: "Solicitação não encontrada."
                });
            }

            const aprovar = db.transaction(() => {
                db.prepare(`
                    UPDATE verification_requests
                    SET
                        status = 'approved',
                        reviewed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(id);

                db.prepare(`
                    UPDATE users
                    SET
                        seller_verified = 1,
                        verification_status = 'approved'
                    WHERE id = ?
                `).run(verificacao.user_id);
            });

            aprovar();

            return res.json({
                success: true,
                message: "Vendedor aprovado."
            });

        } catch (erro) {
            console.error(
                "Erro ao aprovar vendedor:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível aprovar o vendedor."
            });
        }
    }
);

/*
 * REJEITAR VENDEDOR
 */
router.post(
    "/verifications/:id/reject",
    autenticar,
    exigirModerador,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const motivo = String(
                req.body.reason || ""
            ).trim();

            if (!motivo) {
                return res.status(400).json({
                    error: "Informe o motivo da rejeição."
                });
            }

            const verificacao = db.prepare(`
                SELECT *
                FROM verification_requests
                WHERE id = ?
            `).get(id);

            if (!verificacao) {
                return res.status(404).json({
                    error: "Solicitação não encontrada."
                });
            }

            const rejeitar = db.transaction(() => {
                db.prepare(`
                    UPDATE verification_requests
                    SET
                        status = 'rejected',
                        note = ?,
                        reviewed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(
                    motivo,
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

            return res.json({
                success: true,
                message: "Solicitação rejeitada."
            });

        } catch (erro) {
            console.error(
                "Erro ao rejeitar vendedor:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível rejeitar o vendedor."
            });
        }
    }
);

/*
 * DENÚNCIAS
 */
router.get(
    "/reports",
    autenticar,
    exigirModerador,
    (req, res) => {
        try {
            const status = String(
                req.query.status || "pending"
            );

            const permitidos = [
                "pending",
                "resolved"
            ];

            if (!permitidos.includes(status)) {
                return res.status(400).json({
                    error: "Status inválido."
                });
            }

            const reports = db.prepare(`
                SELECT
                    r.*,

                    reporter.username AS reporter_username,

                    reported.username AS reported_username,

                    p.title AS product_title

                FROM reports r

                INNER JOIN users reporter
                    ON reporter.id = r.reporter_id

                LEFT JOIN users reported
                    ON reported.id = r.reported_user_id

                LEFT JOIN products p
                    ON p.id = r.product_id

                WHERE r.status = ?

                ORDER BY r.created_at ASC
            `).all(status);

            return res.json({
                reports
            });

        } catch (erro) {
            console.error(
                "Erro ao carregar denúncias:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível carregar as denúncias."
            });
        }
    }
);

/*
 * RESOLVER DENÚNCIA
 */
router.post(
    "/reports/:id/resolve",
    autenticar,
    exigirModerador,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const resultado = db.prepare(`
                UPDATE reports
                SET
                    status = 'resolved',
                    resolved_at = CURRENT_TIMESTAMP
                WHERE id = ?
                AND status = 'pending'
            `).run(id);

            if (resultado.changes !== 1) {
                return res.status(404).json({
                    error: "Denúncia pendente não encontrada."
                });
            }

            return res.json({
                success: true,
                message: "Denúncia resolvida."
            });

        } catch (erro) {
            console.error(
                "Erro ao resolver denúncia:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível resolver a denúncia."
            });
        }
    }
);

/*
 * SUSPENDER USUÁRIO
 */
router.post(
    "/users/:id/suspend",
    autenticar,
    exigirModerador,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            if (id === req.user.id) {
                return res.status(400).json({
                    error: "Você não pode suspender sua própria conta."
                });
            }

            const usuario = db.prepare(`
                SELECT id, role
                FROM users
                WHERE id = ?
            `).get(id);

            if (!usuario) {
                return res.status(404).json({
                    error: "Usuário não encontrado."
                });
            }

            if (
                usuario.role === "admin" &&
                req.user.role !== "admin"
            ) {
                return res.status(403).json({
                    error: "Moderadores não podem suspender administradores."
                });
            }

            db.prepare(`
                UPDATE users
                SET suspended = 1
                WHERE id = ?
            `).run(id);

            return res.json({
                success: true,
                message: "Usuário suspenso."
            });

        } catch (erro) {
            console.error(
                "Erro ao suspender usuário:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível suspender o usuário."
            });
        }
    }
);

/*
 * REATIVAR USUÁRIO
 */
router.post(
    "/users/:id/unsuspend",
    autenticar,
    exigirModerador,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const resultado = db.prepare(`
                UPDATE users
                SET suspended = 0
                WHERE id = ?
            `).run(id);

            if (resultado.changes !== 1) {
                return res.status(404).json({
                    error: "Usuário não encontrado."
                });
            }

            return res.json({
                success: true,
                message: "Usuário reativado."
            });

        } catch (erro) {
            console.error(
                "Erro ao reativar usuário:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível reativar o usuário."
            });
        }
    }
);

/*
 * CRIAR DENÚNCIA
 */
router.post(
    "/report",
    autenticar,
    (req, res) => {
        try {
            const productId =
                req.body.product_id
                    ? Number.parseInt(
                        req.body.product_id,
                        10
                    )
                    : null;

            const reportedUserId =
                req.body.reported_user_id
                    ? Number.parseInt(
                        req.body.reported_user_id,
                        10
                    )
                    : null;

            const reason = String(
                req.body.reason || ""
            ).trim();

            if (!reason) {
                return res.status(400).json({
                    error: "Informe o motivo da denúncia."
                });
            }

            if (reason.length > 2000) {
                return res.status(400).json({
                    error: "A denúncia é muito grande."
                });
            }

            if (!productId && !reportedUserId) {
                return res.status(400).json({
                    error: "Informe o produto ou usuário denunciado."
                });
            }

            if (
                productId &&
                reportedUserId
            ) {
                return res.status(400).json({
                    error: "Informe apenas um alvo."
                });
            }

            if (productId) {
                const produto = db.prepare(`
                    SELECT id
                    FROM products
                    WHERE id = ?
                `).get(productId);

                if (!produto) {
                    return res.status(404).json({
                        error: "Produto não encontrado."
                    });
                }
            }

            if (reportedUserId) {
                const usuario = db.prepare(`
                    SELECT id
                    FROM users
                    WHERE id = ?
                `).get(reportedUserId);

                if (!usuario) {
                    return res.status(404).json({
                        error: "Usuário não encontrado."
                    });
                }

                if (reportedUserId === req.user.id) {
                    return res.status(400).json({
                        error: "Você não pode denunciar a si mesmo."
                    });
                }
            }

            const resultado = db.prepare(`
                INSERT INTO reports (
                    reporter_id,
                    product_id,
                    reported_user_id,
                    reason,
                    status
                )
                VALUES (?, ?, ?, ?, 'pending')
            `).run(
                req.user.id,
                productId,
                reportedUserId,
                reason
            );

            return res.status(201).json({
                success: true,
                report_id: resultado.lastInsertRowid,
                message: "Denúncia enviada para análise."
            });

        } catch (erro) {
            console.error(
                "Erro ao criar denúncia:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível enviar a denúncia."
            });
        }
    }
);

module.exports = router;
