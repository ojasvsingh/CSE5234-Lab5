# Adventure Beyond

Adventure Beyond is our three-person group's outdoor gear store for **CSE 5234 Labs 5–9**. Earlier labs added the website, company pages, inventory/order services, and MySQL storage.

**Lab 9 connects the services.** An order checks inventory and asks a separate payment service for a payment token. It then saves the order and a shipping message together. A background worker sends the message to a separate shipping service. The customer does not wait for shipping to finish.

This is a classroom demo. Use the sample customer and payment details below. It does not charge cards, ship products, or send emails.

**Local Lab 9 is implemented and tested. AWS deployment is pending renewed school-account login.** The local event transport is a development simulation; it does not satisfy the assignment's AWS EventBridge/SNS requirement by itself. The AWS templates and deployment commands are ready in [the Lab 9 guide](docs/LAB9.md). See [current checks and screenshots](docs/LAB9-VERIFICATION.md). The [November 1 Lab 8 RDS evidence](docs/LAB8-VERIFICATION.md) records that earlier deployment, not Lab 9 deployment.

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
| `npm ci` | Installs the website, MySQL driver, and AWS SDK from their lockfiles |
| `npm run db:up` | Starts a local MySQL 8.4 container and waits until it is ready; the first run downloads MySQL |
| `npm run db:init` | Creates/migrates the store, payment, and shipping databases; preserves existing data |
| `npm run dev` | Starts the website, four services, and two background workers |
| `npm run lab9:inspect` | Shows saved orders, payment tokens, shipping messages, and shipments |
| `npm run db:inspect` | Shows products and the latest saved orders in another terminal |
| `npm run db:stop` | Stops the local database without deleting its data |

Press **Ctrl+C** to stop the website and services. The database runs separately. Next time, use `npm run db:up` and `npm run dev`. You do not need to seed it every time.

| Component | Local address | Purpose |
| --- | --- | --- |
| Website | `http://127.0.0.1:5173` | The pages you see |
| Inventory service | `http://127.0.0.1:3001` | Reads product details, prices, and available quantities |
| Order service | `http://127.0.0.1:3002` | Checks and saves orders |
| Payment service | `http://127.0.0.1:3003/payment` | Saves a demo payment and returns a token |
| Shipping service | `http://127.0.0.1:3004/shipping` | Accepts shipment requests and returns a token |
| MySQL | `127.0.0.1:33306` | Hosts three separate databases; this is not a browser URL |

Local development requires no AWS account or `.env` file. The defaults in [compose.yaml](compose.yaml) match the backend. MySQL data lives in the Docker volume `adventure-beyond_mysql-data`. Stopping or restarting the container preserves it. Removing that volume deletes the data.

To change local connection settings, copy [.env.example](.env.example) to `.env` and edit its `DB_` values. The backend reads `.env`; Vite also reads its public `VITE_` values. Never put a database password in a variable starting with `VITE_`. Docker's database/user/password settings initialize a **new** volume only; changing `.env` does not change an existing MySQL user's password.

## 2. Understand Lab 9

An **API** lets programs exchange requests and responses. A **microservice** is a separate backend program with one responsibility. A **database table** stores related records, such as products or orders.

1. The website requests products from the inventory service.
2. The inventory service runs a SQL query against `ITEM` and returns JSON. Neither service contains a fallback product list.
3. The customer enters payment and shipping details, including an email address, and submits the order.
4. The order service validates the fields and calls the inventory service once per line item.
5. It posts the payment details to the payment service, which saves a masked card record in its own database and returns a `PAY-` token.
6. In one database **transaction**, the order service rechecks stock and saves the ship-to address, order header with the payment token, item lines, and a pending shipping message. A transaction means these store writes succeed together or roll back together.
7. After the transaction commits, it returns `201` and an `AB-XXXXXXXX` confirmation. The website clears the bag.
8. A separate worker reads pending messages. In AWS mode, it publishes to **EventBridge → SNS → shipping Lambda**. The shipping service saves a shipment in its own database and generates an `SHP-` token. In local mode, ignored files and a separate subscriber process simulate that transport.

| Database | Tables and responsibility |
| --- | --- |
| `adventure_beyond` | `ITEM`, `CUSTOMER_ORDER`, `CUSTOMER_ORDER_LINE_ITEM`, `SHIPPING_INFO`, `SHIPMENT_OUTBOX`: the storefront |
| `adventure_payment` | `PAYMENT_INFO`: masked payment details and the payment token |
| `adventure_shipping` | `SHIPMENT`: address, business ID, packet weights, request ID, and shipment token |

Payment and shipping have separate database users that cannot read the storefront or each other's tables. The classroom setup hosts these logical databases on one MySQL server; it does not create three RDS instances. AWS payment and shipping run as separate Lambda functions with separate credentials. There are no cross-database joins or foreign keys in their application logic.

The old storefront `PAYMENT_INFO` table and nullable `PAYMENT_INFO_ID_FK` remain so Lab 8 records are preserved. **New Lab 9 orders leave that foreign key empty and store only `PAYMENT_CONFIRMATION_TOKEN`.** No new card records are written to the storefront.

Each distinct item line becomes **one packet**, regardless of quantity. We assume **1 lb per unit**, so 2 daypacks + 1 bottle means **2 packets weighing [2, 1] lb**, not 3 packets. The handout's 1 lb suggestion conflicts with its 20 lb example; our assumption is explicit in [the requirement checklist](docs/LAB9.md).

`SHIPMENT_OUTBOX` is the pending-message table. If publishing fails, the order stays confirmed and the worker retries after 30 seconds. Duplicate messages keep the same request ID, so shipping creates only one row. The order service never calls the shipping HTTP endpoint directly.

The starter scripts use both `ITEM_ID` and `ITEM_NUMBER`; our line items include both. A separate `SLUG`, such as `ridge-daypack`, keeps the existing API URLs working. Prices use SQL `DECIMAL(10,2)` and integer cents in JSON, avoiding floating-point rounding. The confirmation uses the saved order ID in hexadecimal, padded to eight characters.

The course's sample payment table includes a CVV column. This implementation leaves it `NULL` and saves only the card number's last four digits with a mask. CVV is validated for checkout but never stored. Use fictional customer details because names, email addresses, and shipping addresses **are** saved for Lab 8.

This remains a stock-check demo: placing an order does **not** reserve or decrement stock. Shipping handles repeated messages, but the whole checkout is not idempotent: retrying after a lost order response can create another order/payment. If payment succeeds and the store transaction fails, the demo payment record remains; automatic refunds and distributed transactions are outside this implementation. No real bank or carrier is contacted.

## 3. Demonstrate an order and its saved records

1. Open **Shop gear** and add **2 Ridge 28L Daypacks** and **1 Camp Insulated Bottle**.
2. Open the bag. The seeded prices give a total of **$207.00** (`2 × $89 + $29`).
3. Continue to payment and use the sample values below.
4. Enter the shipping details. The demo supports US addresses.
5. Review the order, check the confirmation checkbox, and click **Place demo order**.
6. Note the confirmation number. Refreshing keeps the receipt visible.
7. In a second terminal, run `npm run lab9:inspect`. Match the order's payment token to its payment row, and its event ID to the shipment's request ID. Within a few seconds the message is published and a shipment appears with 2 packets and weights `[2, 1]`.
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
| `POST /payment` | Payment service, port 3003. Saves masked payment details in its own database and returns a `PAY-` token |
| `POST /shipping` | Shipping service, port 3004. Saves a shipment in its own database and returns a `SHP-` token |

Name and `id` query parameters can be combined. Full JSON examples and errors are in [docs/API.md](docs/API.md).

Both partner tokens contain 32 random hexadecimal characters after their prefix. The shipping API accepts `packetWeightsPounds`, an array with one weight per packet. [API.md](docs/API.md) includes a copyable request.

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
| Pending messages and retry | [database/004-lab9-outbox.sql](database/004-lab9-outbox.sql), [services/database/outbox.js](services/database/outbox.js) |
| EventBridge publisher / local transport | [services/events/publisher.js](services/events/publisher.js) |
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
| Lab 9 AWS partners and routing | [infra/lab9.yaml](infra/lab9.yaml), [scripts/lab9.mjs](scripts/lab9.mjs), [docs/LAB9.md](docs/LAB9.md) |

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

Tests use MySQL on **127.0.0.1:33307** with three databases ending in `_test`. They do not inherit development or RDS connection settings. Run the API and browser suites one after the other, because both use these test databases. Their storage is temporary and disappears when the container stops; your development database is separate.

The checks cover SQL writes, rollback, missing stock, unavailable services, database account isolation, failed event publishing, duplicate SNS events, and desktop/mobile checkout. Results and screenshots are in [docs/LAB9-VERIFICATION.md](docs/LAB9-VERIFICATION.md). Browser tests start their own servers on **4173 and 4311–4314**, leaving normal development servers alone. `npm run test:unit` runs unit tests without MySQL.

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

Lab 9 explicitly requires **EventBridge and SNS** for shipping. The supplied deployment reuses the group's Lab 8 RDS instance and runs payment/shipping in AWS. The website, inventory/order services, and order publishing worker run on your laptop. Follow [docs/LAB9.md](docs/LAB9.md) for network checks, deployment, evidence, and cleanup.

Once school login and RDS access are ready, the cloud workflow is:

```sh
npm run lab9:setup
npm run lab9:deploy
npm run dev:aws
```

`lab9:setup` creates two logical databases and restricted users, preserving existing store data. `lab9:deploy` creates cloud resources and can incur charges. It is restricted to the group's `school` account. `dev:aws` uses the same website address and keeps the event publisher running. In another terminal, use `npm run lab9:inspect:aws` or `npm run lab9:capture:aws`. To return to local MySQL, stop the app and run `npm run db:up` and `npm run dev`.

**Do not copy `.env.lab9`, `.env.rds`, or `.lab9-build` into Git or group messages.** Each teammate needs authorized credentials and network access. Stopping the website stops its publisher but does not stop RDS or remove AWS resources. [docs/AWS.md](docs/AWS.md) covers the separate option of hosting inventory/order and a scheduled publisher in AWS too; that option needs additional network egress.

| Problem | What to do |
| --- | --- |
| Docker daemon is unavailable | Open Docker Desktop and wait for it to finish starting |
| Database is unavailable | Run `npm run db:up`, then `npm run db:init`; check your `.env` values |
| Access denied after changing passwords | Existing MySQL accounts keep their old passwords; restore the matching setting or change the user with SQL |
| Cannot load products | Check the database and inventory service; the page offers a retry |
| Cannot place an order | Read the shown error; check inventory and database, or correct shipping/payment fields |
| Order exists but shipment is missing | Keep `npm run dev` / `dev:aws` running; inspect `SHIPMENT_OUTBOX`. In AWS mode check SSO, EventBridge/SNS, shipping Lambda, and the failure queue |
| Port already in use | Stop the older process on that port; defaults are listed above |
| `package.json` not found | Enter the project folder before running npm commands |
| Refresh returns to payment | Expected: unsubmitted payment/shipping fields are only in memory |
| Test database unavailable | Run `npm run db:test:up`; tests use port 33307, not the development database |
| Browser missing | Run `npx playwright install chromium` |
| Seed changes do not appear | Setup preserves existing products; update the database row explicitly |
| AWS API cannot reach RDS | Check its VPC/subnets/security groups, credentials, and TLS; see the AWS guide |
| Local app cannot reach RDS | Check that RDS is available, `.env.rds` matches, and its security group allows your current public IP |
| RDS inspection fails after SSO expires | Run `aws sso login --profile school`, then retry `npm run rds:inspect` |
