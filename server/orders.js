const express = require("express");

const db = require("./database");
const { autenticar } = require("./auth");

const router = express.Router();

const PLATFORM_FEE_CENTS = 97;

function formatarPedido(pedido) {
    return {
        id: pedido.id,

        buyer_id: pedido.buyer_id,
        seller_id: pedido.seller_id,
        product_id: pedido.product_id,

        price_cents: pedido.price_cents,
        price: pedido.price_cents / 100,

        platform_fee_cents: pedido.platform_fee_cents,
        platform_fee: pedido.platform_fee_cents / 100,

        seller_amount_cents: pedido.seller_amount_cents,
        seller_amount: pedido.seller_amount_cents / 100,

        status: pedido.status,

        product: {
            id: pedido.product_id,
            title: pedido.product_title,
            image_url: pedido.product_image_url
        },

        buyer: {
            id: pedido.buyer_id,
            username: pedido.buyer_username,
            avatar_url: pedido.buyer_avatar_url
        },

        seller: {
            id: pedido.seller_id,
            username: pedido.seller_username,
            avatar_url: pedido.seller_avatar_url,
            seller_verified: !!pedido.seller_verified
        },

        created_at: pedido.created_at,
        completed_at: pedido.completed_at
    };
}

function buscarPedido(id) {
    return db.prepare(`
        SELECT
            o.*,

            p.title AS product_title,
            p.image_url AS product_image_url,

            buyer.username AS buyer_username,
            buyer.avatar_url AS buyer_avatar_url,

            seller.username AS seller_username,
            seller.avatar_url AS seller_avatar_url,
            seller.seller_verified

        FROM orders o

        INNER JOIN products p
            ON p.id = o.product_id

        INNER JOIN users buyer
            ON buyer.id = o.buyer_id

        INNER JOIN users seller
            ON seller.id = o.seller_id

        WHERE o.id = ?
    `).get(id);
}

/*
 * CRIAR PEDIDO
 *
 * O pedido apenas registra a compra.
 * O pagamento real será integrado posteriormente
 * com uma conta adulta/provedor de pagamentos.
 */
router.post(
    "/:productId",
    autenticar,
    (req, res) => {
        const productId = Number.parseInt(
            req.params.productId,
            10
        );

        if (!Number.isInteger(productId)) {
            return res.status(400).json({
                error: "Produto inválido."
            });
        }

        try {
            const criarPedido = db.transaction(() => {
                const produto = db.prepare(`
                    SELECT
                        p.*,
                        u.suspended AS seller_suspended,
                        u.seller_verified
                    FROM products p
                    INNER JOIN users u
                        ON u.id = p.seller_id
                    WHERE p.id = ?
                `).get(productId);

                if (!produto) {
                    throw new Error("PRODUCT_NOT_FOUND");
                }

                if (produto.status !== "approved") {
                    throw new Error("PRODUCT_UNAVAILABLE");
                }

                if (produto.stock <= 0) {
                    throw new Error("OUT_OF_STOCK");
                }

                if (produto.seller_id === req.user.id) {
                    throw new Error("OWN_PRODUCT");
                }

                if (produto.seller_suspended) {
                    throw new Error("SELLER_SUSPENDED");
                }

                if (!produto.seller_verified) {
                    throw new Error("SELLER_NOT_VERIFIED");
                }

                if (
                    produto.price_cents <=
                    PLATFORM_FEE_CENTS
                ) {
                    throw new Error("PRICE_TOO_LOW");
                }

                const estoqueAtualizado = db.prepare(`
                    UPDATE products
                    SET
                        stock = stock - 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    AND status = 'approved'
                    AND stock > 0
                `).run(productId);

                if (estoqueAtualizado.changes !== 1) {
                    throw new Error("STOCK_CHANGED");
                }

                const sellerAmount =
                    produto.price_cents -
                    PLATFORM_FEE_CENTS;

                const resultado = db.prepare(`
                    INSERT INTO orders (
                        buyer_id,
                        seller_id,
                        product_id,
                        price_cents,
                        platform_fee_cents,
                        seller_amount_cents,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'pending')
                `).run(
                    req.user.id,
                    produto.seller_id,
                    productId,
                    produto.price_cents,
                    PLATFORM_FEE_CENTS,
                    sellerAmount
                );

                return resultado.lastInsertRowid;
            })();

            const pedido = buscarPedido(
                criarPedido
            );

            return res.status(201).json({
                success: true,
                message: "Pedido criado com sucesso.",
                order: formatarPedido(pedido)
            });

        } catch (erro) {
            const erros = {
                PRODUCT_NOT_FOUND: [
                    404,
                    "Produto não encontrado."
                ],

                PRODUCT_UNAVAILABLE: [
                    400,
                    "Esse produto não está disponível."
                ],

                OUT_OF_STOCK: [
                    400,
                    "Produto sem estoque."
                ],

                OWN_PRODUCT: [
                    400,
                    "Você não pode comprar seu próprio produto."
                ],

                SELLER_SUSPENDED: [
                    400,
                    "O vendedor está suspenso."
                ],

                SELLER_NOT_VERIFIED: [
                    400,
                    "O vendedor não está verificado."
                ],

                PRICE_TOO_LOW: [
                    400,
                    "O valor do produto precisa ser maior que a taxa da plataforma."
                ],

                STOCK_CHANGED: [
                    409,
                    "O estoque acabou. Tente novamente."
                ]
            };

            if (erros[erro.message]) {
                const [status, mensagem] =
                    erros[erro.message];

                return res.status(status).json({
                    error: mensagem
                });
            }

            console.error(
                "Erro ao criar pedido:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível criar o pedido."
            });
        }
    }
);

/*
 * LISTAR PEDIDOS DO USUÁRIO
 */
router.get(
    "/",
    autenticar,
    (req, res) => {
        try {
            const pedidos = db.prepare(`
                SELECT
                    o.*,

                    p.title AS product_title,
                    p.image_url AS product_image_url,

                    buyer.username AS buyer_username,
                    buyer.avatar_url AS buyer_avatar_url,

                    seller.username AS seller_username,
                    seller.avatar_url AS seller_avatar_url,
                    seller.seller_verified

                FROM orders o

                INNER JOIN products p
                    ON p.id = o.product_id

                INNER JOIN users buyer
                    ON buyer.id = o.buyer_id

                INNER JOIN users seller
                    ON seller.id = o.seller_id

                WHERE
                    o.buyer_id = ?
                    OR o.seller_id = ?

                ORDER BY o.created_at DESC
            `).all(
                req.user.id,
                req.user.id
            );

            return res.json({
                orders: pedidos.map(
                    formatarPedido
                )
            });

        } catch (erro) {
            console.error(
                "Erro ao listar pedidos:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível carregar os pedidos."
            });
        }
    }
);

/*
 * DETALHES DO PEDIDO
 */
router.get(
    "/:id",
    autenticar,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    error: "Pedido inválido."
                });
            }

            const pedido = buscarPedido(id);

            if (!pedido) {
                return res.status(404).json({
                    error: "Pedido não encontrado."
                });
            }

            const participante =
                pedido.buyer_id === req.user.id ||
                pedido.seller_id === req.user.id;

            if (!participante) {
                return res.status(403).json({
                    error: "Você não pode acessar esse pedido."
                });
            }

            return res.json({
                order: formatarPedido(pedido)
            });

        } catch (erro) {
            console.error(
                "Erro ao carregar pedido:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível carregar o pedido."
            });
        }
    }
);

/*
 * MENSAGENS DO PEDIDO
 */
router.get(
    "/:id/messages",
    autenticar,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const pedido = db.prepare(`
                SELECT *
                FROM orders
                WHERE id = ?
            `).get(id);

            if (!pedido) {
                return res.status(404).json({
                    error: "Pedido não encontrado."
                });
            }

            if (
                pedido.buyer_id !== req.user.id &&
                pedido.seller_id !== req.user.id
            ) {
                return res.status(403).json({
                    error: "Acesso negado."
                });
            }

            const mensagens = db.prepare(`
                SELECT
                    m.id,
                    m.order_id,
                    m.sender_id,
                    m.message,
                    m.created_at,
                    u.username AS sender_username,
                    u.avatar_url AS sender_avatar_url

                FROM messages m

                INNER JOIN users u
                    ON u.id = m.sender_id

                WHERE m.order_id = ?

                ORDER BY m.created_at ASC
            `).all(id);

            return res.json({
                messages: mensagens
            });

        } catch (erro) {
            console.error(
                "Erro ao carregar mensagens:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível carregar as mensagens."
            });
        }
    }
);

/*
 * ENVIAR MENSAGEM
 */
router.post(
    "/:id/message",
    autenticar,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const message = String(
                req.body.message || ""
            ).trim();

            if (!message) {
                return res.status(400).json({
                    error: "Digite uma mensagem."
                });
            }

            if (message.length > 2000) {
                return res.status(400).json({
                    error: "A mensagem pode ter no máximo 2000 caracteres."
                });
            }

            const pedido = db.prepare(`
                SELECT *
                FROM orders
                WHERE id = ?
            `).get(id);

            if (!pedido) {
                return res.status(404).json({
                    error: "Pedido não encontrado."
                });
            }

            if (
                pedido.buyer_id !== req.user.id &&
                pedido.seller_id !== req.user.id
            ) {
                return res.status(403).json({
                    error: "Você não participa desse pedido."
                });
            }

            if (pedido.status === "cancelled") {
                return res.status(400).json({
                    error: "Esse pedido foi cancelado."
                });
            }

            const resultado = db.prepare(`
                INSERT INTO messages (
                    order_id,
                    sender_id,
                    message
                )
                VALUES (?, ?, ?)
            `).run(
                id,
                req.user.id,
                message
            );

            const novaMensagem = db.prepare(`
                SELECT
                    m.*,
                    u.username AS sender_username,
                    u.avatar_url AS sender_avatar_url
                FROM messages m
                INNER JOIN users u
                    ON u.id = m.sender_id
                WHERE m.id = ?
            `).get(
                resultado.lastInsertRowid
            );

            return res.status(201).json({
                success: true,
                message: novaMensagem
            });

        } catch (erro) {
            console.error(
                "Erro ao enviar mensagem:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível enviar a mensagem."
            });
        }
    }
);

/*
 * CONCLUIR PEDIDO
 *
 * Somente o comprador pode concluir.
 */
router.post(
    "/:id/complete",
    autenticar,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const pedido = db.prepare(`
                SELECT *
                FROM orders
                WHERE id = ?
            `).get(id);

            if (!pedido) {
                return res.status(404).json({
                    error: "Pedido não encontrado."
                });
            }

            if (pedido.buyer_id !== req.user.id) {
                return res.status(403).json({
                    error: "Somente o comprador pode concluir o pedido."
                });
            }

            if (pedido.status !== "pending") {
                return res.status(400).json({
                    error: "Esse pedido não pode ser concluído."
                });
            }

            db.prepare(`
                UPDATE orders
                SET
                    status = 'completed',
                    completed_at = CURRENT_TIMESTAMP
                WHERE id = ?
                AND buyer_id = ?
                AND status = 'pending'
            `).run(
                id,
                req.user.id
            );

            return res.json({
                success: true,
                message: "Pedido concluído."
            });

        } catch (erro) {
            console.error(
                "Erro ao concluir pedido:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível concluir o pedido."
            });
        }
    }
);

/*
 * ABRIR PROBLEMA
 */
router.post(
    "/:id/problem",
    autenticar,
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
                    error: "Informe o motivo do problema."
                });
            }

            if (motivo.length > 2000) {
                return res.status(400).json({
                    error: "O motivo é muito grande."
                });
            }

            const pedido = db.prepare(`
                SELECT *
                FROM orders
                WHERE id = ?
            `).get(id);

            if (!pedido) {
                return res.status(404).json({
                    error: "Pedido não encontrado."
                });
            }

            if (
                pedido.buyer_id !== req.user.id &&
                pedido.seller_id !== req.user.id
            ) {
                return res.status(403).json({
                    error: "Acesso negado."
                });
            }

            if (
                pedido.status === "completed" ||
                pedido.status === "cancelled"
            ) {
                return res.status(400).json({
                    error: "Esse pedido já foi encerrado."
                });
            }

            db.prepare(`
                UPDATE orders
                SET status = 'problem'
                WHERE id = ?
            `).run(id);

            db.prepare(`
                INSERT INTO messages (
                    order_id,
                    sender_id,
                    message
                )
                VALUES (?, ?, ?)
            `).run(
                id,
                req.user.id,
                `PROBLEMA ABERTO: ${motivo}`
            );

            return res.json({
                success: true,
                message: "Problema aberto. A equipe poderá analisar o pedido."
            });

        } catch (erro) {
            console.error(
                "Erro ao abrir problema:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível abrir o problema."
            });
        }
    }
);

/*
 * AVALIAR PEDIDO
 */
router.post(
    "/:id/review",
    autenticar,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const rating = String(
                req.body.rating || ""
            ).trim();

            const comment = String(
                req.body.comment || ""
            ).trim();

            if (
                ![
                    "positive",
                    "neutral",
                    "negative"
                ].includes(rating)
            ) {
                return res.status(400).json({
                    error: "Avaliação inválida."
                });
            }

            if (comment.length > 1000) {
                return res.status(400).json({
                    error: "O comentário pode ter no máximo 1000 caracteres."
                });
            }

            const pedido = db.prepare(`
                SELECT *
                FROM orders
                WHERE id = ?
            `).get(id);

            if (!pedido) {
                return res.status(404).json({
                    error: "Pedido não encontrado."
                });
            }

            if (pedido.buyer_id !== req.user.id) {
                return res.status(403).json({
                    error: "Somente o comprador pode avaliar."
                });
            }

            if (pedido.status !== "completed") {
                return res.status(400).json({
                    error: "Conclua o pedido antes de avaliar."
                });
            }

            const existente = db.prepare(`
                SELECT id
                FROM reviews
                WHERE order_id = ?
            `).get(id);

            if (existente) {
                return res.status(400).json({
                    error: "Esse pedido já foi avaliado."
                });
            }

            const adicionarAvaliacao = db.transaction(() => {
                db.prepare(`
                    INSERT INTO reviews (
                        order_id,
                        buyer_id,
                        seller_id,
                        rating,
                        comment
                    )
                    VALUES (?, ?, ?, ?, ?)
                `).run(
                    id,
                    req.user.id,
                    pedido.seller_id,
                    rating,
                    comment
                );

                if (rating === "positive") {
                    db.prepare(`
                        UPDATE users
                        SET rating_positive =
                            rating_positive + 1
                        WHERE id = ?
                    `).run(pedido.seller_id);
                }

                if (rating === "neutral") {
                    db.prepare(`
                        UPDATE users
                        SET rating_neutral =
                            rating_neutral + 1
                        WHERE id = ?
                    `).run(pedido.seller_id);
                }

                if (rating === "negative") {
                    db.prepare(`
                        UPDATE users
                        SET rating_negative =
                            rating_negative + 1
                        WHERE id = ?
                    `).run(pedido.seller_id);
                }
            });

            adicionarAvaliacao();

            return res.status(201).json({
                success: true,
                message: "Avaliação enviada."
            });

        } catch (erro) {
            console.error(
                "Erro ao avaliar pedido:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível enviar a avaliação."
            });
        }
    }
);

module.exports = router;
