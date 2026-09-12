const Database = require("better-sqlite3");

const db = new Database("slaxstore.db");

db.pragma("journal_mode = WAL");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        verification_code_hash TEXT,
        verification_expires INTEGER,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        created_at INTEGER NOT NULL,

        FOREIGN KEY (seller_id)
        REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        buyer_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        platform_fee_cents INTEGER NOT NULL DEFAULT 97,
        seller_amount_cents INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,

        FOREIGN KEY (buyer_id)
        REFERENCES users(id),

        FOREIGN KEY (product_id)
        REFERENCES products(id)
    );
`);

module.exports = db;
