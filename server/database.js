const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "..", "slaxstore.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,

    email_verified INTEGER NOT NULL DEFAULT 0,

    avatar_url TEXT,
    bio TEXT NOT NULL DEFAULT "",

    seller_verified INTEGER NOT NULL DEFAULT 0,
    verification_status TEXT NOT NULL DEFAULT 'none',

    role TEXT NOT NULL DEFAULT 'user',
    suspended INTEGER NOT NULL DEFAULT 0,

    rating_positive INTEGER NOT NULL DEFAULT 0,
    rating_neutral INTEGER NOT NULL DEFAULT 0,
    rating_negative INTEGER NOT NULL DEFAULT 0,

    verification_code_hash TEXT,
    verification_expires INTEGER,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    buyer_id INTEGER NOT NULL,
    seller_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,

    price_cents INTEGER NOT NULL,
    platform_fee_cents INTEGER NOT NULL DEFAULT 97,
    seller_amount_cents INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,

    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (seller_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    order_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,

    message TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    order_id INTEGER NOT NULL UNIQUE,
    buyer_id INTEGER NOT NULL,
    seller_id INTEGER NOT NULL,

    rating TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT "",

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    reporter_id INTEGER NOT NULL,
    product_id INTEGER,
    reported_user_id INTEGER,

    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,

    FOREIGN KEY (reporter_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS verification_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL UNIQUE,

    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_products_seller
ON products(seller_id);

CREATE INDEX IF NOT EXISTS idx_products_status
ON products(status);

CREATE INDEX IF NOT EXISTS idx_products_category
ON products(category);

CREATE INDEX IF NOT EXISTS idx_orders_buyer
ON orders(buyer_id);

CREATE INDEX IF NOT EXISTS idx_orders_seller
ON orders(seller_id);

CREATE INDEX IF NOT EXISTS idx_messages_order
ON messages(order_id);

CREATE INDEX IF NOT EXISTS idx_reports_status
ON reports(status);

CREATE INDEX IF NOT EXISTS idx_verification_status
ON verification_requests(status);
`);

/*
 * Garante que a conta configurada como administradora
 * receba a função de admin quando já existir no banco.
 */
const adminEmail = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

if (adminEmail) {
    db.prepare(`
        UPDATE users
        SET role = 'admin'
        WHERE LOWER(email) = ?
    `).run(adminEmail);
}

console.log("Banco de dados SlaxStore conectado.");

module.exports = db;
