const {
readDb
} = require("./server-database");

const {
authRequired
} = require("./auth");

function register(app) {
/*

* PEDIDOS DO USUÁRIO
  */
  app.get(
  "/api/orders",
  authRequired,
  (req, res) => {
  const db = readDb();

  const orders =
  db.orders
  .filter(order =>
  String(
  order.buyerId
  ) ===
  String(
  req.auth.id
  ) ||

  ```
     String(
       order.sellerId
     ) ===
       String(
         req.auth.id
       )
   )
   .map(order => {
     const product =
       db.products.find(
         product =>
           String(
             product.id
           ) ===
             String(
               order.productId
             )
       );

     const buyer =
       db.users.find(
         user =>
           String(
             user.id
           ) ===
             String(
               order.buyerId
             )
       );

     const seller =
       db.users.find(
         user =>
           String(
             user.id
           ) ===
             String(
               order.sellerId
             )
       );

     return {
       ...order,

       productName:
         product
           ? product.name
           : "Produto removido",

       buyerName:
         buyer
           ? buyer.username
           : "Usuário",

       sellerName:
         seller
           ? seller.username
           : "Usuário"
     };
   })
   .sort(
     (a, b) =>
       new Date(
         b.createdAt
       ) -
       new Date(
         a.createdAt
       )
   );
  ```

  res.json({
  orders
  });
  }
  );

/*

* PEDIDO ESPECÍFICO
  */
  app.get(
  "/api/orders/:id",
  authRequired,
  (req, res) => {
  const db = readDb();

  const order =
  db.orders.find(
  item =>
  String(item.id) ===
  String(req.params.id)
  );

  if (!order) {
  return res.status(404).json({
  error:
  "Pedido não encontrado."
  });
  }

  const canSee =
  String(
  order.buyerId
  ) ===
  String(
  req.auth.id
  ) ||

  String(
  order.sellerId
  ) ===
  String(
  req.auth.id
  );

  if (!canSee) {
  return res.status(403).json({
  error:
  "Você não tem acesso a este pedido."
  });
  }

  res.json({
  order
  });
  }
  );
  }

module.exports = {
register
};
