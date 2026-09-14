const { readDb, writeDb, nextId, now } = require("./database");

function normalizeText(value) {
return String(value || "").trim();
}

function normalizeCategory(value) {
const category = normalizeText(value).toLowerCase();

const allowed = [
"roblox",
"minecraft",
"contas",
"itens",
"outros"
];

return allowed.includes(category)
? category
: "outros";
}

function normalizePrice(value) {
const price = Number(value);

if (!Number.isFinite(price)) {
throw new Error("Preço inválido.");
}

const cents = Math.round(price);

if (cents < 1) {
throw new Error("O preço deve ser maior que R$ 0,01.");
}

if (cents > 100000000) {
throw new Error("Preço muito alto.");
}

return cents;
}

function publicProduct(product) {
return {
id: product.id,
name: product.name,
description: product.description,
price: product.price,
category: product.category,
image: product.image || "",
sellerId: product.sellerId,
sellerName: product.sellerName || "Vendedor",
sold: !!product.sold,
available: !product.sold && !product.moderated,
createdAt: product.createdAt,
updatedAt: product.updatedAt
};
}

function getProducts({
category = null,
search = null,
sellerId = null
} = {}) {
const db = readDb();

let products = db.products.filter(
(product) =>
product.moderated !== true &&
product.sold !== true
);

if (category) {
const normalizedCategory =
normalizeCategory(category);

```
products = products.filter(
  (product) =>
    product.category === normalizedCategory
);
```

}

if (sellerId !== null && sellerId !== undefined) {
products = products.filter(
(product) =>
Number(product.sellerId) === Number(sellerId)
);
}

if (search) {
const term = normalizeText(search).toLowerCase();

```
products = products.filter((product) => {
  const name = normalizeText(product.name).toLowerCase();
  const description = normalizeText(
    product.description
  ).toLowerCase();
  const productCategory = normalizeText(
    product.category
  ).toLowerCase();

  return (
    name.includes(term) ||
    description.includes(term) ||
    productCategory.includes(term)
  );
});
```

}

products.sort(
(a, b) =>
new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime()
);

return products.map(publicProduct);
}

function getProductById(productId) {
const db = readDb();

const product = db.products.find(
(item) =>
Number(item.id) === Number(productId)
);

if (!product) {
return null;
}

return publicProduct(product);
}

function getRawProductById(productId) {
const db = readDb();

return (
db.products.find(
(item) =>
Number(item.id) === Number(productId)
) || null
);
}

function createProduct({
sellerId,
sellerName,
name,
description,
price,
category,
image = ""
}) {
const cleanName = normalizeText(name);
const cleanDescription =
normalizeText(description);

if (!sellerId) {
throw new Error("Vendedor inválido.");
}

if (cleanName.length < 2) {
throw new Error(
"O nome do produto deve ter pelo menos 2 caracteres."
);
}

if (cleanName.length > 100) {
throw new Error(
"O nome do produto é muito longo."
);
}

if (cleanDescription.length < 5) {
throw new Error(
"A descrição deve ter pelo menos 5 caracteres."
);
}

if (cleanDescription.length > 2000) {
throw new Error(
"A descrição é muito longa."
);
}

const normalizedPrice = normalizePrice(price);
const normalizedCategory =
normalizeCategory(category);

const db = readDb();

const product = {
id: nextId("product"),
sellerId: Number(sellerId),
sellerName:
normalizeText(sellerName) || "Vendedor",
name: cleanName,
description: cleanDescription,
price: normalizedPrice,
category: normalizedCategory,
image: normalizeText(image),
sold: false,
moderated: false,
createdAt: now(),
updatedAt: now()
};

db.products.push(product);

writeDb(db);

return publicProduct(product);
}

function updateProduct(
productId,
sellerId,
updates = {}
) {
const db = readDb();

const product = db.products.find(
(item) =>
Number(item.id) === Number(productId)
);

if (!product) {
throw new Error("Produto não encontrado.");
}

if (
Number(product.sellerId) !==
Number(sellerId)
) {
throw new Error(
"Você não pode editar este produto."
);
}

if (product.sold) {
throw new Error(
"Um produto vendido não pode ser editado."
);
}

if (updates.name !== undefined) {
const name = normalizeText(updates.name);

```
if (name.length < 2 || name.length > 100) {
  throw new Error("Nome do produto inválido.");
}

product.name = name;
```

}

if (updates.description !== undefined) {
const description =
normalizeText(updates.description);

```
if (
  description.length < 5 ||
  description.length > 2000
) {
  throw new Error("Descrição inválida.");
}

product.description = description;
```

}

if (updates.price !== undefined) {
product.price = normalizePrice(
updates.price
);
}

if (updates.category !== undefined) {
product.category = normalizeCategory(
updates.category
);
}

if (updates.image !== undefined) {
product.image = normalizeText(
updates.image
);
}

product.updatedAt = now();

writeDb(db);

return publicProduct(product);
}

function removeProduct(productId, sellerId) {
const db = readDb();

const index = db.products.findIndex(
(item) =>
Number(item.id) === Number(productId)
);

if (index === -1) {
throw new Error("Produto não encontrado.");
}

const product = db.products[index];

if (
Number(product.sellerId) !==
Number(sellerId)
) {
throw new Error(
"Você não pode remover este produto."
);
}

if (product.sold) {
throw new Error(
"Um produto vendido não pode ser removido."
);
}

db.products.splice(index, 1);

writeDb(db);

return {
success: true
};
}

function markProductAsSold(productId) {
const db = readDb();

const product = db.products.find(
(item) =>
Number(item.id) === Number(productId)
);

if (!product) {
throw new Error("Produto não encontrado.");
}

product.sold = true;
product.updatedAt = now();

writeDb(db);

return publicProduct(product);
}

module.exports = {
publicProduct,
getProducts,
getProductById,
getRawProductById,
createProduct,
updateProduct,
removeProduct,
markProductAsSold
};
