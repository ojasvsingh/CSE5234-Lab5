# Adventure Beyond

An outdoor gear storefront for **CSE 5234 Lab 5 — Presentation Tier for Web Applications**. Choose from five products, manage a shopping bag, enter payment and shipping details, review the order, and receive a confirmation.

This is a frontend demonstration. No payment is processed, no order is sent to a server, and no shipment is created. AWS, a database, API keys, and backend services are not needed.

## Run locally

Use Node.js **22.12 or later** (Node 20.19+ is also supported).

```sh
npm ci
npm run dev
```

Open **http://localhost:5173/purchase**. `npm start` is an alias for the same Vite development server.

```sh
npm run build    # Create the production bundle in dist/
npm run preview  # Preview that bundle at http://localhost:4173
```

The project uses React, Vite, and React Router. It follows the TA's updated tooling guidance: Create React App and the earlier MySQL/Express dependencies are not used. React Router 7 retains the declarative routing APIs used in the lab and replaces the older dependency with a patched release.

## Lab requirements

| Route | Implemented behavior |
| --- | --- |
| `/purchase` | Five hardcoded outdoor products, local illustrations, names, prices, quantity inputs, category filters, and add-to-bag controls. |
| `/purchase/paymentEntry` | Cardholder name, card number, expiration date, and CVV entry with validation. |
| `/purchase/shippingEntry` | Name, address line 1, optional address line 2, city, state, and ZIP code. |
| `/purchase/viewOrder` | Selected items, quantities, total cost, masked payment details, shipping address, edit links, and explicit order confirmation. |
| `/purchase/viewConfirmation` | Thank-you message, a locally generated confirmation number, purchased items, and order total. |

The bag is accessible from every page. Open **Your bag** in the header to change quantities or remove an item. Checkout pages also include an **Edit your bag** action. Quantities are whole numbers from 1 to 99 per product; use Remove to delete a line.

All money is calculated in integer cents. The demo total is the sum of item prices × quantities, with no shipping or tax charges.

## Demo walkthrough

1. Add two **Ridge 28L Daypacks** and one **Camp Insulated Bottle**. The total should be **$207.00**.
2. Open the bag and continue to payment.
3. Enter sample details: **Alex Taylor**, **4242 4242 4242 4242**, a future expiration date in **MM/YY**, and CVV **123**.
4. Enter a sample US shipping address, such as **123 Trailhead Lane, Columbus, OH 43210**. Address line 2 is optional.
5. Review the order. Edit payment, shipping, or the bag if needed. Changing the bag requires confirming the details again.
6. Check the confirmation box and select **Place demo order**.
7. Verify the order summary and confirmation number. The bag is now empty.

Use sample data only. Card validation checks the input format and expiration date, not authorization or the existence of a card. Confirmation numbers are generated in the browser for the demo.

## State and navigation

- React Context shares the cart, payment, and shipping information across all five pages. Form edits remain available when navigating back and forth within the app.
- The cart and the latest receipt (confirmation number and product quantities) survive a refresh in the same browser tab through `sessionStorage`.
- **Card numbers, CVVs, cardholder names, and shipping addresses are never written to browser storage or sent over the network.** They remain in memory and are cleared on refresh and after placing an order.
- Refreshing an unfinished checkout keeps the bag and returns to payment so the user can re-enter their details. Refreshing a completed order restores its non-sensitive receipt.
- Opening checkout without a cart returns to the shop. Skipping payment or shipping routes returns to the first incomplete step.
- The checkout still works in memory if browser storage is unavailable. Malformed stored data is ignored, and stored prices are never trusted.

## Tests

```sh
npm test                      # Cart arithmetic, state recovery, and validation
npx playwright install chromium
npm run test:e2e               # Complete browser flows at desktop and mobile sizes
```

Browser tests build the production app and start a temporary preview server on **127.0.0.1:4173**; keep that port free before running them. Tests cover quantity changes/removal, empty carts, invalid forms, editing previous steps, route guards, refresh behavior, confirmation receipts, and unavailable or malformed browser storage.

## Project structure

```text
src/
  App.jsx                 Routes and checkout guards
  components/             Header, shopping bag, form fields, order summary
  context/ShopContext.jsx  Shared cart and checkout state
  data/products.js        Five hardcoded products, prices, and image paths
  lib/                    Cart calculations, storage handling, input validation
  pages/                  The five required screens
  styles.css              Responsive storefront and checkout styling
public/images/            Original SVG product and landscape illustrations
tests/                    Unit and desktop/mobile browser tests
```

Product images and fonts are included locally; no external image or font service is needed while using the app. Fontsource packages provide DM Sans and Manrope under their included open font licenses.

If a later assignment calls for hosting, upload the `dist/` build to a static host and configure it to serve `index.html` for application routes such as `/purchase/paymentEntry`. Vite's development and preview servers already handle those routes locally.
