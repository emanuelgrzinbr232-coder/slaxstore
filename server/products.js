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

function validarCategoria(categoria) {
    return CATEGORIAS.includes(categoria);
}

function produtoPublico(produto) {
    return {
        id: produto.id,
        title: produto.title,
        description: produto.description,
        category: produto.category,
        price_cents: produto.price_cents,
        price: produto.price_cents / 100,
        image_url: produto.image_url,
        stock: produto.stock,
        delivery_type: produto.delivery_type,
        views: produto.views,
        created_at: produto.created_at,
        updated_at: produto.updated_at,

        seller: {
            id: produto.seller_id,
            username: produto.seller_username,
            avatar_url: produto.seller_avatar,
            seller_verified: !!produto.seller_verified,

            rating_positive:
                produto.rating_positive || 0,

            rating_neutral:
                produto.rating_neutral || 0,

            rating_negative:
                produto.rating_negative || 0
        }
    };
}


/*
========================================
LISTAR PRODUTOS
GET /api/products
========================================
*/

router.get("/", (req, res) => {

    try {

        const {
            category,
            search,
            sort = "newest",
            page = 1,
            limit = 20
        } = req.query;

        const pagina =
            Math.max(
                parseInt(page) || 1,
                1
            );

        const limite =
            Math.min(
                Math.max(
                    parseInt(limit) || 20,
                    1
                ),
                50
            );

        const offset =
            (pagina - 1) * limite;

        let where = `
            p.status = 'approved'
            AND p.stock > 0
        `;

        const parametros = [];

        if (category) {

            if (!validarCategoria(category)) {

                return res.status(400).json({
                    error: "Categoria inválida."
                });

            }

            where += `
                AND p.category = ?
            `;

            parametros.push(category);
        }

        if (search) {

            where += `
                AND (
                    p.title LIKE ?
                    OR p.description LIKE ?
                )
            `;

            const termo = `%${search}%`;

            parametros.push(termo);
            parametros.push(termo);
        }

        let orderBy = `
            p.created_at DESC
        `;

        if (sort === "price_asc") {

            orderBy = `
                p.price_cents ASC
            `;

        } else if (sort === "price_desc") {

            orderBy = `
                p.price_cents DESC
            `;

        } else if (sort === "popular") {

            orderBy = `
                p.views DESC,
                p.created_at DESC
            `;
        }

        const produtos = db.prepare(`
            SELECT
                p.*,

                u.username AS seller_username,
                u.avatar_url AS seller_avatar,
                u.seller_verified,
                u.rating_positive,
                u.rating_neutral,
                u.rating_negative

            FROM products p

            INNER JOIN users u
                ON u.id = p.seller_id

            WHERE ${where}

            ORDER BY ${orderBy}

            LIMIT ?
            OFFSET ?
        `).all(
            ...parametros,
            limite,
            offset
        );

        const total = db.prepare(`
            SELECT COUNT(*) AS total

            FROM products p

            WHERE ${where}
        `).get(...parametros);

        res.json({

            products:
                produtos.map(produtoPublico),

            pagination: {
                page: pagina,
                limit: limite,
                total: total.total,
                pages: Math.ceil(
                    total.total / limite
                )
            }

        });

    } catch (error) {

        console.error(
            "Erro ao listar produtos:",
            error
        );

        res.status(500).json({
            error: "Erro ao carregar produtos."
        });
    }
});


/*
========================================
MEUS PRODUTOS
GET /api/products/mine
========================================
*/

router.get("/mine", autenticar, (req, res) => {

    try {

        const produtos = db.prepare(`
            SELECT *
            FROM products
            WHERE seller_id = ?
            ORDER BY created_at DESC
        `).all(req.user.id);

        res.json({
            products: produtos.map(produto => ({
                ...produto,
                price:
                    produto.price_cents / 100
            }))
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Erro ao carregar seus anúncios."
        });
    }
});


/*
========================================
VER PRODUTO
GET /api/products/:id
========================================
*/

router.get("/:id", (req, res) => {

    try {

        const id =
            Number(req.params.id);

        if (!Number.isInteger(id)) {

            return res.status(400).json({
                error: "Produto inválido."
            });
        }

        const produto = db.prepare(`
            SELECT
                p.*,

                u.username AS seller_username,
                u.avatar_url AS seller_avatar,
                u.seller_verified,
                u.rating_positive,
                u.rating_neutral,
                u.rating_negative

            FROM products p

            INNER JOIN users u
                ON u.id = p.seller_id

            WHERE p.id = ?
            AND p.status = 'approved'
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

        produto.views++;

        res.json({
            product:
                produtoPublico(produto)
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Erro ao carregar produto."
        });
    }
});


/*
========================================
CRIAR PRODUTO
POST /api/products
========================================
*/

router.post("/", autenticar, (req, res) => {

    try {

        if (!req.user.email_verified) {

            return res.status(403).json({
                error:
                    "Verifique seu e-mail antes de publicar anúncios."
            });
        }

        if (req.user.suspended) {

            return res.status(403).json({
                error:
                    "Sua conta está suspensa."
            });
        }

        const {
            title,
            description,
            category,
            price,
            stock = 1,
            delivery_type = "manual",
            image_url = null
        } = req.body;

        const titulo =
            String(title || "").trim();

        const descricao =
            String(description || "").trim();

        const preco =
            Number(price);

        const estoque =
            Number(stock);

        if (
            titulo.length < 3 ||
            titulo.length > 80
        ) {

            return res.status(400).json({
                error:
                    "O título precisa ter entre 3 e 80 caracteres."
            });
        }

        if (
            descricao.length < 10 ||
            descricao.length > 5000
        ) {

            return res.status(400).json({
                error:
                    "A descrição precisa ter entre 10 e 5000 caracteres."
            });
        }

        if (!validarCategoria(category)) {

            return res.status(400).json({
                error: "Categoria inválida."
            });
        }

        if (
            !Number.isFinite(preco) ||
            preco <= 0
        ) {

            return res.status(400).json({
                error:
                    "Informe um preço válido."
            });
        }

        /*
        A taxa fixa é R$0,97.
        Produtos abaixo disso não podem
        gerar valor negativo para o vendedor.
        */

        if (preco < 0.97) {

            return res.status(400).json({
                error:
                    "O preço mínimo é R$0,97."
            });
        }

        if (
            !Number.isInteger(estoque) ||
            estoque < 1 ||
            estoque > 100000
        ) {

            return res.status(400).json({
                error:
                    "O estoque precisa ser um número inteiro entre 1 e 100000."
            });
        }

        if (
            delivery_type !== "manual" &&
            delivery_type !== "automatic"
        ) {

            return res.status(400).json({
                error:
                    "Tipo de entrega inválido."
            });
        }

        let imagem = null;

        if (image_url) {

            imagem =
                String(image_url).trim();

            if (imagem.length > 1500000) {

                return res.status(400).json({
                    error:
                        "A imagem é muito grande."
                });
            }
        }

        const agora =
            Date.now();

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
                delivery_type,
                views,
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
                ?,
                0,
                ?,
                ?
            )
        `).run(

            req.user.id,

            titulo,

            descricao,

            category,

            Math.round(preco * 100),

            imagem,

            estoque,

            delivery_type,

            agora,

            agora
        );

        res.status(201).json({

            message:
                "Anúncio enviado para moderação.",

            product_id:
                resultado.lastInsertRowid,

            status:
                "pending"
        });

    } catch (error) {

        console.error(
            "Erro ao criar produto:",
            error
        );

        res.status(500).json({
            error:
                "Erro ao criar anúncio."
        });
    }
});


/*
========================================
EDITAR PRODUTO
PUT /api/products/:id
========================================
*/

router.put("/:id", autenticar, (req, res) => {

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
                    "Produto não encontrado."
            });
        }

        if (
            produto.seller_id !==
            req.user.id
        ) {

            return res.status(403).json({
                error:
                    "Você não é o dono deste anúncio."
            });
        }

        const {
            title,
            description,
            category,
            price,
            stock,
            delivery_type,
            image_url
        } = req.body;

        const titulo =
            String(
                title ?? produto.title
            ).trim();

        const descricao =
            String(
                description ??
                produto.description
            ).trim();

        const categoria =
            category ??
            produto.category;

        const preco =
            price === undefined
                ? produto.price_cents / 100
                : Number(price);

        const estoque =
            stock === undefined
                ? produto.stock
                : Number(stock);

        const entrega =
            delivery_type ??
            produto.delivery_type;

        const imagem =
            image_url === undefined
                ? produto.image_url
                : image_url;

        if (
            titulo.length < 3 ||
            titulo.length > 80
        ) {

            return res.status(400).json({
                error:
                    "Título inválido."
            });
        }

        if (
            descricao.length < 10 ||
            descricao.length > 5000
        ) {

            return res.status(400).json({
                error:
                    "Descrição inválida."
            });
        }

        if (!validarCategoria(categoria)) {

            return res.status(400).json({
                error:
                    "Categoria inválida."
            });
        }

        if (
            !Number.isFinite(preco) ||
            preco < 0.97
        ) {

            return res.status(400).json({
                error:
                    "Preço inválido. O mínimo é R$0,97."
            });
        }

        if (
            !Number.isInteger(estoque) ||
            estoque < 1
        ) {

            return res.status(400).json({
                error:
                    "Estoque inválido."
            });
        }

        if (
            entrega !== "manual" &&
            entrega !== "automatic"
        ) {

            return res.status(400).json({
                error:
                    "Tipo de entrega inválido."
            });
        }

        const agora =
            Date.now();

        /*
        Qualquer alteração importante
        manda novamente para moderação.
        */

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
                updated_at = ?

            WHERE id = ?
        `).run(

            titulo,

            descricao,

            categoria,

            Math.round(preco * 100),

            imagem || null,

            estoque,

            entrega,

            agora,

            id
        );

        res.json({
            message:
                "Anúncio atualizado e enviado novamente para moderação."
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error:
                "Erro ao editar anúncio."
        });
    }
});


/*
========================================
PAUSAR / ATIVAR
POST /api/products/:id/toggle
========================================
*/

router.post(
    "/:id/toggle",
    autenticar,
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
                        "Produto não encontrado."
                });
            }

            if (
                produto.seller_id !==
                req.user.id
            ) {

                return res.status(403).json({
                    error:
                        "Você não é o dono deste anúncio."
                });
            }

            if (
                produto.status !== "approved" &&
                produto.status !== "paused"
            ) {

                return res.status(400).json({
                    error:
                        "Somente anúncios aprovados podem ser pausados ou ativados."
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
                    updated_at = ?
                WHERE id = ?
            `).run(
                novoStatus,
                Date.now(),
                id
            );

            res.json({

                message:
                    novoStatus === "paused"
                        ? "Anúncio pausado."
                        : "Anúncio ativado.",

                status:
                    novoStatus
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao alterar anúncio."
            });
        }
    }
);


/*
========================================
EXCLUIR PRODUTO
DELETE /api/products/:id
========================================
*/

router.delete(
    "/:id",
    autenticar,
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
                        "Produto não encontrado."
                });
            }

            if (
                produto.seller_id !==
                req.user.id
            ) {

                return res.status(403).json({
                    error:
                        "Você não pode excluir este anúncio."
                });
            }

            const pedidos =
                db.prepare(`
                    SELECT COUNT(*) AS total
                    FROM orders
                    WHERE product_id = ?
                `).get(id);

            if (pedidos.total > 0) {

                return res.status(400).json({
                    error:
                        "Este anúncio possui pedidos e não pode ser excluído. Pause o anúncio."
                });
            }

            db.prepare(`
                DELETE FROM products
                WHERE id = ?
            `).run(id);

            res.json({
                message:
                    "Anúncio excluído."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao excluir anúncio."
            });
        }
    }
);


module.exports = router;
