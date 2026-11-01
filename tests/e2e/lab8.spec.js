import { test, expect } from '@playwright/test';
import { startCheckout, fillPayment, fillShipping } from './helpers.js';
import { createTestPool } from '../fixtures/database.js';

test('browser order is saved in all four order tables with the displayed receipt total', async ({ page }) => {
  await startCheckout(page);
  await fillPayment(page);
  await fillShipping(page, 'Apt 5');
  await expect(page.getByText('alex@example.com', { exact: true })).toBeVisible();
  await page.getByRole('checkbox').check();
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/order-processing/order') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /^Place demo order/ }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  await expect(page.locator('.confirmation-number')).toHaveText(receipt.confirmationNumber);
  const pool = createTestPool();
  try {
    const [[order]] = await pool.execute(`SELECT o.STATUS, o.CUSTOMER_EMAIL, s.ADDRESS2, s.COUNTRY, p.CARD_NUM, p.CVV
      FROM CUSTOMER_ORDER o JOIN SHIPPING_INFO s ON s.ID = o.SHIPPING_INFO_ID_FK
      JOIN PAYMENT_INFO p ON p.ID = o.PAYMENT_INFO_ID_FK WHERE o.ID = ?`, [receipt.orderId]);
    expect(order).toMatchObject({ STATUS: 'New', CUSTOMER_EMAIL: 'alex@example.com', ADDRESS2: 'Apt 5', COUNTRY: 'US', CARD_NUM: '****4242', CVV: null });
    const [[lines]] = await pool.execute('SELECT COUNT(*) AS n, SUM(QUANTITY * UNIT_PRICE) AS total FROM CUSTOMER_ORDER_LINE_ITEM WHERE CUSTOMER_ORDER_ID_FK = ?', [receipt.orderId]);
    expect(lines.n).toBe(2);
    expect(lines.total).toBe('207.00');
    await page.reload();
    await expect(page.locator('.confirmation-number')).toHaveText(receipt.confirmationNumber);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await pool.end();
  }
});

test('shipping requires a valid email and preserves it when editing', async ({ page }) => {
  await startCheckout(page);
  await fillPayment(page);
  await page.getByLabel('Email address', { exact: true }).fill('invalid-email');
  await page.getByRole('button', { name: 'Review your order' }).click();
  await expect(page.getByText('Enter a valid email address.', { exact: true })).toBeVisible();
  await fillShipping(page);
  await page.getByRole('link', { name: 'Edit shipping', exact: true }).click();
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('alex@example.com');
});
