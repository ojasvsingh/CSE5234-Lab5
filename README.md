# Adventure Beyond

Adventure Beyond is our three-person group's outdoor gear store for **CSE 5234 Labs 5, 6, and 7**.

Lab 5 added shopping and checkout. Lab 6 added the Home, About Us, and Contact Us pages. **Lab 7 adds two backend microservices:** one provides inventory and one checks orders. Products, prices, stock quantities, and confirmation numbers now come from these services.

You can run everything locally with one command after installation. AWS Lambda and API Gateway deployment files are also included. This is a classroom demo: it does not charge cards, ship products, or deliver support messages. Use sample payment and address details.

## 1. Download and run

You need Node.js **22.12 or later** (20.19+ also works), npm, and Git. Check your installation:

```sh
node --version
npm --version
```

For a fresh download:

```sh
git clone --branch ht-lab5 --single-branch https://github.com/ojasvsingh/CSE5234-Lab5.git adventure-beyond
cd adventure-beyond
npm ci
npm run dev
```

If you already have the project, open its folder and update it:

```sh
git switch ht-lab5
git pull --ff-only origin ht-lab5
npm ci
npm run dev
```

Save or commit your own changes before pulling. If Git reports a conflict, resolve it with the group rather than discarding anyone's work.

Open **http://127.0.0.1:5173/**. Keep the terminal running. Press **Ctrl+C** to stop all three processes.

| Process | Local address | Purpose |
| --- | --- | --- |
| React website | `http://127.0.0.1:5173` | The pages you see and interact with |
| Inventory service | `http://127.0.0.1:3001` | Product descriptions, prices, and warehouse quantities |
| Order service | `http://127.0.0.1:3002` | Validates orders, calls inventory, and creates confirmations |

`npm ci` installs the versions recorded in the lockfile. `npm run dev` starts all three processes. No AWS credentials, database, `.env` file, or extra backend packages are needed for local use. `npm start` does the same thing as `npm run dev`.

## 2. Understand the Lab 7 flow

1. The browser requests the inventory from the inventory service.
2. The website displays the returned products and prices. The cart keeps product IDs and quantities.
3. On the review page, **Place demo order** sends the items, payment details, and shipping details to the order service as JSON.
4. The order service validates the request and makes an **HTTP request to the inventory service** to check stock and obtain prices.
5. Enough stock: the order service returns a confirmation number and receipt. Not enough stock: it returns a `409` error identifying the available quantities.
6. The browser clears checkout details only after a successful response. On failure, it keeps the bag and form values so you can correct or retry the order.

An **API** is a way for programs to exchange requests and responses. **JSON** is the text format used for those responses. A **microservice** is a separate backend program with one responsibility. Here the two services run independently and communicate over HTTP; the order service does not import the inventory's product file.

| Required API | What it returns |
| --- | --- |
| `GET /inventory-management/inventory` | All inventory items |
| `GET /inventory-management/inventory/items/{id}` | One item with the given ID |
| `GET /inventory-management/inventory/items?name=itemName` | Items whose names contain the search text |
| `POST /order-processing/order` | A confirmation and receipt, or a validation/stock/service error |

Name searches ignore capitalization. You can combine `id` and `name` query parameters. Full request examples and error formats are in [docs/API.md](docs/API.md).

The inventory file is hardcoded **inside the inventory service**, as Lab 7 allows. There is no product list or confirmation generator in the frontend. The frontend still handles presentation tasks such as input feedback, category filtering, and displaying cart subtotals. The order service independently validates the submitted data and calculates the authoritative total.

This lab **checks stock without reserving or decrementing it**. Repeated demo orders see the same warehouse quantities. Orders and personal details are not stored in a database. Stock updates, durable orders, real payments, and fulfillment are outside this implementation.

## 3. Demonstrate a successful order

1. Click **Shop gear**. Add **2 Ridge 28L Daypacks** and **1 Camp Insulated Bottle**.
2. Open the bag. With the included inventory, the total should be **$207.00** (`2 × $89 + $29`).
3. Try changing a quantity or removing an item, then restore those quantities.
4. Click **Continue to payment** and enter the sample payment details below.
5. Continue to shipping and enter the sample address.
6. Review the order. Try **Edit payment**, **Edit shipping**, or **Edit your bag**.
7. Check the review checkbox and click **Place demo order**. The button displays a pending state while the service checks stock.
8. The confirmation page should show an `AB-XXXXXXXX` number returned by the backend, two receipt lines, and a total of **$207.00**. The bag should be empty.
9. Refresh: the receipt still appears. It retains the prices returned when the order was confirmed.

| Payment field | Sample value |
| --- | --- |
| Cardholder name | Alex Taylor |
| Card number | 4242 4242 4242 4242 |
| Expiration date | 12/35, or another future date in MM/YY format |
| CVV | 123 |

| Shipping field | Sample value |
| --- | --- |
| Full name | Alex Taylor |
| Address line 1 | 123 Trailhead Lane |
| Address line 2 | Leave blank, or use Apt 5 |
| City | Columbus |
| State | Ohio |
| ZIP code | 43210 |

The demo accepts US addresses and charges no shipping or tax. Payment and address validation checks the input's format; it does not contact a bank or verify a street address.

### Demonstrate insufficient stock

The sample warehouse contains **12 daypacks**. Add **13 daypacks**, complete checkout, and submit:

- The order service returns `409 INSUFFICIENT_STOCK`, with `requestedQuantity: 13` and `availableQuantity: 12`.
- The review page keeps the order and shows the shortage.
- Click **Use available quantities** to reduce the bag to 12. Review and check the checkbox again, then submit successfully. An available quantity of zero removes that item from the bag.

The cart allows 1–99 of a product so the shortage flow can be demonstrated. The warehouse quantity, which is shown on each product card, is checked again by the order service.

### Verify service failures

For an explicit failure demonstration, use three terminals instead of `npm run dev`:

```sh
npm run start:inventory
```

```sh
npm run start:orders
```

```sh
npm run dev:frontend
```

Stop the inventory terminal after reaching order review, then submit. You should see a stock-check failure, with no confirmation and no lost form data. Restart inventory and retry. If inventory is down when you first open the shop, the page offers **Try loading gear again**.

## 4. Lab 5 and Lab 6 pages

| Page | Address | Purpose |
| --- | --- | --- |
| Home | `/` | Brand introduction and API-provided featured products |
| About Us | `/about` | Mission, vision, strategy, and all three executive profiles |
| Contact Us | `/contact` | Support topics, example return policies, FAQ, and request preview |
| Shop | `/purchase` | API-provided products, quantity controls, and cart |
| Payment | `/purchase/paymentEntry` | Payment entry and format checks |
| Shipping | `/purchase/shippingEntry` | Shipping address entry and checks |
| Review | `/purchase/viewOrder` | Review details and submit to the order service |
| Confirmation | `/purchase/viewConfirmation` | Backend confirmation number and receipt |

Every page uses the shared navigation, footer, and shopping bag. Layouts adapt to phones. Opening a checkout page before completing its prerequisites sends you back to the appropriate step.

On Contact Us, try choosing a return topic, submitting an empty form, previewing a filled request, downloading it, and opening FAQ answers. **Support requests are local previews only.** The `.example` email address is not monitored.

## 5. Find the code you need

| Change or understand | File |
| --- | --- |
| Products, prices, stock, featured flags | [services/inventory/catalogue.js](services/inventory/catalogue.js) |
| Inventory GET endpoints | [services/inventory/handler.js](services/inventory/handler.js) |
| Order validation, stock checks, confirmation numbers | [services/orders/handler.js](services/orders/handler.js) |
| Shared payment/address format checks | [services/shared/validation.js](services/shared/validation.js) |
| Local HTTP server / Lambda event adapter | [services/shared/http.js](services/shared/http.js), [services/shared/lambda.js](services/shared/lambda.js) |
| Browser requests to the two services | [src/lib/api.js](src/lib/api.js) |
| Cart, inventory loading, and checkout state | [src/context/ShopContext.jsx](src/context/ShopContext.jsx) |
| Cart display totals and receipt storage | [src/lib/shop.js](src/lib/shop.js) |
| Pages | [src/pages](src/pages) |
| Company text, three member profiles, and support content | [src/data/company.js](src/data/company.js) |
| Photos and illustrations | [public/images](public/images) |
| Shared menu and footer | [src/components/Layout.jsx](src/components/Layout.jsx) |
| Colors, spacing, and phone layouts | [src/styles.css](src/styles.css), [src/site.css](src/site.css) |
| Start all services together | [scripts/dev.mjs](scripts/dev.mjs) |
| AWS resources | [template.yaml](template.yaml) |

To edit a product, change `services/inventory/catalogue.js`, restart the inventory service (or restart `npm run dev`), and refresh the browser. Do not add product data back into React. Prices are whole-number **cents**: `8900` means `$89.00`.

Team profiles are already supplied by Haotian Luo, Ojasv Singh, and Sai Chappidi. Each member can edit their entry in `src/data/company.js`; photos are in `public/images/team`. Preserve your teammates' entries when editing.

### What survives a refresh?

| Information | Where it lives |
| --- | --- |
| Cart IDs and quantities | Current tab's `sessionStorage` |
| Latest confirmation and receipt items/totals | Current tab's `sessionStorage` |
| Payment and shipping details | Browser memory until successful submission or refresh |
| Inventory | Inventory service's sample catalogue |

Submitting an order sends payment and shipping details to the order service because Lab 7 requires them in the request. The service validates them without storing, logging, or returning them. A receipt contains only the confirmation number and purchased items/totals. Contact form details are not sent anywhere. Storage-disabled browsers still support checkout until refresh.

## 6. Run the checks

```sh
npm test
```

This runs the unit and API integration tests. API tests start temporary local servers, check real HTTP communication between services, and shut them down automatically.

```sh
npx playwright install chromium
npm run test:e2e
```

Install the test browser once, then run the browser tests. They build the frontend and start temporary servers on ports **4173, 4311, and 4312**. Keep those ports free. Your usual development servers can remain running.

The suite contains **12 unit tests, 9 API tests, and 36 browser tests**. It covers successful checkout, missing stock, service failures, retry, duplicate clicks, dynamic API products, receipt snapshots, company pages, and the existing support flows. Browser tests use desktop and phone screen sizes in Chromium.

To inspect a production build locally:

```sh
npm run build
npm run preview:all
```

This starts the built website on port 4173 with both services. Stop any development services on ports 3001/3002 first. Neither command deploys to AWS.

## 7. AWS deployment

The assignment includes a Lambda/API Gateway walkthrough. This project provides the same four endpoint paths with **two Lambda functions and two REST APIs**, using Node.js as the allowed alternative stack. [docs/AWS.md](docs/AWS.md) explains deployment, environment variables, testing, and cleanup. The frontend can call AWS APIs while still running locally.

For public frontend hosting, the static host must serve `index.html` for client-side routes. Vite's local servers already do this.

## 8. Common problems

| Problem | What to do |
| --- | --- |
| `node` or `npm` not found | Install a supported Node.js version and reopen the terminal. |
| `package.json` not found | Enter the project folder before running npm commands. |
| Only the frontend starts | Use `npm run dev` for all three processes; `dev:frontend` starts only Vite. |
| Port 5173, 3001, or 3002 is in use | Stop the earlier project process using it, then restart. The launcher exits on port conflicts. |
| Gear cannot load | Make sure inventory is running. If using AWS, check `.env.local`, including the `/dev` stage, then restart Vite. |
| Order cannot check stock | Make sure the order service can reach inventory. Its `INVENTORY_SERVICE_URL` must be the inventory base URL. |
| Order rejected for quantity | Use the returned available quantity or edit your bag. Review and confirm again. |
| Refresh returns to payment | Expected: payment and shipping fields are kept only in memory. |
| Place demo order is disabled | Check the review checkbox; wait if an order request is already pending. |
| Test browser missing | Run `npx playwright install chromium`. |
| Browser test ports are occupied | Stop the earlier test/preview processes on 4173, 4311, or 4312. |
| Support message was not delivered | The support form creates a local preview only. |
