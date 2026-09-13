require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const path = require("path");

require("./database");

const { router: auth } = require("./auth");
const products = require("./products");
const orders = require("./orders");
const moderation = require("./moderation");

const app = express();

const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

app.disable("x-powered-by");

/*
 * CORS
 */
app.use(
    cors({
        origin: true,
        credentials: true
    })
);

/*
 * JSON
 */
app.use(
    express.json({
        limit: "3mb"
    })
);

/*
 * Cookies
 */
app.use(cookieParser());

/*
 * Limite para autenticação
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    max: 30,

    standardHeaders: true,

    legacyHeaders: false,

    message: {
        error: "Muitas tentativas. Aguarde alguns minutos."
    }
});

/*
 * ROTAS DE AUTENTICAÇÃO
 */
app.use(
    "/api/auth",
    authLimiter,
    auth
);

/*
 * ROTAS DE PRODUTOS
 */
app.use(
    "/api/products",
    products
);

/*
 * ROTAS DE PEDIDOS
 */
app.use(
    "/api/orders",
    orders
);

/*
 * ROTAS DE MODERAÇÃO
 */
app.use(
    "/api/moderation",
    moderation
);

/*
 * STATUS DA API
 */
app.get(
    "/api",
    (req, res) => {
        res.json({
            online: true,
            name: "SlaxStore API",
            version: "2.0.0"
        });
    }
);

/*
 * STATUS MAIS DETALHADO
 */
app.get(
    "/api/health",
    (req, res) => {
        res.json({
            online: true,
            service: "SlaxStore",
            api: "2.0.0",
            timestamp: new Date().toISOString()
        });
    }
);

/*
 * SITE FRONTEND
 */
app.use(
    express.static(
        path.join(__dirname, "..")
    )
);

/*
 * API 404
 */
app.use(
    "/api",
    (req, res) => {
        res.status(404).json({
            error: "Rota não encontrada."
        });
    }
);

/*
 * ERRO GLOBAL
 */
app.use(
    (err, req, res, next) => {
        console.error(
            "Erro não tratado:",
            err
        );

        if (res.headersSent) {
            return next(err);
        }

        res.status(500).json({
            error: "Erro interno do servidor."
        });
    }
);

/*
 * INICIAR SERVIDOR
 */
app.listen(
    PORT,
    () => {
        console.log(
            `SlaxStore API online na porta ${PORT}`
        );
    }
);
