import { expect } from '@playwright/test';

export const futureExpiry = `12/${String(new Date().getFullYear() + 3).slice(-2)}`;

export async function addProduct(page, name, quantity = 1) {
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  if (quantity !== 1) {
    await card.getByRole('spinbutton').fill(String(quantity));
    await card.getByRole('spinbutton').blur();
  }
  await card.getByRole('button', { name: `Add ${name} to bag`, exact: true }).click();
}

export async function openBag(page) {
  await page.getByRole('button', { name: /^Open shopping cart/ }).click();
  const bag = page.getByRole('dialog', { name: /^Your bag/ });
  await expect(bag).toBeVisible();
  return bag;
}

export async function startCheckout(page) {
  await page.goto('/purchase');
  await addProduct(page, 'Ridge 28L Daypack', 2);
  await addProduct(page, 'Camp Insulated Bottle');
  const bag = await openBag(page);
  await bag.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page).toHaveURL(/\/purchase\/paymentEntry$/);
}

export async function fillPayment(page) {
  await page.getByLabel('Cardholder name', { exact: true }).fill('Alex Taylor');
  await page.getByLabel('Card number', { exact: true }).fill('4242 4242 4242 4242');
  await page.getByLabel('Expiration date', { exact: true }).fill(futureExpiry);
  await page.getByLabel('Security code (CVV)', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Continue to shipping' }).click();
  await expect(page).toHaveURL(/\/purchase\/shippingEntry$/);
}

export async function fillShipping(page, apartment = '') {
  await page.getByLabel('Full name', { exact: true }).fill('Alex Taylor');
  await page.getByLabel('Address line 1', { exact: true }).fill('123 Trailhead Lane');
  await page.getByLabel('Address line 2', { exact: false }).fill(apartment);
  await page.getByLabel('City', { exact: true }).fill('Columbus');
  await page.getByLabel('State', { exact: true }).selectOption('OH');
  await page.getByLabel('ZIP code', { exact: true }).fill('43210');
  await page.getByRole('button', { name: 'Review your order' }).click();
  await expect(page).toHaveURL(/\/purchase\/viewOrder$/);
}

