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

const TIPOS_ENTREGA = [
    "manual",
    "automatic"
];

function agora() {
    return Date.now();
}


/* ==========================================
   GET /api/products
   LISTAGEM PÚBLICA
========================================== */

router.get("/", (req, res) => {

    try {

        const {
            category = "",
            search = "",
            sort = "recent",
            page = "1",
            limit = "24"
        } = req.query;

        const pagina = Math.max(
            1,
            Number.parseInt(page, 10) || 1
        );

        const limite = Math.min(
            50,
            Math.max(
                1,
                Number.parseInt(limit, 10) || 24
            )
        );

        const offset =
            (pagina - 1) * limite;

        const filtros = [
            `p.status = 'approved'`,
            `p.stock > 0`
        ];

        const parametros = {};

        if (category) {

            if (!CATEGORIAS.includes(category)) {
                return res.status(400).json({
                    error: "Categoria inválida."
                });
            }

            filtros.push(
                `p.category = @category`
            );

            parametros.category =
                category;
        }

        if (search.trim()) {

            filtros.push(`
                (
                    LOWER(p.title) LIKE LOWER(@search)
                    OR
                    LOWER(p.description) LIKE LOWER(@search)
                    OR
                    LOWER(u.username) LIKE LOWER(@search)
                )
            `);

            parametros.search =
                `%${search.trim()}%`;
        }

        let ordem = `
            p.created_at DESC
        `;

        if (sort === "price_asc") {
            ordem = `p.price_cents ASC`;
        }

        if (sort === "price_desc") {
            ordem = `p.price_cents DESC`;
        }

        if (sort === "popular") {
            ordem = `p.views DESC, p.created_at DESC`;
        }

        const where =
            filtros.join(" AND ");

        const produtos =
            db.prepare(`
                SELECT
                    p.id,
                    p.title,
                    p.description,
                    p.category,
                    p.price_cents,
                    p.image_url,
                    p.stock,
                    p.delivery_type,
                    p.views,
                    p.created_at,
                    p.updated_at,

                    u.id AS seller_id,
                    u.username AS seller_username,
                    u.avatar_url AS seller_avatar,

                    u.rating_positive,
                    u.rating_neutral,
                    u.rating_negative,

                    u.seller_verified

                FROM products p

                INNER JOIN users u
                    ON u.id = p.seller_id

                WHERE
                    ${where}

                ORDER BY
                    ${ordem}

                LIMIT @limit
                OFFSET @offset
            `)
            .all({
                ...parametros,
                limit: limite,
                offset
            });

        const total =
            db.prepare(`
                SELECT COUNT(*) AS total

                FROM products p

                INNER JOIN users u
                    ON u.id = p.seller_id

                WHERE
                    ${where}
            `)
            .get(parametros).total;

        res.json({
            products: produtos.map(formatarProduto),
            pagination: {
                page: pagina,
                limit: limite,
                total,
                pages: Math.ceil(
                    total / limite
                )
            }
        });

    } catch (erro) {

        console.error(
            "Erro ao listar produtos:",
            erro
        );

        res.status(500).json({
            error:
                "Erro ao carregar os produtos."
        });
    }
});


/* ==========================================
   GET /api/products/mine
   MEUS ANÚNCIOS
========================================== */

router.get(
    "/mine",
    autenticar,
    (req, res) => {

        try {

            const produtos =
                db.prepare(`
                    SELECT
                        p.*,

                        u.username AS seller_username,
                        u.avatar_url AS seller_avatar

                    FROM products p

                    INNER JOIN users u
                        ON u.id = p.seller_id

                    WHERE p.seller_id = ?

                    ORDER BY
                        p.created_at DESC
                `)
                .all(req.user.id);

            res.json({
                products:
                    produtos.map(
                        formatarProduto
                    )
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao carregar seus anúncios."
            });
        }
    }
);


/* ==========================================
   GET /api/products/:id
   PRODUTO INDIVIDUAL
========================================== */

router.get(
    "/:id",
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
                        "ID do produto inválido."
                });
            }

            const produto =
                db.prepare(`
                    SELECT
                        p.*,

                        u.username AS seller_username,
                        u.avatar_url AS seller_avatar,

                        u.rating_positive,
                        u.rating_neutral,
                        u.rating_negative,

                        u.seller_verified

                    FROM products p

                    INNER JOIN users u
                        ON u.id = p.seller_id

                    WHERE
                        p.id = ?
                        AND p.status = 'approved'
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
                SET views = views + 1
                WHERE id = ?
            `).run(id);

            produto.views++;

            res.json({
                product:
                    formatarProduto(produto)
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao carregar o produto."
            });
        }
    }
);


/* ==========================================
   POST /api/products
   CRIAR ANÚNCIO
========================================== */

router.post(
    "/",
    autenticar,
    (req, res) => {

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
                image_url = null,
                stock = 1,
                delivery_type = "manual"
            } = req.body;

            const titulo =
                String(title || "").trim();

            const descricao =
                String(description || "").trim();

            const preco =
                Number(price);

            const estoque =
                Number.parseInt(
                    stock,
                    10
                );

            if (
                titulo.length < 3 ||
                titulo.length > 100
            ) {

                return res.status(400).json({
                    error:
                        "O título precisa ter entre 3 e 100 caracteres."
                });
            }

            if (
                descricao.length < 10 ||
                descricao.length > 3000
            ) {

                return res.status(400).json({
                    error:
                        "A descrição precisa ter entre 10 e 3000 caracteres."
                });
            }

            if (!CATEGORIAS.includes(category)) {

                return res.status(400).json({
                    error:
                        "Categoria inválida."
                });
            }

            if (
                !Number.isFinite(preco) ||
                preco <= 0
            ) {

                return res.status(400).json({
                    error:
                        "O preço precisa ser maior que R$ 0,00."
                });
            }

            /*
                A taxa do SlaxStore é R$0,97.

                Não permitimos preço abaixo
                da taxa para que o vendedor
                não fique com saldo negativo.
            */

            if (preco < 0.97) {

                return res.status(400).json({
                    error:
                        "O preço mínimo é R$ 0,97."
                });
            }

            if (
                !Number.isInteger(estoque) ||
                estoque < 1 ||
                estoque > 100000
            ) {

                return res.status(400).json({
                    error:
                        "O estoque precisa ser um número entre 1 e 100000."
                });
            }

            if (
                !TIPOS_ENTREGA.includes(
                    delivery_type
                )
            ) {

                return res.status(400).json({
                    error:
                        "Tipo de entrega inválido."
                });
            }

            let imagem = null;

            if (image_url !== null) {

                imagem =
                    String(image_url).trim();

                if (imagem.length > 2000000) {

                    return res.status(400).json({
                        error:
                            "A imagem é muito grande."
                    });
                }

                if (
                    imagem &&
                    !imagem.startsWith("http://") &&
                    !imagem.startsWith("https://") &&
                    !imagem.startsWith("data:image/")
                ) {

                    return res.status(400).json({
                        error:
                            "Formato de imagem inválido."
                    });
                }
            }

            const timestamp =
                agora();

            const resultado =
                db.prepare(`
                    INSERT INTO products
                    (
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

                    VALUES
                    (
                        @seller_id,
                        @title,
                        @description,
                        @category,
                        @price_cents,
                        @image_url,
                        'pending',
                        @stock,
                        @delivery_type,
                        0,
                        @created_at,
                        @updated_at
                    )
                `)
                .run({
                    seller_id:
                        req.user.id,

                    title:
                        titulo,

                    description:
                        descricao,

                    category,

                    price_cents:
                        Math.round(
                            preco * 100
                        ),

                    image_url:
                        imagem,

                    stock:
                        estoque,

                    delivery_type,

                    created_at:
                        timestamp,

                    updated_at:
                        timestamp
                });

            const produto =
                db.prepare(`
                    SELECT *
                    FROM products
                    WHERE id = ?
                `)
                .get(resultado.lastInsertRowid);

            res.status(201).json({
                message:
                    "Anúncio enviado para moderação.",

                product:
                    formatarProduto(produto)
            });

        } catch (erro) {

            console.error(
                "Erro ao criar produto:",
                erro
            );

            res.status(500).json({
                error:
                    "Erro ao criar anúncio."
            });
        }
    }
);


/* ==========================================
   PUT /api/products/:id
   EDITAR ANÚNCIO
========================================== */

router.put(
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
                        "ID inválido."
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

            if (
                produto.seller_id !==
                req.user.id
            ) {

                return res.status(403).json({
                    error:
                        "Você não pode editar este anúncio."
                });
            }

            const {
                title,
                description,
                category,
                price,
                image_url,
                stock,
                delivery_type
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
                Number(
                    price ??
                    produto.price_cents / 100
                );

            const estoque =
                Number.parseInt(
                    stock ??
                    produto.stock,
                    10
                );

            const entrega =
                delivery_type ??
                produto.delivery_type;

            let imagem =
                image_url !== undefined
                    ? image_url
                    : produto.image_url;

            if (
                typeof imagem === "string"
            ) {
                imagem =
                    imagem.trim();
            }

            if (
                titulo.length < 3 ||
                titulo.length > 100
            ) {

                return res.status(400).json({
                    error:
                        "O título precisa ter entre 3 e 100 caracteres."
                });
            }

            if (
                descricao.length < 10 ||
                descricao.length > 3000
            ) {

                return res.status(400).json({
                    error:
                        "A descrição precisa ter entre 10 e 3000 caracteres."
                });
            }

            if (!CATEGORIAS.includes(categoria)) {

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
                        "O preço mínimo é R$ 0,97."
                });
            }

            if (
                !Number.isInteger(estoque) ||
                estoque < 1
            ) {

                return res.status(400).json({
                    error:
                        "O estoque precisa ser pelo menos 1."
                });
            }

            if (
                !TIPOS_ENTREGA.includes(entrega)
            ) {

                return res.status(400).json({
                    error:
                        "Tipo de entrega inválido."
                });
            }

            if (
                imagem &&
                !String(imagem).startsWith("http://") &&
                !String(imagem).startsWith("https://") &&
                !String(imagem).startsWith("data:image/")
            ) {

                return res.status(400).json({
                    error:
                        "Formato de imagem inválido."
                });
            }

            if (
                String(imagem || "").length >
                2000000
            ) {

                return res.status(400).json({
                    error:
                        "A imagem é muito grande."
                });
            }

            const timestamp =
                agora();

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
            `)
            .run(
                titulo,
                descricao,
                categoria,
                Math.round(preco * 100),
                imagem || null,
                estoque,
                entrega,
                timestamp,
                id
            );

            const atualizado =
                db.prepare(`
                    SELECT *
                    FROM products
                    WHERE id = ?
                `)
                .get(id);

            res.json({
                message:
                    "Anúncio atualizado e enviado novamente para moderação.",

                product:
                    formatarProduto(atualizado)
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao editar anúncio."
            });
        }
    }
);


/* ==========================================
   POST /api/products/:id/pause
   PAUSAR / REATIVAR
========================================== */

router.post(
    "/:id/pause",
    autenticar,
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

            if (
                produto.seller_id !==
                req.user.id
            ) {

                return res.status(403).json({
                    error:
                        "Você não pode alterar este anúncio."
                });
            }

            if (
                produto.status !== "approved" &&
                produto.status !== "paused"
            ) {

                return res.status(400).json({
                    error:
                        "Somente anúncios aprovados ou pausados podem ser alterados."
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
            `)
            .run(
                novoStatus,
                agora(),
                id
            );

            res.json({
                message:
                    novoStatus === "paused"
                        ? "Anúncio pausado."
                        : "Anúncio reativado.",

                status:
                    novoStatus
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao alterar anúncio."
            });
        }
    }
);


/* ==========================================
   DELETE /api/products/:id
========================================== */

router.delete(
    "/:id",
    autenticar,
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

            if (
                produto.seller_id !==
                req.user.id
            ) {

                return res.status(403).json({
                    error:
                        "Você não pode excluir este anúncio."
                });
            }

            db.prepare(`
                DELETE FROM products
                WHERE id = ?
            `)
            .run(id);

            res.json({
                message:
                    "Anúncio excluído com sucesso."
            });

        } catch (erro) {

            console.error(erro);

            res.status(500).json({
                error:
                    "Erro ao excluir anúncio."
            });
        }
    }
);


/* ==========================================
   FORMATAR PRODUTO
========================================== */

function formatarProduto(produto) {

    if (!produto) {
        return null;
    }

    return {

        id:
            produto.id,

        title:
            produto.title,

        description:
            produto.description,

        category:
            produto.category,

        price_cents:
            produto.price_cents,

        price:
            produto.price_cents / 100,

        image_url:
            produto.image_url,

        status:
            produto.status,

        stock:
            produto.stock,

        delivery_type:
            produto.delivery_type,

        views:
            produto.views,

        created_at:
            produto.created_at,

        updated_at:
            produto.updated_at,

        seller: {

            id:
                produto.seller_id,

            username:
                produto.seller_username,

            avatar_url:
                produto.seller_avatar,

            rating_positive:
                produto.rating_positive ?? 0,

            rating_neutral:
                produto.rating_neutral ?? 0,

            rating_negative:
                produto.rating_negative ?? 0,

            seller_verified:
                Boolean(
                    produto.seller_verified
                )
        }
    };
}


module.exports = router;
