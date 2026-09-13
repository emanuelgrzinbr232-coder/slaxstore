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

    avatar_url TEXT,
    bio TEXT DEFAULT '',

    seller_verified INTEGER NOT NULL DEFAULT 0,
    verification_status TEXT NOT NULL DEFAULT 'none',

    rating_positive INTEGER NOT NULL DEFAULT 0,
    rating_neutral INTEGER NOT NULL DEFAULT 0,
    rating_negative INTEGER NOT NULL DEFAULT 0,

    suspended INTEGER NOT NULL DEFAULT 0,

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

module.exports = db;
