const express = require("express");

const db = require("./database");
const { autenticar } = require("./auth");

const router = express.Router();

const CATEGORIAS = [
    "Contas",
    "Itens",
    "Serviços",
    "Outros"
];

const DELIVERY_TYPES = [
    "manual",
    "automatic"
];

function formatarProduto(produto) {
    return {
        id: produto.id,
        title: produto.title,
        description: produto.description,
        category: produto.category,
        price_cents: produto.price_cents,
        price: produto.price_cents / 100,
        image_url: produto.image_url,
        status: produto.status,
        stock: produto.stock,
        delivery_type: produto.delivery_type,
        views: produto.views,
        created_at: produto.created_at,
        updated_at: produto.updated_at,

        seller: {
            id: produto.seller_id,
            username: produto.seller_username,
            avatar_url: produto.seller_avatar_url,
            seller_verified: !!produto.seller_verified,
            rating_positive: produto.rating_positive,
            rating_neutral: produto.rating_neutral,
            rating_negative: produto.rating_negative
        }
    };
}

/*
 * LISTAR PRODUTOS
 */
router.get("/", (req, res) => {
    try {
        const category = String(
            req.query.category || ""
        ).trim();

        const search = String(
            req.query.search || ""
        ).trim();

        const sort = String(
            req.query.sort || "newest"
        ).trim();

        let page = Number.parseInt(
            req.query.page || "1",
            10
        );

        let limit = Number.parseInt(
            req.query.limit || "24",
            10
        );

        if (!Number.isFinite(page) || page < 1) {
            page = 1;
        }

        if (!Number.isFinite(limit)) {
            limit = 24;
        }

        limit = Math.min(
            Math.max(limit, 1),
            50
        );

        const offset = (page - 1) * limit;

        const conditions = [
            "p.status = 'approved'",
            "p.stock > 0",
            "u.suspended = 0"
        ];

        const params = [];

        if (category) {
            if (!CATEGORIAS.includes(category)) {
                return res.status(400).json({
                    error: "Categoria inválida."
                });
            }

            conditions.push(
                "p.category = ?"
            );

            params.push(category);
        }

        if (search) {
            conditions.push(`
                (
                    p.title LIKE ?
                    OR p.description LIKE ?
                )
            `);

            const termo = `%${search}%`;

            params.push(termo, termo);
        }

        let orderBy = "p.created_at DESC";

        if (sort === "price_asc") {
            orderBy = "p.price_cents ASC";
        }

        if (sort === "price_desc") {
            orderBy = "p.price_cents DESC";
        }

        if (sort === "popular") {
            orderBy = "p.views DESC";
        }

        const where = conditions.join(
            " AND "
        );

        const produtos = db.prepare(`
            SELECT
                p.*,

                u.username AS seller_username,
                u.avatar_url AS seller_avatar_url,
                u.seller_verified,
                u.rating_positive,
                u.rating_neutral,
                u.rating_negative

            FROM products p

            INNER JOIN users u
                ON u.id = p.seller_id

            WHERE ${where}

            ORDER BY ${orderBy}

            LIMIT ? OFFSET ?
        `).all(
            ...params,
            limit,
            offset
        );

        const total = db.prepare(`
            SELECT COUNT(*) AS total

            FROM products p

            INNER JOIN users u
                ON u.id = p.seller_id

            WHERE ${where}
        `).get(...params).total;

        return res.json({
            products: produtos.map(formatarProduto),

            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (erro) {
        console.error(
            "Erro ao listar produtos:",
            erro
        );

        return res.status(500).json({
            error: "Não foi possível carregar os produtos."
        });
    }
});

/*
 * MEUS PRODUTOS
 *
 * Essa rota precisa ficar ANTES de /:id.
 */
router.get(
    "/mine",
    autenticar,
    (req, res) => {
        try {
            const produtos = db.prepare(`
                SELECT
                    p.*,

                    u.username AS seller_username,
                    u.avatar_url AS seller_avatar_url,
                    u.seller_verified,
                    u.rating_positive,
                    u.rating_neutral,
                    u.rating_negative

                FROM products p

                INNER JOIN users u
                    ON u.id = p.seller_id

                WHERE p.seller_id = ?

                ORDER BY p.created_at DESC
            `).all(req.user.id);

            return res.json({
                products: produtos.map(
                    formatarProduto
                )
            });

        } catch (erro) {
            console.error(
                "Erro ao carregar meus produtos:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível carregar seus produtos."
            });
        }
    }
);

/*
 * DETALHES DO PRODUTO
 */
router.get(
    "/:id",
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    error: "Produto inválido."
                });
            }

            const produto = db.prepare(`
                SELECT
                    p.*,

                    u.username AS seller_username,
                    u.avatar_url AS seller_avatar_url,
                    u.seller_verified,
                    u.rating_positive,
                    u.rating_neutral,
                    u.rating_negative

                FROM products p

                INNER JOIN users u
                    ON u.id = p.seller_id

                WHERE p.id = ?
                AND (
                    p.status = 'approved'
                    OR p.status = 'paused'
                )
                AND u.suspended = 0
            `).get(id);

            if (!produto) {
                return res.status(404).json({
                    error: "Produto não encontrado."
                });
            }

            db.prepare(`
                UPDATE products
                SET views = views + 1
                WHERE id = ?
            `).run(id);

            produto.views += 1;

            return res.json({
                product: formatarProduto(
                    produto
                )
            });

        } catch (erro) {
            console.error(
                "Erro ao carregar produto:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível carregar o produto."
            });
        }
    }
);

/*
 * CRIAR PRODUTO
 */
router.post(
    "/",
    autenticar,
    (req, res) => {
        try {
            if (!req.user.email_verified) {
                return res.status(403).json({
                    error: "Verifique seu e-mail antes de anunciar."
                });
            }

            if (!req.user.seller_verified) {
                return res.status(403).json({
                    error: "Sua conta ainda não foi aprovada como vendedor."
                });
            }

            const title = String(
                req.body.title || ""
            ).trim();

            const description = String(
                req.body.description || ""
            ).trim();

            const category = String(
                req.body.category || ""
            ).trim();

            const price = Number(
                req.body.price
            );

            const stock = Number.parseInt(
                req.body.stock || "1",
                10
            );

            const deliveryType = String(
                req.body.delivery_type || "manual"
            ).trim();

            const imageUrl = req.body.image_url
                ? String(req.body.image_url).trim()
                : null;

            if (
                title.length < 3 ||
                title.length > 100
            ) {
                return res.status(400).json({
                    error: "O título deve ter entre 3 e 100 caracteres."
                });
            }

            if (
                description.length < 10 ||
                description.length > 3000
            ) {
                return res.status(400).json({
                    error: "A descrição deve ter entre 10 e 3000 caracteres."
                });
            }

            if (!CATEGORIAS.includes(category)) {
                return res.status(400).json({
                    error: "Categoria inválida."
                });
            }

            if (
                !Number.isFinite(price) ||
                price < 0.97
            ) {
                return res.status(400).json({
                    error: "O preço mínimo é R$ 0,97."
                });
            }

            if (
                !Number.isInteger(stock) ||
                stock < 1 ||
                stock > 100000
            ) {
                return res.status(400).json({
                    error: "Estoque inválido."
                });
            }

            if (
                !DELIVERY_TYPES.includes(
                    deliveryType
                )
            ) {
                return res.status(400).json({
                    error: "Tipo de entrega inválido."
                });
            }

            if (imageUrl) {
                if (imageUrl.length > 700000) {
                    return res.status(400).json({
                        error: "A imagem é muito grande."
                    });
                }

                if (
                    !imageUrl.startsWith("http://") &&
                    !imageUrl.startsWith("https://") &&
                    !imageUrl.startsWith("data:image/")
                ) {
                    return res.status(400).json({
                        error: "URL ou imagem inválida."
                    });
                }
            }

            const priceCents = Math.round(
                price * 100
            );

            const resultado = db.prepare(`
                INSERT INTO products (
                    seller_id,
                    title,
                    description,
                    category,
                    price_cents,
                    image_url,
                    status,
                    stock,
                    delivery_type
                )
                VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
            `).run(
                req.user.id,
                title,
                description,
                category,
                priceCents,
                imageUrl,
                stock,
                deliveryType
            );

            const produto = db.prepare(`
                SELECT
                    p.*,

                    u.username AS seller_username,
                    u.avatar_url AS seller_avatar_url,
                    u.seller_verified,
                    u.rating_positive,
                    u.rating_neutral,
                    u.rating_negative

                FROM products p

                INNER JOIN users u
                    ON u.id = p.seller_id

                WHERE p.id = ?
            `).get(
                resultado.lastInsertRowid
            );

            return res.status(201).json({
                success: true,
                message: "Anúncio enviado para análise.",
                product: formatarProduto(
                    produto
                )
            });

        } catch (erro) {
            console.error(
                "Erro ao criar produto:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível criar o anúncio."
            });
        }
    }
);

/*
 * EDITAR PRODUTO
 */
router.put(
    "/:id",
    autenticar,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const produto = db.prepare(`
                SELECT *
                FROM products
                WHERE id = ?
                AND seller_id = ?
            `).get(
                id,
                req.user.id
            );

            if (!produto) {
                return res.status(404).json({
                    error: "Produto não encontrado."
                });
            }

            const title = String(
                req.body.title ?? produto.title
            ).trim();

            const description = String(
                req.body.description ?? produto.description
            ).trim();

            const category = String(
                req.body.category ?? produto.category
            ).trim();

            const price = Number(
                req.body.price ??
                produto.price_cents / 100
            );

            const stock = Number.parseInt(
                req.body.stock ??
                produto.stock,
                10
            );

            const deliveryType = String(
                req.body.delivery_type ??
                produto.delivery_type
            ).trim();

            const imageUrl =
                req.body.image_url !== undefined
                    ? String(req.body.image_url).trim()
                    : produto.image_url;

            if (
                title.length < 3 ||
                title.length > 100
            ) {
                return res.status(400).json({
                    error: "Título inválido."
                });
            }

            if (
                description.length < 10 ||
                description.length > 3000
            ) {
                return res.status(400).json({
                    error: "Descrição inválida."
                });
            }

            if (!CATEGORIAS.includes(category)) {
                return res.status(400).json({
                    error: "Categoria inválida."
                });
            }

            if (
                !Number.isFinite(price) ||
                price < 0.97
            ) {
                return res.status(400).json({
                    error: "O preço mínimo é R$ 0,97."
                });
            }

            if (
                !Number.isInteger(stock) ||
                stock < 1 ||
                stock > 100000
            ) {
                return res.status(400).json({
                    error: "Estoque inválido."
                });
            }

            if (
                !DELIVERY_TYPES.includes(
                    deliveryType
                )
            ) {
                return res.status(400).json({
                    error: "Tipo de entrega inválido."
                });
            }

            if (imageUrl) {
                if (imageUrl.length > 700000) {
                    return res.status(400).json({
                        error: "A imagem é muito grande."
                    });
                }

                if (
                    !imageUrl.startsWith("http://") &&
                    !imageUrl.startsWith("https://") &&
                    !imageUrl.startsWith("data:image/")
                ) {
                    return res.status(400).json({
                        error: "Imagem inválida."
                    });
                }
            }

            const priceCents = Math.round(
                price * 100
            );

            db.prepare(`
                UPDATE products
                SET
                    title = ?,
                    description = ?,
                    category = ?,
                    price_cents = ?,
                    image_url = ?,
                    stock = ?,
                    delivery_type = ?,
                    status = 'pending',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                AND seller_id = ?
            `).run(
                title,
                description,
                category,
                priceCents,
                imageUrl || null,
                stock,
                deliveryType,
                id,
                req.user.id
            );

            return res.json({
                success: true,
                message: "Produto atualizado e enviado novamente para análise."
            });

        } catch (erro) {
            console.error(
                "Erro ao editar produto:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível editar o produto."
            });
        }
    }
);

/*
 * PAUSAR / REATIVAR
 */
router.post(
    "/:id/pause",
    autenticar,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const produto = db.prepare(`
                SELECT *
                FROM products
                WHERE id = ?
                AND seller_id = ?
            `).get(
                id,
                req.user.id
            );

            if (!produto) {
                return res.status(404).json({
                    error: "Produto não encontrado."
                });
            }

            if (
                produto.status !== "approved" &&
                produto.status !== "paused"
            ) {
                return res.status(400).json({
                    error: "Esse anúncio ainda não está aprovado."
                });
            }

            const novoStatus =
                produto.status === "approved"
                    ? "paused"
                    : "approved";

            db.prepare(`
                UPDATE products
                SET
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                AND seller_id = ?
            `).run(
                novoStatus,
                id,
                req.user.id
            );

            return res.json({
                success: true,
                status: novoStatus
            });

        } catch (erro) {
            console.error(
                "Erro ao pausar produto:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível alterar o anúncio."
            });
        }
    }
);

/*
 * EXCLUIR PRODUTO
 */
router.delete(
    "/:id",
    autenticar,
    (req, res) => {
        try {
            const id = Number.parseInt(
                req.params.id,
                10
            );

            const produto = db.prepare(`
                SELECT id
                FROM products
                WHERE id = ?
                AND seller_id = ?
            `).get(
                id,
                req.user.id
            );

            if (!produto) {
                return res.status(404).json({
                    error: "Produto não encontrado."
                });
            }

            db.prepare(`
                DELETE FROM products
                WHERE id = ?
                AND seller_id = ?
            `).run(
                id,
                req.user.id
            );

            return res.json({
                success: true,
                message: "Produto excluído."
            });

        } catch (erro) {
            console.error(
                "Erro ao excluir produto:",
                erro
            );

            return res.status(500).json({
                error: "Não foi possível excluir o produto."
            });
        }
    }
);

module.exports = router;
