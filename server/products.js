const {
readDb,
writeDb,
nextId,
now
} = require("./server-database");

const {
authRequired,
cleanUser
} = require("./auth");

function publicProduct(
product,
db
) {
const seller =
db.users.find(
user =>
String(user.id) ===
String(product.sellerId)
);

return {
id: product.id,
_id: product.id,

```
name: product.name,
nome: product.name,

description:
  product.description,
descricao:
  product.description,

price:
  Number(product.price || 0),

preco:
  Number(product.price || 0),

category:
  product.category,

categoria:
  product.category,

image:
  product.image || "",

imageUrl:
  product.image || "",

imagem:
  product.image || "",

sellerId:
  product.sellerId,

sellerName:
  seller
    ? seller.username
    : "Vendedor",

seller:
  seller
    ? seller.username
    : "Vendedor",

status:
  product.status,

createdAt:
  product.createdAt
```

};
}

function register(app) {
/*

* LISTAR PRODUTOS
  */
  app.get(
  "/api/products",
  (req, res) => {
  const db = readDb();

  let products =
  db.products.filter(
  product =>
  product.status ===
  "active"
  );

  const category =
  String(
  req.query.category || ""
  ).trim();

  if (
  category &&
  category !== "Todos"
  ) {
  products =
  products.filter(
  product =>
  String(
  product.category
  ).toLowerCase() ===
  category.toLowerCase()
  );
  }

  products.sort(
  (a, b) =>
  new Date(b.createdAt) -
  new Date(a.createdAt)
  );

  res.json({
  products:
  products.map(
  product =>
  publicProduct(
  product,
  db
  )
  )
  });
  }
  );

/*

* PESQUISA
  */
  app.get(
  "/api/products/search",
  (req, res) => {
  const q =
  String(
  req.query.q || ""
  )
  .trim()
  .toLowerCase();

  const db = readDb();

  const products =
  db.products
  .filter(
  product =>
  product.status ===
  "active"
  )
  .filter(product => {
  if (!q) {
  return true;
  }

  ```
     return (
       product.name
         .toLowerCase()
         .includes(q) ||

       product.description
         .toLowerCase()
         .includes(q) ||

       product.category
         .toLowerCase()
         .includes(q)
     );
   })
   .map(
     product =>
       publicProduct(
         product,
         db
       )
   );
  ```

  res.json({
  products
  });
  }
  );

/*

* DETALHES DO PRODUTO
  */
  app.get(
  "/api/products/:id",
  (req, res) => {
  const db = readDb();

  const product =
  db.products.find(
  item =>
  String(item.id) ===
  String(req.params.id)
  );

  if (!product) {
  return res.status(404).json({
  error:
  "Produto não encontrado."
  });
  }

  res.json({
  product:
  publicProduct(
  product,
  db
  )
  });
  }
  );

/*

* CRIAR PRODUTO
  */
  app.post(
  "/api/products",
  authRequired,
  (req, res) => {
  const db = readDb();

  const user =
  db.users.find(
  item =>
  String(item.id) ===
  String(req.auth.id)
  );

  if (!user) {
  return res.status(401).json({
  error:
  "Usuário não encontrado."
  });
  }

  if (!user.verified) {
  return res.status(403).json({
  error:
  "Verifique seu e-mail antes de vender."
  });
  }

  const name =
  String(
  req.body.name || ""
  ).trim();

  const description =
  String(
  req.body.description || ""
  ).trim();

  const category =
  String(
  req.body.category ||
  "Outros"
  ).trim();

  const image =
  String(
  req.body.image || ""
  ).trim();

  const price =
  Number(
  req.body.price
  );

  if (name.length < 2) {
  return res.status(400).json({
  error:
  "Nome do produto inválido."
  });
  }

  if (name.length > 100) {
  return res.status(400).json({
  error:
  "O nome do produto é muito grande."
  });
  }

  if (
  !Number.isInteger(price) ||
  price < 0
  ) {
  return res.status(400).json({
  error:
  "Preço inválido."
  });
  }

  const product = {
  id:
  nextId(
  db,
  "product"
  ),

  sellerId:
  user.id,

  name,

  description,

  category,

  image,

  /*
  * CENTAVOS
  * R$ 10,00 = 1000
  */
  price,

  status:
  "active",

  createdAt:
  now()
  };

  db.products.push(
  product
  );

  writeDb(db);

  res.status(201).json({
  message:
  "Produto publicado com sucesso.",

  product:
  publicProduct(
  product,
  db
  )
  });
  }
  );

/*

* EXCLUIR PRODUTO
  */
  app.delete(
  "/api/products/:id",
  authRequired,
  (req, res) => {
  const db = readDb();

  const product =
  db.products.find(
  item =>
  String(item.id) ===
  String(req.params.id)
  );

  if (!product) {
  return res.status(404).json({
  error:
  "Produto não encontrado."
  });
  }

  const owner =
  String(
  product.sellerId
  ) ===
  String(req.auth.id);

  const user =
  db.users.find(
  item =>
  String(item.id) ===
  String(req.auth.id)
  );

  if (
  !owner &&
  !user?.isAdmin
  ) {
  return res.status(403).json({
  error:
  "Você não pode excluir este produto."
  });
  }

  product.status =
  "deleted";

  writeDb(db);

  res.json({
  message:
  "Produto removido."
  });
  }
  );

/*

* COMPRAR PRODUTO
  */
  app.post(
  "/api/products/:id/buy",
  authRequired,
  (req, res) => {
  const db = readDb();

  const buyer =
  db.users.find(
  item =>
  String(item.id) ===
  String(req.auth.id)
  );

  const product =
  db.products.find(
  item =>
  String(item.id) ===
  String(req.params.id)
  );

  if (
  !buyer ||
  !product ||
  product.status !==
  "active"
  ) {
  return res.status(404).json({
  error:
  "Produto não encontrado."
  });
  }

  if (!buyer.verified) {
  return res.status(403).json({
  error:
  "Verifique seu e-mail antes de comprar."
  });
  }

  if (
  String(
  product.sellerId
  ) ===
  String(buyer.id)
  ) {
  return res.status(400).json({
  error:
  "Você não pode comprar seu próprio produto."
  });
  }

  const price =
  Number(
  product.price || 0
  );

  if (
  Number(buyer.balance) <
  price
  ) {
  return res.status(400).json({
  error:
  "Saldo insuficiente."
  });
  }

  const seller =
  db.users.find(
  item =>
  String(item.id) ===
  String(product.sellerId)
  );

  if (!seller) {
  return res.status(400).json({
  error:
  "Vendedor não encontrado."
  });
  }

  buyer.balance -=
  price;

  seller.balance +=
  price;

  const order = {
  id:
  nextId(
  db,
  "order"
  ),

  productId:
  product.id,

  buyerId:
  buyer.id,

  sellerId:
  seller.id,

  amount:
  price,

  status:
  "paid",

  createdAt:
  now()
  };

  db.orders.push(
  order
  );

  writeDb(db);

  res.json({
  message:
  "Compra realizada com sucesso.",

  order,

  user:
  cleanUser(
  buyer
  )
  });
  }
  );
  }

module.exports = {
register,
publicProduct
};
