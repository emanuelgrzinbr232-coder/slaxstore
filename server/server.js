require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const path = require("path");

require("./database");

const { router: auth } = require("./auth");

const app = express();

app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");


/* ================================
   CORS
================================ */

app.use(
    cors({
        origin: true,
        credentials: true
    })
);


/* ================================
   JSON
================================ */

app.use(
    express.json({
        limit: "100kb"
    })
);


/* ================================
   COOKIES
================================ */

app.use(cookieParser());


/* ================================
   LIMITE DE TENTATIVAS
================================ */

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,

    message: {
        error:
            "Muitas tentativas. Aguarde alguns minutos."
    }
});


/* ================================
   AUTENTICAÇÃO
================================ */

app.use(
    "/api/auth",
    authLimiter,
    auth
);


/* ================================
   TESTE DA API
================================ */

app.get("/api", (req, res) => {

    res.json({
        online: true,
        name: "SlaxStore API",
        version: "1.0.0"
    });

});


/* ================================
   SITE
================================ */

app.use(
    express.static(
        path.join(__dirname, "..")
    )
);


/* ================================
   ROTA API NÃO ENCONTRADA
================================ */

app.use("/api", (req, res) => {

    res.status(404).json({
        error:
            "Rota não encontrada."
    });

});


/* ================================
   INICIAR SERVIDOR
================================ */

app.listen(PORT, () => {

    console.log("");
    console.log("==============================");
    console.log("      SLAXSTORE ONLINE");
    console.log("==============================");
    console.log(
        `Servidor iniciado na porta ${PORT}`
    );
    console.log("==============================");
    console.log("");

});
