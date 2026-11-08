# Adventure Beyond

Adventure Beyond is our three-person group's outdoor gear store for **CSE 5234 Labs 5–8**. Lab 5 added shopping and checkout; Lab 6 added the company pages; Lab 7 added inventory and order microservices.

**Lab 8 adds a MySQL database.** The inventory service reads products from the database. The order service checks stock, saves the order and its related records, and then returns a confirmation number. Orders remain after restarting the application or the local database.

This is a classroom demo. Use the sample customer and payment details below. It does not charge cards, ship products, or send emails.

**Lab 8 RDS deployment was verified on November 1, 2026.** The group's `school` account has an RDS MySQL database in `us-east-1`; the local website and microservices read and write that database. Desktop and phone orders were matched to saved SQL records. See [the verification record and screenshots](docs/LAB8-VERIFICATION.md) and [the RDS setup guide](docs/RDS-LOCAL.md). The steps below use a separate local Docker database so every teammate can develop without AWS access.

## 1. Install and start

You need **Node.js 22.12 or later**, npm, Git, and **Docker Desktop**. Node 20.19+ also works. Open Docker Desktop and wait until its engine is running.

For a fresh download:

```sh
git clone --branch ht-lab5 --single-branch https://github.com/ojasvsingh/CSE5234-Lab5.git adventure-beyond
cd adventure-beyond
npm ci
npm run db:up
npm run db:init
npm run dev
```

If you already have the project:

```sh
git switch ht-lab5
git pull --ff-only origin ht-lab5
npm ci
npm run db:up
npm run db:init
npm run dev
```

Save or commit your own edits before pulling. If Git reports a conflict, resolve it with the group instead of discarding anyone's work.

Open **http://127.0.0.1:5173/**. Keep the last terminal running.

| Command | What it does |
| --- | --- |
| `npm ci` | Installs the website packages and the backend's MySQL driver from their lockfiles |
| `npm run db:up` | Starts a local MySQL 8.4 container and waits until it is ready; the first run downloads MySQL |
| `npm run db:init` | Creates the five tables and inserts missing sample products; preserves existing data |
| `npm run dev` | Starts the website and both microservices |
| `npm run db:inspect` | Shows products and the latest saved orders in another terminal |
| `npm run db:stop` | Stops the local database without deleting its data |

Press **Ctrl+C** to stop the website and services. The database runs separately. Next time, use `npm run db:up` and `npm run dev`. You do not need to seed it every time.

| Component | Local address | Purpose |
| --- | --- | --- |
| Website | `http://127.0.0.1:5173` | The pages you see |
| Inventory service | `http://127.0.0.1:3001` | Reads product details, prices, and available quantities |
| Order service | `http://127.0.0.1:3002` | Checks and saves orders |
| MySQL | `127.0.0.1:33306` | Stores the five tables; this is not a browser URL |

Local development requires no AWS account or `.env` file. The defaults in [compose.yaml](compose.yaml) match the backend. MySQL data lives in the Docker volume `adventure-beyond_mysql-data`. Stopping or restarting the container preserves it. Removing that volume deletes the data.

To change local connection settings, copy [.env.example](.env.example) to `.env` and edit its `DB_` values. The backend reads `.env`; Vite also reads its public `VITE_` values. Never put a database password in a variable starting with `VITE_`. Docker's database/user/password settings initialize a **new** volume only; changing `.env` does not change an existing MySQL user's password.

## 2. Understand Lab 8

An **API** lets programs exchange requests and responses. A **microservice** is a separate backend program with one responsibility. A **database table** stores related records, such as products or orders.

1. The website requests products from the inventory service.
2. The inventory service runs a SQL query against `ITEM` and returns JSON. Neither service contains a fallback product list.
3. The customer enters payment and shipping details, including an email address, and submits the order.
4. The order service validates the fields and calls the inventory service once per line item.
5. It posts the card to the separate payment service. Inside one database **transaction**, it rechecks the current items, saves the ship-to address, saves the order header with the payment token, and saves its item lines. The card stays in the payment database. A transaction means these store writes succeed together or are rolled back together.
6. Only after a successful commit does the service return `201`, the saved order ID, an `AB-XXXXXXXX` confirmation, and the receipt. The website then clears the bag.

| Table | What it stores |
| --- | --- |
| `ITEM` | Five initial products, prices, quantities, and display information |
| `CUSTOMER_ORDER` | Customer name/email, ship-to link, payment token, and status `New` |
| `CUSTOMER_ORDER_LINE_ITEM` | Each purchased item, requested quantity, and its name/price at purchase time |
| `PAYMENT_INFO` | Cardholder name, masked card number, and expiration date |
| `SHIPPING_INFO` | Address, country, and email |

Every table has a database-generated, auto-incrementing `ID`. Foreign keys connect the records. Payment and shipping tables do **not** contain an order ID. The order header points to them, as the assignment describes. The line-item table points to its order and inventory item.

The starter scripts use both `ITEM_ID` and `ITEM_NUMBER`; our line items include both. A separate `SLUG`, such as `ridge-daypack`, keeps the existing API URLs working. Prices use SQL `DECIMAL(10,2)` and integer cents in JSON, avoiding floating-point rounding. The confirmation uses the saved order ID in hexadecimal, padded to eight characters.

The course's sample payment table includes a CVV column. This implementation leaves it `NULL` and saves only the card number's last four digits with a mask. CVV is validated for checkout but never stored. Use fictional customer details because names, email addresses, and shipping addresses **are** saved for Lab 8.

This remains a stock-check demo: placing an order does **not** reserve or decrement stock. Durable idempotency, bank processing, account login, and order-history pages are outside the lab. If a response is lost after a commit, retrying can create another order; the browser only prevents duplicate clicks while a request is pending.

## 3. Demonstrate an order and its saved records

1. Open **Shop gear** and add **2 Ridge 28L Daypacks** and **1 Camp Insulated Bottle**.
2. Open the bag. The seeded prices give a total of **$207.00** (`2 × $89 + $29`).
3. Continue to payment and use the sample values below.
4. Enter the shipping details. The demo supports US addresses.
5. Review the order, check the confirmation checkbox, and click **Place demo order**.
6. Note the confirmation number. Refreshing keeps the receipt visible.
7. In a second terminal, run `npm run db:inspect`. Find the same confirmation with status `New`, two item lines, and total `207.00`.
8. Stop the app, run `npm run db:stop`, then `npm run db:up` and `npm run db:inspect`. The order is still present.

| Field | Sample value |
| --- | --- |
| Cardholder / full name | Alex Taylor |
| Card number | 4242 4242 4242 4242 |
| Expiration date | 12/35, or another future MM/YY date |
| CVV | 123 |
| Email address | alex@example.com |
| Address line 1 | 123 Trailhead Lane |
| Address line 2 | Leave blank, or Apt 5 |
| City | Columbus |
| State | Ohio |
| ZIP code | 43210 |

To demonstrate insufficient stock, request **13 daypacks** when the database contains 12. Submission returns `409 INSUFFICIENT_STOCK`; no order is inserted. Click **Use available quantities**, review again, and submit 12. The bag permits quantities up to 99 so this error can be demonstrated.

To demonstrate a database outage, stop the database while on the review page, then submit. The request fails and the bag/form remain. Restart it to retry. The application never substitutes sample data when the database is down.

For SQL examples, manual inserts, and a full requirement checklist, see [docs/DATABASE.md](docs/DATABASE.md). The provided course TXT mixes `CREATE TABLE` and `DROP TABLE` examples: do not run that entire file as a setup script.

## 4. APIs and pages

| API | Result |
| --- | --- |
| `GET /inventory-management/inventory` | All database products |
| `GET /inventory-management/inventory/items/{id}` | Product matching its slug |
| `GET /inventory-management/inventory/items?name=itemName` | Case-insensitive name search |
| `POST /order-processing/order` | Checks each item, pays, saves the order, and returns its confirmation |
| `POST /payment` | Payment service, port 3003. Saves the card in its own database and returns a `PAY-` token |
| `POST /shipping` | Shipping service, port 3004. Saves a shipment in its own database and returns a `SHP-` token |

Name and `id` query parameters can be combined. Full JSON examples and errors are in [docs/API.md](docs/API.md).

Lab 9, without AWS: an order calls inventory once per line item, then `POST /payment`. The store database saves the payment token and the ship-to address, not the card. It also builds a shipment message (one packet per line item, 1.0 lb each) for EventBridge later. Checkout does not call `/shipping` directly. Run `npm run db:init` once so `adventure_payment`, `adventure_shipping`, and the order token column exist.

| Page | Address |
| --- | --- |
| Home | `/` |
| About Us and all three executives | `/about` |
| Contact Us, support policies, and FAQ | `/contact` |
| Shop | `/purchase` |
| Payment | `/purchase/paymentEntry` |
| Shipping | `/purchase/shippingEntry` |
| Review | `/purchase/viewOrder` |
| Confirmation | `/purchase/viewConfirmation` |

All pages share the navigation, footer, and bag, with phone layouts. The Contact Us form still creates a local preview only. Team profiles are in `src/data/company.js`; preserve teammates' entries when editing.

## 5. Find the code

| Change or understand | File |
| --- | --- |
| Tables and constraints | [database/001-schema.sql](database/001-schema.sql) |
| Initial product data | [database/002-seed.sql](database/002-seed.sql) |
| Manual insert example | [database/003-manual-check.sql](database/003-manual-check.sql) |
| MySQL connections and TLS | [services/database/pool.js](services/database/pool.js) |
| Inventory SQL queries | [services/database/items.js](services/database/items.js) |
| Order transaction | [services/database/orders.js](services/database/orders.js) |
| Inventory API | [services/inventory/handler.js](services/inventory/handler.js) |
| Order API, per-item inventory calls, and payment call | [services/orders/handler.js](services/orders/handler.js) |
| Payment API and its database | [services/payment/handler.js](services/payment/handler.js), [database/payment/001-schema.sql](database/payment/001-schema.sql) |
| Shipping API and its database | [services/shipping/handler.js](services/shipping/handler.js), [database/shipping/001-schema.sql](database/shipping/001-schema.sql) |
| Input validation | [services/shared/validation.js](services/shared/validation.js) |
| Browser API calls | [src/lib/api.js](src/lib/api.js) |
| Shopping/checkout state | [src/context/ShopContext.jsx](src/context/ShopContext.jsx) |
| Pages and styling | [src/pages](src/pages), [src/styles.css](src/styles.css), [src/site.css](src/site.css) |
| Local database and startup | [compose.yaml](compose.yaml), [scripts/dev.mjs](scripts/dev.mjs) |
| Local services connected to RDS | [infra/rds-local-access.yaml](infra/rds-local-access.yaml), [scripts/rds.mjs](scripts/rds.mjs), [docs/RDS-LOCAL.md](docs/RDS-LOCAL.md) |
| Optional AWS-hosted services | [infra/rds.yaml](infra/rds.yaml), [template.yaml](template.yaml), [docs/AWS.md](docs/AWS.md) |

Edit live products with SQL, then refresh the browser. Editing the seed file does not overwrite existing rows. Backend code changes require restarting `npm run dev`.

The browser stores cart IDs/quantities and the latest receipt in the current tab's `sessionStorage`. Unsubmitted payment and shipping fields stay in memory. Submitted orders live in MySQL. The receipt does not include customer or payment details, and there is no public API for reading stored customer records.

## 6. Run the checks

Start the separate, disposable test database first:

```sh
npm run db:test:up
npm test
npx playwright install chromium
npm run test:e2e
```

Tests use MySQL on **127.0.0.1:33307** with the database `adventure_beyond_test`. They do not inherit development or RDS connection settings. Run the API and browser suites one after the other, because both use this test database. Its storage is temporary and disappears when its container stops; your development database is separate.

The checks cover real SQL reads/writes, transaction rollback, saved price snapshots, missing stock, invalid email, unavailable services, and desktop/mobile checkout. The recorded results and screenshots are in [docs/LAB8-VERIFICATION.md](docs/LAB8-VERIFICATION.md). Browser tests start their own app servers on **4173, 4311, and 4312**, leaving normal development servers alone. `npm run test:unit` runs the pure unit tests without MySQL.

To stop only the test database:

```sh
docker compose --profile test stop test-db
```

To preview the production build locally, stop the development app first, leave MySQL running, and run:

```sh
npm run build
npm run preview:all
```

Open `http://127.0.0.1:4173`. These commands do not deploy to AWS.

## 7. AWS and common problems

Lab 8 explicitly requires **Amazon RDS**. [docs/RDS-LOCAL.md](docs/RDS-LOCAL.md) explains how to run this website and its two services on your computer while using an RDS database. This is the simplest cloud demonstration for Lab 8.

After the authorized RDS setup has saved a private `.env.rds`, stop the regular app and use:

```sh
npm run dev:rds
```

Open the same `http://127.0.0.1:5173` address. In another terminal, `npm run rds:inspect` reads saved cloud orders, and `npm run rds:manual` runs the manual SQL example. These administration commands need an active AWS login. To return to local MySQL, stop the app and use `npm run db:up` followed by `npm run dev`.

**Do not copy `.env.rds` into Git or group messages.** Each teammate needs authorized credentials and network access. [docs/AWS.md](docs/AWS.md) covers the separate option of hosting the microservices in AWS too. Resource creation can incur charges; stopping the website does not stop RDS. See the RDS guide for stopping and cleanup.

| Problem | What to do |
| --- | --- |
| Docker daemon is unavailable | Open Docker Desktop and wait for it to finish starting |
| Database is unavailable | Run `npm run db:up`, then `npm run db:init`; check your `.env` values |
| Access denied after changing passwords | Existing MySQL accounts keep their old passwords; restore the matching setting or change the user with SQL |
| Cannot load products | Check the database and inventory service; the page offers a retry |
| Cannot place an order | Read the shown error; check inventory and database, or correct shipping/payment fields |
| Port already in use | Stop the older process on that port; defaults are listed above |
| `package.json` not found | Enter the project folder before running npm commands |
| Refresh returns to payment | Expected: unsubmitted payment/shipping fields are only in memory |
| Test database unavailable | Run `npm run db:test:up`; tests use port 33307, not the development database |
| Browser missing | Run `npx playwright install chromium` |
| Seed changes do not appear | Setup preserves existing products; update the database row explicitly |
| AWS API cannot reach RDS | Check its VPC/subnets/security groups, credentials, and TLS; see the AWS guide |
| Local app cannot reach RDS | Check that RDS is available, `.env.rds` matches, and its security group allows your current public IP |
| RDS inspection fails after SSO expires | Run `aws sso login --profile school`, then retry `npm run rds:inspect` |
