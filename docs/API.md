# Labs 7–8 API guide

Start and initialize MySQL with `npm run db:up` and `npm run db:init`, then run `npm run dev` from the project root before trying these commands. Inventory listens on port 3001 and orders on port 3002. When using AWS, replace each local base URL with the matching deployed invoke URL, including its `/dev` stage.

## Inventory

```sh
curl http://127.0.0.1:3001/inventory-management/inventory
curl http://127.0.0.1:3001/inventory-management/inventory/items/ridge-daypack
curl 'http://127.0.0.1:3001/inventory-management/inventory/items?name=Insulated%20Bottle'
curl 'http://127.0.0.1:3001/inventory-management/inventory/items?id=camp-bottle&name=bottle'
```

The collection and search endpoints return `200` with `{ "items": [...] }`. The ID endpoint returns `{ "item": {...} }`, or `404 ITEM_NOT_FOUND`. A search with no matches returns an empty array. Name matching is case-insensitive substring matching; when `id` and `name` are both supplied, both conditions must match. An omitted/empty filter returns all matching items.

Each item has `id`, `name`, `category`, `description`, `priceCents`, `image`, `color`, `tag`, and `availableQuantity`. A `featured: true` flag selects homepage recommendations. Image paths refer to assets hosted with the frontend.

Sample warehouse quantities are 12 daypacks, 8 tents, 20 jackets, 15 pairs of poles, and 30 bottles. The initial values are inserted by [the SQL seed](../database/002-seed.sql); every inventory request reads MySQL. No endpoint in this lab changes stock.

## Submit an order

From the project root:

```sh
curl -i http://127.0.0.1:3002/order-processing/order \
  -H 'Content-Type: application/json' \
  --data-binary @examples/order.json
```

[The sample JSON file](../examples/order.json) contains item IDs and quantities, payment information, and a shipping address. It uses sample details; keep the expiration date in the future. In Windows PowerShell, use `curl.exe` and put the command on one line if needed.

The service requires 1–100 item lines. Each quantity must be an integer from 1 to 99. Duplicate product IDs are combined before checking stock, and their combined quantity cannot exceed 99. Unknown IDs are reported as unavailable. Payment and shipping fields are checked on the server even if the browser already validated them. Shipping email is required. Country defaults to `US`, the only supported country. Address line 2 is optional. Each text field is limited to 200 characters; request bodies are limited to 64 KiB.

The client does not set the price. Submitted prices or totals are ignored. The order service calls `GET /inventory-management/inventory/items/{id}` once for each line item, checks stock, then posts the card to the payment service. It rechecks the current database rows in the save transaction and calculates the receipt using integer cents. The saved order stores the payment token, not the card.

Success returns HTTP **201**, for example:

```json
{
  "orderId": 1,
  "confirmationNumber": "AB-00000001",
  "status": "New",
  "items": [
    {
      "id": "camp-bottle",
      "name": "Camp Insulated Bottle",
      "image": "/images/bottle.svg",
      "color": "Ochre · 750 ml",
      "priceCents": 2900,
      "quantity": 1,
      "lineTotalCents": 2900
    }
  ],
  "totals": { "itemCount": 1, "subtotalCents": 2900, "totalCents": 2900 }
}
```

The number above is illustrative. The confirmation is derived from the committed database order ID (hexadecimal, padded to eight characters). The supplied two-daypack/one-bottle example returns a total of 20700 cents. No payment or shipping information appears in the response.

## Errors

Errors use `{ "error": { "code": "...", "message": "..." } }`.

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON` | The body is not valid JSON |
| 400 | `INVALID_ORDER` | Items, quantities, or payment/address fields are invalid |
| 400 | `INVALID_ID` | An item path contains invalid URL encoding |
| 404 | `ITEM_NOT_FOUND` / `NOT_FOUND` | An item ID or route does not exist |
| 405 | `METHOD_NOT_ALLOWED` | A known endpoint was called using the wrong HTTP method |
| 409 | `INSUFFICIENT_STOCK` | One or more requested quantities exceed current stock |
| 413 | `PAYLOAD_TOO_LARGE` | Body exceeds 64 KiB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | An order was not sent as `application/json` |
| 503 | `DATABASE_UNAVAILABLE` | The database could not complete a read or order transaction |
| 503 | `INVENTORY_UNAVAILABLE` | Inventory failed, timed out, or returned invalid data |

A shortage response includes all unavailable lines:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Some items do not have enough stock. Adjust your bag and try again.",
    "items": [
      { "productId": "ridge-daypack", "name": "Ridge 28L Daypack", "requestedQuantity": 13, "availableQuantity": 12 }
    ]
  }
}
```

The browser uses these quantities to offer a correction. Error responses do not include a confirmation number and do not clear checkout details. Validation and stock errors insert no rows. A failed database write rolls back its transaction. If the connection is lost during/after commit, the client may not know whether the order was saved; retrying can create another order. Payment/shipping format failures also include `error.fields.payment` and `error.fields.shipping`.

## Service behavior

- `GET /health` exists on each **local** service for a quick status check.
- The order service allows 5 seconds per inventory/payment HTTP call; the browser waits up to 10 seconds for an API response.
- Responses have `Cache-Control: no-store`. CORS and `OPTIONS` support allow calls from a separately hosted frontend.
- Successful orders persist a header, item lines, shipping details, and an outbox event in one store transaction. The card is stored, masked, only in the payment database; the store keeps `PAYMENT_CONFIRMATION_TOKEN`. CVV is never stored. Request bodies are not logged. There is no public order-read endpoint. API Gateway data tracing is not enabled.
- A publisher sends committed outbox events to EventBridge. Its rule routes them to SNS, which invokes the shipping Lambda. Checkout never calls `/shipping`. Local development uses a separate subscriber and a file-based simulation.
- This checks stock without reserving/decrementing it or charging cards. Disabling duplicate browser submissions prevents extra clicks during one pending request; whole-order retries have no durable idempotency key. Shipping request IDs do provide idempotency.

## Payment API

`POST http://127.0.0.1:3003/payment` accepts the `payment` object from `examples/order.json` directly (not wrapped in another `payment` property):

```json
{
  "cardHolderName": "Alex Taylor",
  "cardNumber": "4242 4242 4242 4242",
  "expirationDate": "12/35",
  "cvvCode": "123"
}
```

Success is `201` with `{ "confirmationToken": "PAY-0123456789ABCDEF0123456789ABCDEF" }`. The 32 hexadecimal digits are random; the example is illustrative. Invalid fields return `400`, and database failures return `503`.

## Shipping API and event

`POST http://127.0.0.1:3004/shipping`:

```json
{
  "requestId": "demo-shipment-001",
  "businessId": "AB-STORE-1001",
  "address": {
    "name": "Alex Taylor",
    "email": "alex@example.com",
    "country": "US",
    "addressLine1": "123 Trailhead Lane",
    "addressLine2": "",
    "city": "Columbus",
    "state": "OH",
    "zip": "43210"
  },
  "packetCount": 2,
  "packetWeightsPounds": [2, 1]
}
```

Success is `201` with `{ "confirmationToken": "SHP-0123456789ABCDEF0123456789ABCDEF" }`. `requestId` is optional for direct HTTP calls; omitting it creates a new request. Reusing it with the same normalized shipment returns the original token. Reusing it with different content returns `409 SHIPMENT_CONFLICT`. It is required for asynchronous events.

Packet count must be an integer from 1 to 100. The weights array must have exactly that many positive numbers, each at most 1000 lb with up to two decimal places. Invalid input returns `400`; database failure returns `503`. Business/request IDs use 1–64 letters, digits, or hyphens.

The EventBridge envelope has `source: "adventure-beyond.orders"`, `detail-type: "ShipmentRequested"`, and `detail` containing the shipment above plus `schemaVersion: 1` and `orderId`. The rule also checks `schemaVersion`. SNS delivers the envelope as JSON text in each `Records[].Sns.Message`.

The Lambda validates the source/type/schema and configured topic ARN, then calls the same shipping repository as the HTTP route. It throws on consumer failure so AWS can retry. Neither the event nor the order response contains payment details.
