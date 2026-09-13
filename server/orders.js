const express = require("express");

const db = require("./database");
const { autenticar } = require("./auth");

const router = express.Router();

const TAXA_PLATAFORMA = 97;


/*
========================================
VERIFICAR PARTICIPAÇÃO NO PEDIDO
========================================
*/

function verificarParticipante(order, userId) {

    return (
        order.buyer_id === userId ||
        order.seller_id === userId
    );
}


/*
========================================
CRIAR PEDIDO / COMPRA
POST /api/orders/:productId
========================================
*/

router.post("/:productId", autenticar, (req, res) => {

    try {

        const productId =
            Number(req.params.productId);

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
                    "Este anúncio não está disponível para compra."
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

        const valor =
            produto.price_cents;

        if (valor < TAXA_PLATAFORMA) {

            return res.status(400).json({
                error:
                    "O valor do produto não cobre a taxa da plataforma."
            });
        }

        const valorVendedor =
            valor - TAXA_PLATAFORMA;

        const agora =
            Date.now();

        const criarPedido =
            db.transaction(() => {

                const resultado =
                    db.prepare(`
                        INSERT INTO orders (
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

                        VALUES (
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

                        valor,

                        TAXA_PLATAFORMA,

                        valorVendedor,

                        agora,

                        agora
                    );

                db.prepare(`
                    UPDATE products

                    SET
                        stock = stock - 1,
                        updated_at = ?

                    WHERE id = ?
                    AND stock > 0
                `).run(
                    agora,
                    produto.id
                );

                return resultado.lastInsertRowid;
            });

        const orderId =
            criarPedido;

        res.status(201).json({

            message:
                "Pedido criado com sucesso.",

            order_id:
                orderId,

            payment: {
                amount_cents: valor,
                amount: valor / 100,

                platform_fee_cents:
                    TAXA_PLATAFORMA,

                platform_fee:
                    TAXA_PLATAFORMA / 100,

                seller_amount_cents:
                    valorVendedor,

                seller_amount:
                    valorVendedor / 100
            },

            status:
                "pending"
        });

    } catch (error) {

        console.error(
            "Erro ao criar pedido:",
            error
        );

        res.status(500).json({
            error:
                "Erro ao criar pedido."
        });
    }
});


/*
========================================
LISTAR MEUS PEDIDOS
GET /api/orders
========================================
*/

router.get("/", autenticar, (req, res) => {

    try {

        const pedidos = db.prepare(`
            SELECT

                o.*,

                p.title AS product_title,
                p.image_url AS product_image,

                buyer.username AS buyer_username,
                seller.username AS seller_username

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

        res.json({

            orders:
                pedidos.map(pedido => ({
                    ...pedido,

                    amount:
                        pedido.amount_cents / 100,

                    platform_fee:
                        pedido.platform_fee_cents / 100,

                    seller_amount:
                        pedido.seller_amount_cents / 100,

                    role:
                        pedido.buyer_id === req.user.id
                            ? "buyer"
                            : "seller"
                }))
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error:
                "Erro ao carregar pedidos."
        });
    }
});


/*
========================================
DETALHES DO PEDIDO
GET /api/orders/:id
========================================
*/

router.get("/:id", autenticar, (req, res) => {

    try {

        const id =
            Number(req.params.id);

        const pedido = db.prepare(`
            SELECT

                o.*,

                p.title AS product_title,
                p.description AS product_description,
                p.image_url AS product_image,

                buyer.username AS buyer_username,
                buyer.avatar_url AS buyer_avatar,

                seller.username AS seller_username,
                seller.avatar_url AS seller_avatar,
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

        if (!pedido) {

            return res.status(404).json({
                error:
                    "Pedido não encontrado."
            });
        }

        if (
            !verificarParticipante(
                pedido,
                req.user.id
            )
        ) {

            return res.status(403).json({
                error:
                    "Você não participa deste pedido."
            });
        }

        res.json({

            order: {
                ...pedido,

                amount:
                    pedido.amount_cents / 100,

                platform_fee:
                    pedido.platform_fee_cents / 100,

                seller_amount:
                    pedido.seller_amount_cents / 100,

                role:
                    pedido.buyer_id === req.user.id
                        ? "buyer"
                        : "seller"
            }
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error:
                "Erro ao carregar pedido."
        });
    }
});


/*
========================================
ENVIAR MENSAGEM
POST /api/orders/:id/message
========================================
*/

router.post(
    "/:id/message",
    autenticar,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

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
                        "A mensagem pode ter no máximo 2000 caracteres."
                });
            }

            const pedido = db.prepare(`
                SELECT *
                FROM orders
                WHERE id = ?
            `).get(id);

            if (!pedido) {

                return res.status(404).json({
                    error:
                        "Pedido não encontrado."
                });
            }

            if (
                !verificarParticipante(
                    pedido,
                    req.user.id
                )
            ) {

                return res.status(403).json({
                    error:
                        "Você não participa deste pedido."
                });
            }

            const resultado =
                db.prepare(`
                    INSERT INTO messages (
                        order_id,
                        sender_id,
                        message,
                        created_at
                    )

                    VALUES (?, ?, ?, ?)
                `).run(
                    id,
                    req.user.id,
                    mensagem,
                    Date.now()
                );

            res.status(201).json({

                message:
                    "Mensagem enviada.",

                message_id:
                    resultado.lastInsertRowid
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao enviar mensagem."
            });
        }
    }
);


/*
========================================
LISTAR MENSAGENS
GET /api/orders/:id/messages
========================================
*/

router.get(
    "/:id/messages",
    autenticar,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const pedido = db.prepare(`
                SELECT *
                FROM orders
                WHERE id = ?
            `).get(id);

            if (!pedido) {

                return res.status(404).json({
                    error:
                        "Pedido não encontrado."
                });
            }

            if (
                !verificarParticipante(
                    pedido,
                    req.user.id
                )
            ) {

                return res.status(403).json({
                    error:
                        "Você não participa deste pedido."
                });
            }

            const mensagens = db.prepare(`
                SELECT

                    m.id,
                    m.order_id,
                    m.sender_id,
                    m.message,
                    m.created_at,

                    u.username,
                    u.avatar_url

                FROM messages m

                INNER JOIN users u
                    ON u.id = m.sender_id

                WHERE m.order_id = ?

                ORDER BY m.created_at ASC
            `).all(id);

            res.json({
                messages:
                    mensagens
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao carregar mensagens."
            });
        }
    }
);


/*
========================================
CONCLUIR PEDIDO
POST /api/orders/:id/complete
========================================
*/

router.post(
    "/:id/complete",
    autenticar,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const pedido = db.prepare(`
                SELECT *
                FROM orders
                WHERE id = ?
            `).get(id);

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
                pedido.status !== "pending"
            ) {

                return res.status(400).json({
                    error:
                        "Este pedido não está pendente."
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
                id
            );

            res.json({
                message:
                    "Pedido concluído com sucesso."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao concluir pedido."
            });
        }
    }
);


/*
========================================
ABRIR PROBLEMA
POST /api/orders/:id/problem
========================================
*/

router.post(
    "/:id/problem",
    autenticar,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const descricao =
                String(
                    req.body.description || ""
                ).trim();

            if (
                descricao.length < 5
            ) {

                return res.status(400).json({
                    error:
                        "Explique o problema."
                });
            }

            if (
                descricao.length > 3000
            ) {

                return res.status(400).json({
                    error:
                        "A descrição pode ter no máximo 3000 caracteres."
                });
            }

            const pedido = db.prepare(`
                SELECT *
                FROM orders
                WHERE id = ?
            `).get(id);

            if (!pedido) {

                return res.status(404).json({
                    error:
                        "Pedido não encontrado."
                });
            }

            if (
                !verificarParticipante(
                    pedido,
                    req.user.id
                )
            ) {

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
                id
            );

            /*
            A descrição do problema também fica
            registrada no SlaxChat para a moderação.
            */

            db.prepare(`
                INSERT INTO messages (
                    order_id,
                    sender_id,
                    message,
                    created_at
                )

                VALUES (?, ?, ?, ?)
            `).run(

                id,

                req.user.id,

                `[PROBLEMA ABERTO]\n${descricao}`,

                Date.now()
            );

            res.json({

                message:
                    "Problema aberto. A moderação poderá analisar o pedido.",

                status:
                    "problem"
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao abrir problema."
            });
        }
    }
);


/*
========================================
AVALIAR VENDEDOR
POST /api/orders/:id/review
========================================
*/

router.post(
    "/:id/review",
    autenticar,
    (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const rating =
                String(
                    req.body.rating || ""
                ).toLowerCase();

            const comment =
                String(
                    req.body.comment || ""
                ).trim();

            const permitidas = [
                "positive",
                "neutral",
                "negative"
            ];

            if (
                !permitidas.includes(rating)
            ) {

                return res.status(400).json({
                    error:
                        "Avaliação inválida."
                });
            }

            if (
                comment.length > 1000
            ) {

                return res.status(400).json({
                    error:
                        "A avaliação pode ter no máximo 1000 caracteres."
                });
            }

            const pedido = db.prepare(`
                SELECT *
                FROM orders
                WHERE id = ?
            `).get(id);

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
                        "Somente o comprador pode avaliar o vendedor."
                });
            }

            if (
                pedido.status !== "completed"
            ) {

                return res.status(400).json({
                    error:
                        "Conclua o pedido antes de avaliar."
                });
            }

            const existente =
                db.prepare(`
                    SELECT id
                    FROM reviews
                    WHERE order_id = ?
                `).get(id);

            if (existente) {

                return res.status(409).json({
                    error:
                        "Este pedido já foi avaliado."
                });
            }

            const criarAvaliacao =
                db.transaction(() => {

                    db.prepare(`
                        INSERT INTO reviews (
                            order_id,
                            buyer_id,
                            seller_id,
                            rating,
                            comment,
                            created_at
                        )

                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(

                        id,

                        pedido.buyer_id,

                        pedido.seller_id,

                        rating,

                        comment,

                        Date.now()
                    );

                    if (rating === "positive") {

                        db.prepare(`
                            UPDATE users
                            SET rating_positive =
                                rating_positive + 1
                            WHERE id = ?
                        `).run(
                            pedido.seller_id
                        );

                    } else if (
                        rating === "neutral"
                    ) {

                        db.prepare(`
                            UPDATE users
                            SET rating_neutral =
                                rating_neutral + 1
                            WHERE id = ?
                        `).run(
                            pedido.seller_id
                        );

                    } else {

                        db.prepare(`
                            UPDATE users
                            SET rating_negative =
                                rating_negative + 1
                            WHERE id = ?
                        `).run(
                            pedido.seller_id
                        );
                    }
                });

            criarAvaliacao();

            res.status(201).json({
                message:
                    "Avaliação publicada."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao publicar avaliação."
            });
        }
    }
);


module.exports = router;
