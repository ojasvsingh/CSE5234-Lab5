# Adventure Beyond

**Adventure Beyond** is our outdoor gear shopping website for **CSE 5234 Lab 5: Presentation Tier for Web Applications**.

The goal of this lab is to build the pages that a customer sees and uses. A customer can choose products, edit a shopping bag, enter payment and shipping information, check the order, and see a confirmation number.

**You can run the entire project on your own computer. You do not need AWS, a database, or a backend for this lab.** Orders are demonstrations only: the website does not charge a card or ship products.

## 1. Get the website running

### Before you start

You need:

- **Node.js 22.12 or later**. Node.js lets us run the development tools. It also includes **npm**, which installs the project's libraries. Node 20.19+ is also supported.
- **Git**, if you use the download command below.
- A web browser and a terminal, such as Terminal on macOS, PowerShell on Windows, or the terminal inside VS Code.

Check that Node.js and npm are installed:

```sh
node --version
npm --version
```

Both commands should print version numbers. If a command is not found, install Node.js and reopen your terminal before continuing.

### Download this version of the project

The completed website is on the `ht-lab5` branch in our group repository, `ojasvsingh/CSE5234-Lab5`. Select this branch when downloading the project. A pull request lets the group review the changes before merging them into `main`; until then, `main` may still show the starter app.

For a fresh copy, run these commands one line at a time:

```sh
git clone --branch ht-lab5 --single-branch https://github.com/ojasvsingh/CSE5234-Lab5.git adventure-beyond
cd adventure-beyond
```

The first command downloads the correct branch into a new folder called `adventure-beyond`. The second enters that folder. If you already have this version downloaded, open its folder instead. **The folder should contain `package.json` and this README.**

You can also select that branch on GitHub and use **Code → Download ZIP**, then extract the ZIP and open a terminal in the extracted folder.

### Install and start

From the project folder, run:

```sh
npm ci
npm run dev
```

- `npm ci` installs the library versions recorded in `package-lock.json`. Run it the first time you download the project, or after pulling a change to the dependencies.
- `npm run dev` starts the website on your computer. **Leave this terminal running while you use the website.**

The terminal should display a local address similar to:

```text
Local: http://localhost:5173/
```

Open **http://localhost:5173/purchase** in your browser. You should see the Adventure Beyond heading, a mountain illustration, and five products.

If the terminal prints a different port, such as `5174`, use that address instead. To stop the website, press **Ctrl+C** in the terminal. Next time, open the project folder and run `npm run dev` again. You do not need to reinstall everything each time.

## 2. Try a complete order

Follow this example to check that the main flow works:

1. Set the **Ridge 28L Daypack** quantity to **2**, then click **Add to bag**.
2. Add **1 Camp Insulated Bottle**.
3. Open the shopping bag in the top-right corner. It should contain **3 items** with a total of **$207.00**: `2 × $89.00 + 1 × $29.00`.
4. Try changing a quantity or removing a product. The total should update. Restore the two daypacks and one bottle, then click **Continue to payment**.
5. Enter the sample payment details below, then click **Continue to shipping**.
6. Enter the sample shipping details below, then click **Review your order**.
7. Check the items, total, payment details, and address. The payment section shows only the last four card digits. You can edit your payment, address, or shopping bag here.
8. Check **I've checked my items, payment, and shipping details**, then click **Place demo order**. If you change the bag after checking the box, you need to check it again.
9. You should see **Adventure, confirmed.**, a number such as `AB-1234ABCD`, and your order summary. The shopping bag should now be empty.

Use these **sample details**, not a real card:

| Payment field | What to enter |
| --- | --- |
| Cardholder name | Alex Taylor |
| Card number | 4242 4242 4242 4242 |
| Expiration date | 12/30, or another future date in MM/YY format |
| Security code (CVV) | 123 |

| Shipping field | What to enter |
| --- | --- |
| Full name | Alex Taylor |
| Address line 1 | 123 Trailhead Lane |
| Address line 2 | Leave blank, or enter Apt 5 |
| City | Columbus |
| State | Ohio |
| ZIP code | 43210 |

This demo accepts US shipping addresses. It checks required fields, the card number's format, the expiration date, the CVV's format, and the ZIP code's format. It does **not** contact a bank or check whether an address exists. The total includes only the products; shipping and tax are not charged.

## 3. How the pages match the assignment

The customer follows this sequence:

**Choose gear → Payment → Shipping → Review order → Confirmation**

A *route* is the part of the website address that selects a page. For example, `/purchase/paymentEntry` opens the payment page.

| Page and route | What it does | Page file |
| --- | --- | --- |
| Shop: `/purchase` | Shows five products with pictures, prices, quantity inputs, and Add to bag buttons. | [Purchase.jsx](src/pages/Purchase.jsx) |
| Payment: `/purchase/paymentEntry` | Collects cardholder name, card number, expiration date, and CVV. | [PaymentEntry.jsx](src/pages/PaymentEntry.jsx) |
| Shipping: `/purchase/shippingEntry` | Collects the recipient's name, two address lines, city, state, and ZIP code. Address line 2 is optional. | [ShippingEntry.jsx](src/pages/ShippingEntry.jsx) |
| Review: `/purchase/viewOrder` | Shows the items and total, payment details, and shipping address. Lets the customer edit and confirm the order. | [ViewOrder.jsx](src/pages/ViewOrder.jsx) |
| Confirmation: `/purchase/viewConfirmation` | Thanks the customer and shows a confirmation number and order summary. | [Confirmation.jsx](src/pages/Confirmation.jsx) |

The shopping bag is available on every page. It supports quantities from **1 to 99** per product. Use **Remove** to delete an item. Product information is written directly in the project, which is allowed for this lab. Each demo order gets a confirmation number generated in the browser.

Start at the shop when demonstrating the project. Opening a later checkout page without completing the earlier steps sends you back to the step you still need to fill in. An empty bag sends you back to the shop.

## 4. Understand and change the code

### What the main tools do

- **React** builds the screen from reusable pieces called *components*. For example, the shopping bag is one component that every page can use.
- **Vite** starts the local development server and prepares the website files for hosting. We use it instead of Create React App, following the TA's updated instructions.
- **React Router** chooses which page to display when the address changes. This project uses version 7 with the basic routing APIs also shown in the lab's version 6 examples.
- **React Context** gives the pages one shared place to read and update the cart, payment information, and shipping information.

### Which file should I open?

| If you want to… | Start here |
| --- | --- |
| Change product names, descriptions, or prices | [src/data/products.js](src/data/products.js) |
| Change a product's picture | [public/images](public/images), then update its image path in `products.js` if needed |
| Change colors, spacing, fonts, or mobile layout | [src/styles.css](src/styles.css) |
| Change the header, navigation, or footer | [src/components/Layout.jsx](src/components/Layout.jsx) |
| Change the shopping bag's layout or buttons | [src/components/CartDrawer.jsx](src/components/CartDrawer.jsx) |
| Change the order summary shown beside checkout | [src/components/OrderSummary.jsx](src/components/OrderSummary.jsx) |
| Understand how pages share information | [src/context/ShopContext.jsx](src/context/ShopContext.jsx) |
| Change input validation rules | [src/lib/validation.js](src/lib/validation.js) |
| Understand quantity changes, totals, or saved cart data | [src/lib/shop.js](src/lib/shop.js) |
| Change routes or rules for entering checkout pages | [src/App.jsx](src/App.jsx) |

Prices are stored in **cents**. For example, `priceCents: 8900` means **$89.00**. Using whole-number cents keeps price calculations exact.

To try a small edit, open `src/data/products.js`, change a product description, and save the file while `npm run dev` is running. The browser should update automatically. Page files ending in `.jsx` contain JavaScript together with HTML-like markup that describes the screen.

### Why information survives some actions but not others

The current information used by React is called *state*. Context shares that state between the pages, so pressing Back or using the edit links does not discard the form values.

A full browser refresh restarts the app. We save only the cart and the latest order receipt in **sessionStorage**, the browser's storage for the current tab. Payment details and shipping addresses stay in memory and are never written to that storage or sent to a server.

| Action | Expected result |
| --- | --- |
| Move between pages or use the edit links | Your current cart and form values remain available. |
| Refresh during checkout | The cart remains, but payment and shipping details are cleared. Enter them again, starting at payment. |
| Place an order | A receipt is created. The cart, payment details, and shipping details are cleared. |
| Refresh the confirmation page | The latest receipt still appears in the same tab. |
| Use a browser that blocks session storage | The flow still works until refresh, but the cart and receipt cannot be restored afterward. |

Images and fonts are included with the project, so the running app does not depend on an external image or font service. The SVG illustrations are original; the Fontsource packages include the font licenses.

## 5. Check your changes

After an edit, run through the sample order in Section 2. Also try submitting an empty form and removing every item from the bag. The app should show helpful messages or return to the shop, rather than crash.

There are two types of automated checks. Run them in a **second terminal opened in the project folder**:

**Unit tests** check individual pieces of logic, such as totals and form validation. They do not open a browser.

```sh
npm test
```

**Browser tests** click through the website automatically, using desktop and phone screen sizes. These are also called *end-to-end tests*, abbreviated `e2e`.

```sh
npx playwright install chromium
npm run test:e2e
```

The first command installs the test browser. You normally only need it once, or after updating Playwright. The second command builds the app, starts its own temporary server on port **4173**, and runs the tests. Keep that port free; you do not need to start a preview server yourself. The normal development server on port 5173 can stay running.

The suite currently contains **7 unit tests and 16 browser tests**. A successful run reports that all tests passed. Browser checks cover checkout, editing items and forms, invalid input, refresh behavior, and unavailable or damaged saved data. The phone tests simulate a phone-sized screen in Chromium; they are not tests on a physical phone.

### Optional: check the build for hosting

You do not need this step just to work on the lab locally.

```sh
npm run build
npm run preview
```

`build` creates a folder called `dist` containing the website files. `preview` lets you check those files locally, normally at **http://localhost:4173/purchase**. Neither command uploads anything to AWS or publishes the site. Stop preview with **Ctrl+C** before running the browser tests.

If a later assignment requires online hosting, the host must serve `index.html` for the application's routes. The local Vite servers already handle this.

## 6. Common problems

| What you see | What to do |
| --- | --- |
| `node` or `npm` is not recognized | Install a supported Node.js version, then close and reopen your terminal. |
| An error saying `package.json` cannot be found | Your terminal is in the wrong folder. Enter the downloaded project folder before running npm commands. |
| A React logo or the default starter page | Check that you downloaded the completed branch described in Section 1. The group repository's `main` may still be waiting for the PR to be merged. |
| The browser cannot connect | Check that `npm run dev` is still running. Use the address printed in its terminal. Open that address in a browser; do not double-click `index.html`. |
| Port 5173 is already in use | Vite may choose the next available port. Use the address it prints, followed by `/purchase`. |
| Refresh sends you back to payment | This is expected. The cart is saved, but card and address information must be entered again. |
| The Place demo order button is disabled | Check the box confirming that you reviewed the details. Editing the bag requires checking it again. |
| Browser tests cannot find a browser executable | Run `npx playwright install chromium`, then try `npm run test:e2e` again. |
| Browser tests say port 4173 is in use | Stop any `npm run preview` process using that port, then rerun the tests. |

`npm start` also works; it is another name for `npm run dev` in this project. You do not need to run both.
