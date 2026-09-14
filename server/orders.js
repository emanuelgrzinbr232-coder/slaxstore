const {
readDb,
writeDb,
nextId,
now
} = require("./database");

const {
getRawProductById
} = require("./products");

const PURCHASE_FEE = 97; // R$ 0,97

function publicOrder(order) {
return {
id: order.id,
productId: order.productId,
buyerId: order.buyerId,
sellerId: order.sellerId,
productName: order.productName,
productPrice: order.productPrice,
fee: order.fee,
total: order.total,
status: order.status,
createdAt: order.createdAt,
updatedAt: order.updatedAt
};
}

function createOrder({
buyerId,
productId
}) {
const db = readDb();

const buyer = db.users.find(
(user) =>
Number(user.id) === Number(buyerId)
);

if (!buyer) {
throw new Error("Comprador não encontrado.");
}

const product = getRawProductById(productId);

if (!product) {
throw new Error("Produto não encontrado.");
}

if (product.sold) {
throw new Error(
"Este produto já foi vendido."
);
}

if (product.moderated) {
throw new Error(
"Este produto não está disponível."
);
}

if (
Number(product.sellerId) ===
Number(buyerId)
) {
throw new Error(
"Você não pode comprar seu próprio produto."
);
}

const productPrice = Number(product.price);

if (
!Number.isFinite(productPrice) ||
productPrice <= 0
) {
throw new Error(
"Preço do produto inválido."
);
}

const fee = PURCHASE_FEE;
const total = productPrice + fee;

const buyerBalance = Number(
buyer.balance || 0
);

if (buyerBalance < total) {
throw new Error(
`Saldo insuficiente. Você precisa de R$ ${(total / 100).toFixed(2).replace(".", ",")}.`
);
}

const seller = db.users.find(
(user) =>
Number(user.id) ===
Number(product.sellerId)
);

if (!seller) {
throw new Error(
"Vendedor não encontrado."
);
}

buyer.balance =
buyerBalance - total;

seller.balance =
Number(seller.balance || 0) +
productPrice;

product.sold = true;
product.buyerId = Number(buyerId);
product.soldAt = now();
product.updatedAt = now();

const order = {
id: nextId("order"),
productId: Number(product.id),
buyerId: Number(buyerId),
sellerId: Number(product.sellerId),
productName: product.name,
productPrice,
fee,
total,
status: "completed",
createdAt: now(),
updatedAt: now()
};

db.orders.push(order);

writeDb(db);

return {
order: publicOrder(order),
product: {
id: product.id,
name: product.name,
description: product.description,
category: product.category,
image: product.image || ""
},
buyerBalance: buyer.balance
};
}

function getOrdersForUser(userId) {
const db = readDb();

return db.orders
.filter(
(order) =>
Number(order.buyerId) ===
Number(userId) ||
Number(order.sellerId) ===
Number(userId)
)
.sort(
(a, b) =>
new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime()
)
.map(publicOrder);
}

function getPurchasedOrders(userId) {
const db = readDb();

return db.orders
.filter(
(order) =>
Number(order.buyerId) ===
Number(userId)
)
.sort(
(a, b) =>
new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime()
)
.map(publicOrder);
}

function getSoldOrders(userId) {
const db = readDb();

return db.orders
.filter(
(order) =>
Number(order.sellerId) ===
Number(userId)
)
.sort(
(a, b) =>
new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime()
)
.map(publicOrder);
}

function getOrderById(orderId, userId = null) {
const db = readDb();

const order = db.orders.find(
(item) =>
Number(item.id) === Number(orderId)
);

if (!order) {
return null;
}

if (
userId !== null &&
Number(order.buyerId) !==
Number(userId) &&
Number(order.sellerId) !==
Number(userId)
) {
return null;
}

return publicOrder(order);
}

function getAllOrders() {
const db = readDb();

return [...db.orders]
.sort(
(a, b) =>
new Date(b.createdAt).getTime() -
new Date(a.createdAt).getTime()
)
.map(publicOrder);
}

module.exports = {
PURCHASE_FEE,
publicOrder,
createOrder,
getOrdersForUser,
getPurchasedOrders,
getSoldOrders,
getOrderById,
getAllOrders
};
