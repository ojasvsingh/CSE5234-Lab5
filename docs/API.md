# Lab 7 API guide

Run `npm run dev` from the project root before trying these commands. Inventory listens on port 3001 and orders on port 3002. When using AWS, replace each local base URL with the matching deployed invoke URL, including its `/dev` stage.

## Inventory

```sh
curl http://127.0.0.1:3001/inventory-management/inventory
curl http://127.0.0.1:3001/inventory-management/inventory/items/ridge-daypack
curl 'http://127.0.0.1:3001/inventory-management/inventory/items?name=Insulated%20Bottle'
curl 'http://127.0.0.1:3001/inventory-management/inventory/items?id=camp-bottle&name=bottle'
```

The collection and search endpoints return `200` with `{ "items": [...] }`. The ID endpoint returns `{ "item": {...} }`, or `404 ITEM_NOT_FOUND`. A search with no matches returns an empty array. Name matching is case-insensitive substring matching; when `id` and `name` are both supplied, both conditions must match. An omitted/empty filter returns all matching items.

Each item has `id`, `name`, `category`, `description`, `priceCents`, `image`, `color`, `tag`, and `availableQuantity`. A `featured: true` flag selects homepage recommendations. Image paths refer to assets hosted with the frontend.

Sample warehouse quantities are 12 daypacks, 8 tents, 20 jackets, 15 pairs of poles, and 30 bottles. They live only in [the inventory catalogue](../services/inventory/catalogue.js). No endpoint in this lab changes stock.

## Submit an order

From the project root:

```sh
curl -i http://127.0.0.1:3002/order-processing/order \
  -H 'Content-Type: application/json' \
  --data-binary @examples/order.json
```

[The sample JSON file](../examples/order.json) contains item IDs and quantities, payment information, and a shipping address. It uses sample details; keep the expiration date in the future. In Windows PowerShell, use `curl.exe` and put the command on one line if needed.

The service requires 1–100 item lines. Each quantity must be an integer from 1 to 99. Duplicate product IDs are combined before checking stock, and their combined quantity cannot exceed 99. Unknown IDs are reported as unavailable. Payment and shipping fields are checked on the server even if the browser already validated them. Address line 2 is optional. Each text field is limited to 200 characters; request bodies are limited to 64 KiB.

The client does not set the price. Submitted prices or totals are ignored. The order service calls the inventory service over HTTP, obtains prices and stock, and calculates the receipt using integer cents.

Success returns HTTP **201**, for example:

```json
{
  "confirmationNumber": "AB-1234ABCD",
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

The number above is illustrative; each successful request gets a generated number. The supplied two-daypack/one-bottle example returns a total of 20700 cents. No payment or shipping information appears in the response.

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

The browser uses these quantities to offer a correction. Failed requests never receive a confirmation number and do not clear checkout details. Payment/shipping format failures also include `error.fields.payment` and `error.fields.shipping`.

## Service behavior

- `GET /health` exists on each **local** service for a quick status check.
- The order service waits up to 5 seconds for inventory; the browser waits up to 10 seconds for an API response.
- Responses have `Cache-Control: no-store`. CORS and `OPTIONS` support allow calls from a separately hosted frontend.
- The services do not log request bodies or store orders, card details, or addresses. API Gateway data tracing is not enabled by the deployment template.
- This is a stock-check demonstration. It does not reserve/decrement stock, provide durable idempotency, charge cards, or persist orders. Disabling duplicate browser submissions prevents extra clicks during one pending request; it is not a distributed transaction system.
