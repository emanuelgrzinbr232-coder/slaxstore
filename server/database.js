const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATABASE_FILE = path.join(DATA_DIR, "slaxstore.json");

const DEFAULT_DATABASE = {
users: [],
products: [],
orders: [],
withdrawals: [],
moderation: [],
counters: {
user: 0,
product: 0,
order: 0,
withdrawal: 0,
moderation: 0
}
};

function ensureDatabase() {
if (!fs.existsSync(DATA_DIR)) {
fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATABASE_FILE)) {
fs.writeFileSync(
DATABASE_FILE,
JSON.stringify(DEFAULT_DATABASE, null, 2),
"utf8"
);
}
}

function normalizeDatabase(db) {
if (!db || typeof db !== "object") {
db = {};
}

if (!Array.isArray(db.users)) db.users = [];
if (!Array.isArray(db.products)) db.products = [];
if (!Array.isArray(db.orders)) db.orders = [];
if (!Array.isArray(db.withdrawals)) db.withdrawals = [];
if (!Array.isArray(db.moderation)) db.moderation = [];

if (!db.counters || typeof db.counters !== "object") {
db.counters = {};
}

if (!Number.isFinite(db.counters.user)) db.counters.user = 0;
if (!Number.isFinite(db.counters.product)) db.counters.product = 0;
if (!Number.isFinite(db.counters.order)) db.counters.order = 0;
if (!Number.isFinite(db.counters.withdrawal)) db.counters.withdrawal = 0;
if (!Number.isFinite(db.counters.moderation)) db.counters.moderation = 0;

return db;
}

function readDb() {
ensureDatabase();

try {
const content = fs.readFileSync(DATABASE_FILE, "utf8");

```
if (!content.trim()) {
  return normalizeDatabase({ ...DEFAULT_DATABASE });
}

const db = JSON.parse(content);
return normalizeDatabase(db);
```

} catch (error) {
console.error("Erro ao ler banco de dados:", error);

```
const backup = `${DATABASE_FILE}.backup-${Date.now()}`;

try {
  if (fs.existsSync(DATABASE_FILE)) {
    fs.copyFileSync(DATABASE_FILE, backup);
  }
} catch (backupError) {
  console.error("Erro ao criar backup:", backupError);
}

const freshDatabase = normalizeDatabase({
  ...DEFAULT_DATABASE,
  counters: { ...DEFAULT_DATABASE.counters }
});

writeDb(freshDatabase);

return freshDatabase;
```

}
}

function writeDb(db) {
ensureDatabase();

const normalized = normalizeDatabase(db);

const temporaryFile = `${DATABASE_FILE}.tmp`;

fs.writeFileSync(
temporaryFile,
JSON.stringify(normalized, null, 2),
"utf8"
);

fs.renameSync(temporaryFile, DATABASE_FILE);

return normalized;
}

function nextId(type) {
const allowedTypes = [
"user",
"product",
"order",
"withdrawal",
"moderation"
];

if (!allowedTypes.includes(type)) {
throw new Error(`Tipo de ID inválido: ${type}`);
}

const db = readDb();

db.counters[type] += 1;

writeDb(db);

return db.counters[type];
}

function now() {
return new Date().toISOString();
}

module.exports = {
DATA_DIR,
DATABASE_FILE,
readDb,
writeDb,
nextId,
now
};
