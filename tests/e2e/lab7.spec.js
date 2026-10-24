import { test, expect } from '@playwright/test';
import { products } from '../../services/inventory/catalogue.js';
import { addProduct, openBag, startCheckout, fillPayment, fillShipping } from './helpers.js';

const inventoryPath = '**/inventory-management/inventory';
const orderPath = '**/order-processing/order';

test('inventory loading, failure, retry, and new API products are reflected without a frontend catalogue', async ({ page }) => {
  let release;
  let fail = true;
  const wait = new Promise(resolve => { release = resolve; });
  const items = [{ ...products[0], id: 'river-chair', name: 'River Camp Chair', category: 'Seating', priceCents: 4700, featured: true }];
  await page.route(inventoryPath, async route => {
    await wait;
    await route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: { message: 'Inventory temporarily unavailable.' } } : { items } });
  });
  await page.goto('/purchase');
  await expect(page.getByRole('status').filter({ hasText: 'Loading the latest gear' })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(0);
  release();
  await expect(page.getByRole('alert')).toContainText('Inventory temporarily unavailable.');
  fail = false;
  await page.getByRole('button', { name: 'Try loading gear again' }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'River Camp Chair' })).toBeVisible();
  await expect(page.locator('.product-title-row')).toContainText('$47.00');
  await expect(page.getByRole('button', { name: 'Seating', exact: true })).toBeVisible();
  await addProduct(page, 'River Camp Chair', 2);
  const bag = await openBag(page);
  await expect(bag.locator('.total-row')).toContainText('$94.00');
  await bag.getByRole('button', { name: 'Close shopping cart' }).click();
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.locator('.featured-product')).toHaveCount(1);
  await expect(page.locator('.featured-product')).toContainText('River Camp Chair');
});

test('excess stock is rejected by the real order service and can be reduced before retrying', async ({ page }) => {
  await page.goto('/purchase');
  await addProduct(page, 'Ridge 28L Daypack', 13);
  const bag = await openBag(page);
  await bag.getByRole('button', { name: 'Continue to payment' }).click();
  await fillPayment(page);
  await fillShipping(page);
  await page.getByRole('checkbox').check();
  const rejected = page.waitForResponse(response => response.url().endsWith('/order-processing/order'));
  await page.getByRole('button', { name: /^Place demo order/ }).click();
  expect((await rejected).status()).toBe(409);
  await expect(page).toHaveURL(/\/purchase\/viewOrder$/);
  await expect(page.getByRole('alert')).toContainText('requested 13, available 12');
  expect(await page.evaluate(() => sessionStorage.getItem('adventure-beyond.receipt.v2'))).toBeNull();
  await page.getByRole('button', { name: 'Use available quantities' }).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('button', { name: /^Place demo order/ })).toBeDisabled();
  await page.getByRole('checkbox').check();
  const accepted = page.waitForResponse(response => response.url().endsWith('/order-processing/order'));
  await page.getByRole('button', { name: /^Place demo order/ }).click();
  const response = await accepted;
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  await expect(page.locator('.confirmation-number')).toHaveText(receipt.confirmationNumber);
  await expect(page.locator('.receipt-items')).toContainText('Qty 12');
});

test('an unavailable order service preserves checkout details and allows a successful retry', async ({ page }) => {
  let attempts = 0;
  await page.route(orderPath, route => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, json: { error: { code: 'INVENTORY_UNAVAILABLE', message: 'We could not check stock. Please try again.' } } })
      : route.continue();
  });
  await startCheckout(page);
  await fillPayment(page);
  await fillShipping(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Place demo order/ }).click();
  await expect(page.getByRole('alert')).toContainText('could not check stock');
  await expect(page.locator('address')).toContainText('Trailhead Lane');
  await expect(page.getByRole('button', { name: 'Open shopping cart, 3 items' })).toBeVisible();
  await page.getByRole('link', { name: 'Edit payment', exact: true }).click();
  await expect(page.getByLabel('Card number', { exact: true })).toHaveValue('4242 4242 4242 4242');
  await page.getByRole('button', { name: 'Continue to shipping' }).click();
  await page.getByRole('button', { name: 'Review your order' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Place demo order/ }).click();
  await expect(page).toHaveURL(/\/purchase\/viewConfirmation$/);
  expect(attempts).toBe(2);
});

test('pending orders cannot be submitted twice and receipts survive changed or unavailable inventory', async ({ page }) => {
  let attempts = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(orderPath, async route => {
    attempts += 1;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  await startCheckout(page);
  await fillPayment(page);
  await fillShipping(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Place demo order/ }).click();
  await expect(page.getByRole('button', { name: 'Checking stock and placing order…' })).toBeDisabled();
  await page.locator('.place-order-form').evaluate(form => form.requestSubmit());
  expect(attempts).toBe(1);
  release();
  await expect(page).toHaveURL(/\/purchase\/viewConfirmation$/);
  const number = await page.locator('.confirmation-number').textContent();
  await page.route(inventoryPath, route => route.fulfill({ json: { items: products.map(item => ({ ...item, priceCents: 1 })) } }));
  await page.reload();
  await expect(page.locator('.confirmation-number')).toHaveText(number);
  await expect(page.locator('.confirmation-receipt .total-row')).toContainText('$207.00');
  await page.unroute(inventoryPath);
  await page.route(inventoryPath, route => route.abort());
  await page.reload();
  await expect(page.locator('.confirmation-number')).toHaveText(number);
  await expect(page.locator('.confirmation-receipt .total-row')).toContainText('$207.00');
});
