const express = require("express");

const db = require("./database");
const { autenticar } = require("./auth");

const router = express.Router();

const TAXA_CENTS = 97;


/* ==========================================
   CRIAR PEDIDO / COMPRA
   POST /api/orders/:productId
========================================== */

router.post(
    "/:productId",
    autenticar,
    (req, res) => {

        try {

            const productId =
                Number.parseInt(
                    req.params.productId,
                    10
                );

            if (!Number.isInteger(productId)) {
                return res.status(400).json({
                    error: "Produto inválido."
                });
            }

            const produto = db.prepare(`
                SELECT *
                FROM products
                WHERE id = ?
            `).get(productId);

            if (!produto) {
                return res.status(404).json({
                    error: "Produto não encontrado."
                });
            }

            if (produto.status !== "approved") {
                return res.status(400).json({
                    error:
                        "Este anúncio não está disponível."
                });
            }

            if (produto.stock <= 0) {
                return res.status(400).json({
                    error:
                        "Este produto está sem estoque."
                });
            }

            if (
                produto.seller_id ===
                req.user.id
            ) {
                return res.status(400).json({
                    error:
                        "Você não pode comprar seu próprio anúncio."
                });
            }

            if (
                produto.price_cents <
                TAXA_CENTS
            ) {
                return res.status(400).json({
                    error:
                        "O preço deste produto é inválido."
                });
            }

            const comprador =
                db.prepare(`
                    SELECT *
                    FROM users
                    WHERE id = ?
                `).get(req.user.id);

            if (!comprador) {
                return res.status(401).json({
                    error:
                        "Usuário não encontrado."
                });
            }

            if (comprador.suspended) {
                return res.status(403).json({
                    error:
                        "Sua conta está suspensa."
                });
            }

            const valorTotal =
                produto.price_cents;

            const valorVendedor =
                valorTotal -
                TAXA_CENTS;

            if (valorVendedor < 0) {
                return res.status(400).json({
                    error:
                        "Valor inválido para o pedido."
                });
            }

            const resultado =
                db.transaction(() => {

                    const agora =
                        Date.now();

                    db.prepare(`
                        UPDATE products

                        SET
                            stock = stock - 1,
                            updated_at = ?

                        WHERE
                            id = ?
                            AND stock > 0
                    `).run(
                        agora,
                        productId
                    );

                    const pedido =
                        db.prepare(`
                            INSERT INTO orders
                            (
                                buyer_id,
                                seller_id,
                                product_id,
                                amount_cents,
                                platform_fee_cents,
                                seller_amount_cents,
                                status,
                                created_at,
                                updated_at
                            )

                            VALUES
                            (
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                'pending',
                                ?,
                                ?
                            )
                        `).run(
                            req.user.id,
                            produto.seller_id,
                            produto.id,
                            valorTotal,
                            TAXA_CENTS,
                            valorVendedor,
                            agora,
                            agora
                        );

                    return pedido.lastInsertRowid;

                })();

            const pedido =
                obterPedido(
                    resultado,
                    req.user.id
                );

            res.status(201).json({
                message:
                    "Pedido criado com sucesso.",

                order:
                    pedido
            });

        } catch (erro) {

            console.error(
                "Erro ao criar pedido:",
                erro
            );

            res.status(500).json({
                error:
                    "Erro ao criar pedido."
            });
        }
    }
);


/* ==========================================
   LISTAR PEDIDOS DO USUÁRIO
   GET /api/orders
========================================== */

router.get(
    "/",
    autenticar,
    (req, res) => {

        try {

            const pedidos =
                db.prepare(`
                    SELECT
                        o.*,

                        p.title AS product_title,
                        p.image_url AS product_image,

                        buyer.username
                            AS buyer_username,

                        seller.username
                            AS seller_username

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

                    ORDER BY
                        o.created_at DESC
                `)
                .all(
                    req.user.id,
                    req.user.id
                );

            res.json({
                orders:
                    pedidos.map(
                        pedido =>
                            formatarPedido(
                                pedido,
                                req.user.id
                            )
                    )
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao carregar pedidos."
            });
        }
    }
);


/* ==========================================
   DETALHES DO PEDIDO
   GET /api/orders/:id
========================================== */

router.get(
    "/:id",
    autenticar,
    (req, res) => {

        try {

            const id =
                Number.parseInt(
                    req.params.id,
                    10
                );

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    error:
                        "Pedido inválido."
                });
            }

            const pedido =
                db.prepare(`
                    SELECT
                        o.*,

                        p.title AS product_title,
                        p.description
                            AS product_description,
                        p.image_url
                            AS product_image,

                        buyer.username
                            AS buyer_username,

                        seller.username
                            AS seller_username

                    FROM orders o

                    INNER JOIN products p
                        ON p.id = o.product_id

                    INNER JOIN users buyer
                        ON buyer.id = o.buyer_id

                    INNER JOIN users seller
                        ON seller.id = o.seller_id

                    WHERE o.id = ?
                `)
                .get(id);

            if (!pedido) {
                return res.status(404).json({
                    error:
                        "Pedido não encontrado."
                });
            }

            if (
                pedido.buyer_id !== req.user.id &&
                pedido.seller_id !== req.user.id
            ) {
                return res.status(403).json({
                    error:
                        "Você não tem acesso a este pedido."
                });
            }

            res.json({
                order:
                    formatarPedido(
                        pedido,
                        req.user.id
                    )
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao carregar pedido."
            });
        }
    }
);


/* ==========================================
   MENSAGENS
   GET /api/orders/:id/messages
========================================== */

router.get(
    "/:id/messages",
    autenticar,
    (req, res) => {

        try {

            const orderId =
                Number.parseInt(
                    req.params.id,
                    10
                );

            const pedido =
                buscarPedidoBasico(
                    orderId
                );

            if (!pedido) {
                return res.status(404).json({
                    error:
                        "Pedido não encontrado."
                });
            }

            if (!participaDoPedido(
                pedido,
                req.user.id
            )) {
                return res.status(403).json({
                    error:
                        "Você não participa deste pedido."
                });
            }

            const mensagens =
                db.prepare(`
                    SELECT
                        m.id,
                        m.order_id,
                        m.sender_id,
                        m.message,
                        m.created_at,

                        u.username AS sender_username,
                        u.avatar_url AS sender_avatar

                    FROM messages m

                    INNER JOIN users u
                        ON u.id = m.sender_id

                    WHERE m.order_id = ?

                    ORDER BY
                        m.created_at ASC
                `)
                .all(orderId);

            res.json({
                messages:
                    mensagens
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao carregar mensagens."
            });
        }
    }
);


/* ==========================================
   ENVIAR MENSAGEM
   POST /api/orders/:id/message
========================================== */

router.post(
    "/:id/message",
    autenticar,
    (req, res) => {

        try {

            const orderId =
                Number.parseInt(
                    req.params.id,
                    10
                );

            const mensagem =
                String(
                    req.body.message || ""
                ).trim();

            if (!mensagem) {
                return res.status(400).json({
                    error:
                        "Digite uma mensagem."
                });
            }

            if (mensagem.length > 2000) {
                return res.status(400).json({
                    error:
                        "A mensagem é muito grande."
                });
            }

            const pedido =
                buscarPedidoBasico(
                    orderId
                );

            if (!pedido) {
                return res.status(404).json({
                    error:
                        "Pedido não encontrado."
                });
            }

            if (!participaDoPedido(
                pedido,
                req.user.id
            )) {
                return res.status(403).json({
                    error:
                        "Você não participa deste pedido."
                });
            }

            if (
                pedido.status === "completed"
            ) {
                return res.status(400).json({
                    error:
                        "Este pedido já foi concluído."
                });
            }

            const resultado =
                db.prepare(`
                    INSERT INTO messages
                    (
                        order_id,
                        sender_id,
                        message,
                        created_at
                    )

                    VALUES
                    (?, ?, ?, ?)
                `).run(
                    orderId,
                    req.user.id,
                    mensagem,
                    Date.now()
                );

            const novaMensagem =
                db.prepare(`
                    SELECT
                        m.id,
                        m.order_id,
                        m.sender_id,
                        m.message,
                        m.created_at,

                        u.username
                            AS sender_username,

                        u.avatar_url
                            AS sender_avatar

                    FROM messages m

                    INNER JOIN users u
                        ON u.id = m.sender_id

                    WHERE m.id = ?
                `)
                .get(
                    resultado.lastInsertRowid
                );

            res.status(201).json({
                message:
                    novaMensagem
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao enviar mensagem."
            });
        }
    }
);


/* ==========================================
   CONCLUIR PEDIDO
   COMPRADOR
========================================== */

router.post(
    "/:id/complete",
    autenticar,
    (req, res) => {

        try {

            const orderId =
                Number.parseInt(
                    req.params.id,
                    10
                );

            const pedido =
                buscarPedidoBasico(
                    orderId
                );

            if (!pedido) {
                return res.status(404).json({
                    error:
                        "Pedido não encontrado."
                });
            }

            if (
                pedido.buyer_id !==
                req.user.id
            ) {
                return res.status(403).json({
                    error:
                        "Somente o comprador pode concluir o pedido."
                });
            }

            if (
                pedido.status === "completed"
            ) {
                return res.status(400).json({
                    error:
                        "Este pedido já foi concluído."
                });
            }

            if (
                pedido.status === "problem"
            ) {
                return res.status(400).json({
                    error:
                        "Este pedido está em análise."
                });
            }

            db.prepare(`
                UPDATE orders

                SET
                    status = 'completed',
                    updated_at = ?

                WHERE id = ?
            `).run(
                Date.now(),
                orderId
            );

            res.json({
                message:
                    "Pedido concluído com sucesso."
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao concluir pedido."
            });
        }
    }
);


/* ==========================================
   ABRIR PROBLEMA
   POST /api/orders/:id/problem
========================================== */

router.post(
    "/:id/problem",
    autenticar,
    (req, res) => {

        try {

            const orderId =
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
                        "Informe o motivo do problema."
                });
            }

            if (motivo.length > 2000) {
                return res.status(400).json({
                    error:
                        "O motivo é muito grande."
                });
            }

            const pedido =
                buscarPedidoBasico(
                    orderId
                );

            if (!pedido) {
                return res.status(404).json({
                    error:
                        "Pedido não encontrado."
                });
            }

            if (!participaDoPedido(
                pedido,
                req.user.id
            )) {
                return res.status(403).json({
                    error:
                        "Você não participa deste pedido."
                });
            }

            if (
                pedido.status === "completed"
            ) {
                return res.status(400).json({
                    error:
                        "Este pedido já foi concluído."
                });
            }

            db.prepare(`
                UPDATE orders

                SET
                    status = 'problem',
                    updated_at = ?

                WHERE id = ?
            `).run(
                Date.now(),
                orderId
            );

            db.prepare(`
                INSERT INTO messages
                (
                    order_id,
                    sender_id,
                    message,
                    created_at
                )

                VALUES
                (?, ?, ?, ?)
            `).run(
                orderId,
                req.user.id,
                `[PROBLEMA] ${motivo}`,
                Date.now()
            );

            res.json({
                message:
                    "Problema registrado. O pedido foi colocado em análise."
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao registrar problema."
            });
        }
    }
);


/* ==========================================
   AVALIAÇÃO
   POST /api/orders/:id/review
========================================== */

router.post(
    "/:id/review",
    autenticar,
    (req, res) => {

        try {

            const orderId =
                Number.parseInt(
                    req.params.id,
                    10
                );

            const rating =
                String(
                    req.body.rating || ""
                ).trim();

            const comment =
                String(
                    req.body.comment || ""
                ).trim();

            const ratingsPermitidas = [
                "positive",
                "neutral",
                "negative"
            ];

            if (
                !ratingsPermitidas.includes(
                    rating
                )
            ) {
                return res.status(400).json({
                    error:
                        "Avaliação inválida."
                });
            }

            if (comment.length > 1000) {
                return res.status(400).json({
                    error:
                        "O comentário é muito grande."
                });
            }

            const pedido =
                buscarPedidoBasico(
                    orderId
                );

            if (!pedido) {
                return res.status(404).json({
                    error:
                        "Pedido não encontrado."
                });
            }

            if (
                pedido.buyer_id !==
                req.user.id
            ) {
                return res.status(403).json({
                    error:
                        "Somente o comprador pode avaliar."
                });
            }

            if (
                pedido.status !== "completed"
            ) {
                return res.status(400).json({
                    error:
                        "Você só pode avaliar pedidos concluídos."
                });
            }

            const existente =
                db.prepare(`
                    SELECT id
                    FROM reviews
                    WHERE order_id = ?
                `).get(orderId);

            if (existente) {
                return res.status(400).json({
                    error:
                        "Você já avaliou este pedido."
                });
            }

            const resultado =
                db.transaction(() => {

                    const agora =
                        Date.now();

                    db.prepare(`
                        INSERT INTO reviews
                        (
                            order_id,
                            buyer_id,
                            seller_id,
                            rating,
                            comment,
                            created_at
                        )

                        VALUES
                        (?, ?, ?, ?, ?, ?)
                    `).run(
                        orderId,
                        pedido.buyer_id,
                        pedido.seller_id,
                        rating,
                        comment,
                        agora
                    );

                    let coluna;

                    if (rating === "positive") {
                        coluna =
                            "rating_positive";
                    } else if (
                        rating === "neutral"
                    ) {
                        coluna =
                            "rating_neutral";
                    } else {
                        coluna =
                            "rating_negative";
                    }

                    db.prepare(`
                        UPDATE users

                        SET ${coluna} =
                            ${coluna} + 1

                        WHERE id = ?
                    `).run(
                        pedido.seller_id
                    );

                })();

            res.status(201).json({
                message:
                    "Avaliação enviada com sucesso."
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao enviar avaliação."
            });
        }
    }
);


/* ==========================================
   FUNÇÕES AUXILIARES
========================================== */

function buscarPedidoBasico(id) {

    return db.prepare(`
        SELECT
            id,
            buyer_id,
            seller_id,
            product_id,
            amount_cents,
            platform_fee_cents,
            seller_amount_cents,
            status,
            created_at,
            updated_at

        FROM orders

        WHERE id = ?
    `).get(id);
}


function participaDoPedido(
    pedido,
    userId
) {

    return (
        pedido.buyer_id === userId ||
        pedido.seller_id === userId
    );
}


function obterPedido(
    id,
    userId
) {

    const pedido =
        db.prepare(`
            SELECT
                o.*,

                p.title AS product_title,
                p.image_url AS product_image,

                buyer.username
                    AS buyer_username,

                seller.username
                    AS seller_username

            FROM orders o

            INNER JOIN products p
                ON p.id = o.product_id

            INNER JOIN users buyer
                ON buyer.id = o.buyer_id

            INNER JOIN users seller
                ON seller.id = o.seller_id

            WHERE o.id = ?
        `)
        .get(id);

    if (!pedido) {
        return null;
    }

    return formatarPedido(
        pedido,
        userId
    );
}


function formatarPedido(
    pedido,
    userId
) {

    return {

        id:
            pedido.id,

        product_id:
            pedido.product_id,

        product_title:
            pedido.product_title,

        product_image:
            pedido.product_image,

        buyer: {

            id:
                pedido.buyer_id,

            username:
                pedido.buyer_username
        },

        seller: {

            id:
                pedido.seller_id,

            username:
                pedido.seller_username
        },

        amount_cents:
            pedido.amount_cents,

        amount:
            pedido.amount_cents / 100,

        platform_fee_cents:
            pedido.platform_fee_cents,

        platform_fee:
            pedido.platform_fee_cents / 100,

        seller_amount_cents:
            pedido.seller_amount_cents,

        seller_amount:
            pedido.seller_amount_cents / 100,

        status:
            pedido.status,

        created_at:
            pedido.created_at,

        updated_at:
            pedido.updated_at,

        is_buyer:
            pedido.buyer_id === userId,

        is_seller:
            pedido.seller_id === userId
    };
}


module.exports = router;
