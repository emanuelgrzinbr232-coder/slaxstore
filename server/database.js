const Database = require("better-sqlite3");

const db = new Database("slaxstore.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");


/* ==========================================
   FUNÇÕES DE MIGRAÇÃO
========================================== */

function tabelaExiste(nome) {
    const resultado = db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        AND name = ?
    `).get(nome);

    return !!resultado;
}


function colunaExiste(tabela, coluna) {

    if (!tabelaExiste(tabela)) {
        return false;
    }

    const colunas = db.prepare(`
        PRAGMA table_info(${tabela})
    `).all();

    return colunas.some(
        item => item.name === coluna
    );
}


function adicionarColuna(
    tabela,
    coluna,
    definicao
) {

    if (!colunaExiste(tabela, coluna)) {

        db.exec(`
            ALTER TABLE ${tabela}
            ADD COLUMN ${coluna} ${definicao}
        `);

        console.log(
            `[DB] Coluna adicionada: ${tabela}.${coluna}`
        );
    }
}


/* ==========================================
   TABELA USERS
========================================== */

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        username TEXT NOT NULL UNIQUE,

        email TEXT NOT NULL UNIQUE,

        password_hash TEXT NOT NULL,

        email_verified INTEGER NOT NULL DEFAULT 0,

        avatar_url TEXT,

        bio TEXT DEFAULT '',

        seller_verified INTEGER NOT NULL DEFAULT 0,

        verification_status TEXT NOT NULL DEFAULT 'none',

        rating_positive INTEGER NOT NULL DEFAULT 0,

        rating_neutral INTEGER NOT NULL DEFAULT 0,

        rating_negative INTEGER NOT NULL DEFAULT 0,

        suspended INTEGER NOT NULL DEFAULT 0,

        role TEXT NOT NULL DEFAULT 'user',

        verification_code_hash TEXT,

        verification_expires INTEGER,

        created_at INTEGER NOT NULL
    );
`);


/* ==========================================
   MIGRAÇÃO USERS
========================================== */

adicionarColuna(
    "users",
    "email_verified",
    "INTEGER NOT NULL DEFAULT 0"
);

adicionarColuna(
    "users",
    "avatar_url",
    "TEXT"
);

adicionarColuna(
    "users",
    "bio",
    "TEXT DEFAULT ''"
);

adicionarColuna(
    "users",
    "seller_verified",
    "INTEGER NOT NULL DEFAULT 0"
);

adicionarColuna(
    "users",
    "verification_status",
    "TEXT NOT NULL DEFAULT 'none'"
);

adicionarColuna(
    "users",
    "rating_positive",
    "INTEGER NOT NULL DEFAULT 0"
);

adicionarColuna(
    "users",
    "rating_neutral",
    "INTEGER NOT NULL DEFAULT 0"
);

adicionarColuna(
    "users",
    "rating_negative",
    "INTEGER NOT NULL DEFAULT 0"
);

adicionarColuna(
    "users",
    "suspended",
    "INTEGER NOT NULL DEFAULT 0"
);

adicionarColuna(
    "users",
    "role",
    "TEXT NOT NULL DEFAULT 'user'"
);

adicionarColuna(
    "users",
    "verification_code_hash",
    "TEXT"
);

adicionarColuna(
    "users",
    "verification_expires",
    "INTEGER"
);


/* ==========================================
   TABELA PRODUCTS
========================================== */

db.exec(`
    CREATE TABLE IF NOT EXISTS products (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        seller_id INTEGER NOT NULL,

        title TEXT NOT NULL,

        description TEXT NOT NULL,

        category TEXT NOT NULL,

        price_cents INTEGER NOT NULL,

        image_url TEXT,

        status TEXT NOT NULL DEFAULT 'pending',

        stock INTEGER NOT NULL DEFAULT 1,

        delivery_type TEXT NOT NULL DEFAULT 'manual',

        views INTEGER NOT NULL DEFAULT 0,

        created_at INTEGER NOT NULL,

        updated_at INTEGER NOT NULL,

        FOREIGN KEY (seller_id)
            REFERENCES users(id)
    );
`);


/* ==========================================
   MIGRAÇÃO PRODUCTS
========================================== */

adicionarColuna(
    "products",
    "image_url",
    "TEXT"
);

adicionarColuna(
    "products",
    "status",
    "TEXT NOT NULL DEFAULT 'pending'"
);

adicionarColuna(
    "products",
    "stock",
    "INTEGER NOT NULL DEFAULT 1"
);

adicionarColuna(
    "products",
    "delivery_type",
    "TEXT NOT NULL DEFAULT 'manual'"
);

adicionarColuna(
    "products",
    "views",
    "INTEGER NOT NULL DEFAULT 0"
);

adicionarColuna(
    "products",
    "updated_at",
    "INTEGER NOT NULL DEFAULT 0"
);


/* ==========================================
   TABELA ORDERS
========================================== */

db.exec(`
    CREATE TABLE IF NOT EXISTS orders (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        buyer_id INTEGER NOT NULL,

        seller_id INTEGER NOT NULL,

        product_id INTEGER NOT NULL,

        amount_cents INTEGER NOT NULL,

        platform_fee_cents INTEGER NOT NULL DEFAULT 97,

        seller_amount_cents INTEGER NOT NULL,

        status TEXT NOT NULL DEFAULT 'pending',

        created_at INTEGER NOT NULL,

        updated_at INTEGER NOT NULL,

        FOREIGN KEY (buyer_id)
            REFERENCES users(id),

        FOREIGN KEY (seller_id)
            REFERENCES users(id),

        FOREIGN KEY (product_id)
            REFERENCES products(id)
    );
`);


/* ==========================================
   MIGRAÇÃO ORDERS
========================================== */

adicionarColuna(
    "orders",
    "platform_fee_cents",
    "INTEGER NOT NULL DEFAULT 97"
);

adicionarColuna(
    "orders",
    "seller_amount_cents",
    "INTEGER NOT NULL DEFAULT 0"
);

adicionarColuna(
    "orders",
    "status",
    "TEXT NOT NULL DEFAULT 'pending'"
);

adicionarColuna(
    "orders",
    "updated_at",
    "INTEGER NOT NULL DEFAULT 0"
);


/* ==========================================
   TABELA MESSAGES
========================================== */

db.exec(`
    CREATE TABLE IF NOT EXISTS messages (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        order_id INTEGER NOT NULL,

        sender_id INTEGER NOT NULL,

        message TEXT NOT NULL,

        created_at INTEGER NOT NULL,

        FOREIGN KEY (order_id)
            REFERENCES orders(id),

        FOREIGN KEY (sender_id)
            REFERENCES users(id)
    );
`);


/* ==========================================
   TABELA REVIEWS
========================================== */

db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        order_id INTEGER NOT NULL UNIQUE,

        buyer_id INTEGER NOT NULL,

        seller_id INTEGER NOT NULL,

        rating TEXT NOT NULL,

        comment TEXT DEFAULT '',

        created_at INTEGER NOT NULL,

        FOREIGN KEY (order_id)
            REFERENCES orders(id),

        FOREIGN KEY (buyer_id)
            REFERENCES users(id),

        FOREIGN KEY (seller_id)
            REFERENCES users(id)
    );
`);


/* ==========================================
   TABELA REPORTS
========================================== */

db.exec(`
    CREATE TABLE IF NOT EXISTS reports (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        reporter_id INTEGER NOT NULL,

        product_id INTEGER,

        reported_user_id INTEGER,

        reason TEXT NOT NULL,

        description TEXT DEFAULT '',

        status TEXT NOT NULL DEFAULT 'pending',

        created_at INTEGER NOT NULL,

        FOREIGN KEY (reporter_id)
            REFERENCES users(id),

        FOREIGN KEY (product_id)
            REFERENCES products(id),

        FOREIGN KEY (reported_user_id)
            REFERENCES users(id)
    );
`);


/* ==========================================
   TABELA VERIFICATION_REQUESTS
========================================== */

db.exec(`
    CREATE TABLE IF NOT EXISTS verification_requests (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        user_id INTEGER NOT NULL,

        status TEXT NOT NULL DEFAULT 'pending',

        provider TEXT,

        provider_reference TEXT,

        moderator_note TEXT,

        created_at INTEGER NOT NULL,

        updated_at INTEGER NOT NULL,

        FOREIGN KEY (user_id)
            REFERENCES users(id)
    );
`);


/* ==========================================
   ÍNDICES
========================================== */

db.exec(`
    CREATE INDEX IF NOT EXISTS
    idx_products_seller
    ON products(seller_id);

    CREATE INDEX IF NOT EXISTS
    idx_products_status
    ON products(status);

    CREATE INDEX IF NOT EXISTS
    idx_products_category
    ON products(category);

    CREATE INDEX IF NOT EXISTS
    idx_products_created
    ON products(created_at);

    CREATE INDEX IF NOT EXISTS
    idx_orders_buyer
    ON orders(buyer_id);

    CREATE INDEX IF NOT EXISTS
    idx_orders_seller
    ON orders(seller_id);

    CREATE INDEX IF NOT EXISTS
    idx_orders_product
    ON orders(product_id);

    CREATE INDEX IF NOT EXISTS
    idx_orders_status
    ON orders(status);

    CREATE INDEX IF NOT EXISTS
    idx_messages_order
    ON messages(order_id);

    CREATE INDEX IF NOT EXISTS
    idx_reports_status
    ON reports(status);

    CREATE INDEX IF NOT EXISTS
    idx_verification_status
    ON verification_requests(status);
`);


/* ==========================================
   CORREÇÕES DE DADOS ANTIGOS
========================================== */

db.prepare(`
    UPDATE users

    SET
        bio = ''

    WHERE bio IS NULL
`).run();


db.prepare(`
    UPDATE users

    SET
        verification_status = 'none'

    WHERE verification_status IS NULL
       OR verification_status = ''
`).run();


db.prepare(`
    UPDATE products

    SET
        stock = 1

    WHERE stock IS NULL
       OR stock < 1
`).run();


db.prepare(`
    UPDATE products

    SET
        delivery_type = 'manual'

    WHERE delivery_type IS NULL
       OR delivery_type = ''
`).run();


db.prepare(`
    UPDATE products

    SET
        views = 0

    WHERE views IS NULL
`).run();


db.prepare(`
    UPDATE products

    SET
        updated_at = created_at

    WHERE updated_at IS NULL
       OR updated_at = 0
`).run();


db.prepare(`
    UPDATE orders

    SET
        updated_at = created_at

    WHERE updated_at IS NULL
       OR updated_at = 0
`).run();


/* ==========================================
   FINALIZAÇÃO
========================================== */

console.log("");
console.log("==============================");
console.log("      SLAXSTORE DATABASE");
console.log("==============================");
console.log("Banco de dados carregado.");
console.log("Migrações verificadas.");
console.log("Dados existentes preservados.");
console.log("==============================");
console.log("");


module.exports = db;
