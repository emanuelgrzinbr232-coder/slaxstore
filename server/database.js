const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "slaxstore.json");

const DEFAULT_DB = {
users: [],
products: [],
orders: [],
withdrawals: [],
moderation: [],
counters: {
user: 1,
product: 1,
order: 1,
withdrawal: 1,
moderation: 1
}
};

function ensureDatabase() {
if (!fs.existsSync(DATA_DIR)) {
fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DB_FILE)) {
fs.writeFileSync(
DB_FILE,
JSON.stringify(DEFAULT_DB, null, 2),
"utf8"
);
}
}

function readDb() {
ensureDatabase();

try {
const content = fs.readFileSync(DB_FILE, "utf8");
const parsed = JSON.parse(content);

```
return {
  ...DEFAULT_DB,
  ...parsed,
  users: Array.isArray(parsed.users) ? parsed.users : [],
  products: Array.isArray(parsed.products) ? parsed.products : [],
  orders: Array.isArray(parsed.orders) ? parsed.orders : [],
  withdrawals: Array.isArray(parsed.withdrawals)
    ? parsed.withdrawals
    : [],
  moderation: Array.isArray(parsed.moderation)
    ? parsed.moderation
    : [],
  counters: {
    ...DEFAULT_DB.counters,
    ...(parsed.counters || {})
  }
};
```

} catch (error) {
console.error("Erro ao ler banco:", error);

```
const fresh = JSON.parse(JSON.stringify(DEFAULT_DB));

fs.writeFileSync(
  DB_FILE,
  JSON.stringify(fresh, null, 2),
  "utf8"
);

return fresh;
```

}
}

function writeDb(db) {
ensureDatabase();

const temporaryFile = `${DB_FILE}.tmp`;

fs.writeFileSync(
temporaryFile,
JSON.stringify(db, null, 2),
"utf8"
);

fs.renameSync(temporaryFile, DB_FILE);
}

function nextId(db, type) {
if (!db.counters[type]) {
db.counters[type] = 1;
}

const id = String(db.counters[type]);

db.counters[type] += 1;

return id;
}

function now() {
return new Date().toISOString();
}

module.exports = {
DATA_DIR,
DB_FILE,
readDb,
writeDb,
nextId,
now
};
