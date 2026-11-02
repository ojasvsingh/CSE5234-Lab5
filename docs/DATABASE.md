# Lab 8 database guide

Lab 8 replaces the hardcoded inventory with MySQL and saves customer orders. Start the database and application using the root README. These examples use the included local database; use fictional data. For the verified RDS deployment, use [RDS-LOCAL.md](RDS-LOCAL.md); `npm run rds:inspect` and `npm run rds:manual` perform the equivalent cloud checks.

## Inspect the data

The simplest option is:

```sh
npm run db:inspect
```

For interactive SQL, open a MySQL prompt inside the running container:

```sh
docker compose exec db mysql -u adventure -p adventure_beyond
```

Enter `local-demo-password` at the password prompt. If you changed `.env`, use your database/user/password instead. MySQL Workbench or another database client can also connect to `127.0.0.1`, port `33306`, with those credentials.

```sql
SHOW TABLES;
SELECT ID, ITEM_NUMBER, SLUG, NAME, AVAILABLE_QUANTITY, UNIT_PRICE FROM ITEM;
SELECT ID, CUSTOMER_NAME, CUSTOMER_EMAIL, STATUS,
       SHIPPING_INFO_ID_FK, PAYMENT_INFO_ID_FK
FROM CUSTOMER_ORDER ORDER BY ID DESC;
```

Find the order whose confirmation appeared in the browser:

```sql
SELECT ID, CONCAT('AB-', LPAD(HEX(ID), 8, '0')) AS CONFIRMATION, STATUS
FROM CUSTOMER_ORDER ORDER BY ID DESC;
```

Inspect its lines (replace `1` with that order's ID):

```sql
SELECT ITEM_ID, ITEM_NUMBER, ITEM_NAME, QUANTITY, UNIT_PRICE,
       QUANTITY * UNIT_PRICE AS LINE_TOTAL
FROM CUSTOMER_ORDER_LINE_ITEM
WHERE CUSTOMER_ORDER_ID_FK = 1;
```

The line stores the **requested quantity**, not `ITEM.AVAILABLE_QUANTITY`. The database generates the line's own `ID`; it is not copied from the product. Stored names and prices are snapshots, so changing a product later does not rewrite an old receipt.

## Change inventory to demonstrate a live SQL read

```sql
UPDATE ITEM SET AVAILABLE_QUANTITY = 3, UNIT_PRICE = 31.29
WHERE SLUG = 'camp-bottle';
```

Refresh the shop. The bottle now shows quantity 3 and price $31.29, without restarting either service. To restore the sample values:

```sql
UPDATE ITEM SET AVAILABLE_QUANTITY = 30, UNIT_PRICE = 29.00
WHERE SLUG = 'camp-bottle';
```

`database/002-seed.sql` inserts missing products and deliberately preserves existing rows. It is not a reset command.

## Test manual inserts

The assignment also asks for manual table inserts. Open [database/003-manual-check.sql](../database/003-manual-check.sql), copy its contents into the same MySQL session, and run it. It inserts a payment, an address, an order, and one line using IDs returned by `LAST_INSERT_ID()`. The final query should show:

- Status `New`, supplied by the table default.
- Two daypacks at $89.00 each and line total $178.00, if seed prices are unchanged.
- Country `US`, masked card `****4242`, and CVV `NULL`.

The script finishes with `ROLLBACK`, so it tests the relationships without leaving a demo order behind. Auto-increment IDs can still have gaps after rollback; that is expected. For a permanently saved order, use the website.

The course TXT includes both create and drop examples. Our setup scripts never run its drop statements. There is deliberately no automatic command to erase the development database.

## How the transaction works

`services/orders/handler.js` validates the JSON and calls inventory over HTTP. `services/database/orders.js` then opens a database transaction and reads the requested `ITEM` rows with shared locks. This rechecks stock and uses the current database prices even if an inventory row changed after the HTTP call.

The transaction inserts `PAYMENT_INFO`, `SHIPPING_INFO`, `CUSTOMER_ORDER`, and `CUSTOMER_ORDER_LINE_ITEM`. A failure rolls back earlier writes; a successful commit allows the API to return `201`. Foreign keys reject unrelated record IDs. Queries bind user data as parameters rather than inserting it into SQL text.

Stock is checked, not decremented or reserved. A network failure after a commit can leave a saved order whose response did not reach the browser. There is no durable retry key in this lab, so a second submission may create another order. Database transactions protect the group of SQL writes; they do not make the network response atomic.

## Differences from the sample schema

| Sample / requirement | Implementation |
| --- | --- |
| Five tables and auto-increment IDs | All five are present with generated IDs |
| `STATUS` default `New` | Set by the database, omitted from the INSERT |
| `ITEM_ID` in the document, `ITEM_NUMBER` in the TXT | Both stored on the line; `ITEM_ID` is a foreign key |
| `UNIT_PRICE double` | `DECIMAL(10,2)` for exact money; JSON uses integer cents |
| Product pictures and categories from earlier labs | Extra columns on `ITEM`, read from the same database |
| Payment fields | Name, masked card, expiry; CVV column remains NULL by constraint |
| Order-to-payment/shipping relationship | Foreign keys are on `CUSTOMER_ORDER`, not on payment/shipping |
| At least five warehouse items | Five initial rows in the SQL seed |

## Requirement and evidence checklist

| Lab 8 objective | Where to demonstrate it |
| --- | --- |
| Create a relational database using AWS RDS | Deployed and verified on November 1, 2026; see [RDS evidence](LAB8-VERIFICATION.md#live-rds-verification) |
| Create and populate warehouse schema | `001-schema.sql`, `002-seed.sql`, and `npm run db:inspect` |
| Remove hardcoded microservice inventory | `services/database/items.js`; change a row and refresh the shop |
| Store orders and related records | Submit an order, then query all four related tables |
| Verify inserts manually | Run `003-manual-check.sql` in MySQL |
| Preserve data across restart | Restart the development database and inspect the same confirmation |

The API tests run against a separate real MySQL container. They also simulate failure on the second line insert and confirm that no order, shipping, payment, or earlier line remains. Browser tests look up their newly created order in SQL and compare it with the displayed confirmation and total.
