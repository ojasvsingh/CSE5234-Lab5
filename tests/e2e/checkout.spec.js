import { test, expect } from '@playwright/test';

const futureExpiry = `12/${String(new Date().getFullYear() + 3).slice(-2)}`;

async function addProduct(page, name, quantity = 1) {
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  if (quantity !== 1) {
    await card.getByRole('spinbutton').fill(String(quantity));
    await card.getByRole('spinbutton').blur();
  }
  await card.getByRole('button', { name: `Add ${name} to bag`, exact: true }).click();
}

async function openBag(page) {
  await page.getByRole('button', { name: /^Open shopping cart/ }).click();
  const bag = page.getByRole('dialog', { name: /^Your bag/ });
  await expect(bag).toBeVisible();
  return bag;
}

async function startCheckout(page) {
  await page.goto('/purchase');
  await addProduct(page, 'Ridge 28L Daypack', 2);
  await addProduct(page, 'Camp Insulated Bottle');
  const bag = await openBag(page);
  await bag.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page).toHaveURL(/\/purchase\/paymentEntry$/);
}

async function fillPayment(page) {
  await page.getByLabel('Cardholder name', { exact: true }).fill('Alex Taylor');
  await page.getByLabel('Card number', { exact: true }).fill('4242 4242 4242 4242');
  await page.getByLabel('Expiration date', { exact: true }).fill(futureExpiry);
  await page.getByLabel('Security code (CVV)', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Continue to shipping' }).click();
  await expect(page).toHaveURL(/\/purchase\/shippingEntry$/);
}

async function fillShipping(page, apartment = '') {
  await page.getByLabel('Full name', { exact: true }).fill('Alex Taylor');
  await page.getByLabel('Address line 1', { exact: true }).fill('123 Trailhead Lane');
  await page.getByLabel('Address line 2', { exact: false }).fill(apartment);
  await page.getByLabel('City', { exact: true }).fill('Columbus');
  await page.getByLabel('State', { exact: true }).selectOption('OH');
  await page.getByLabel('ZIP code', { exact: true }).fill('43210');
  await page.getByRole('button', { name: 'Review your order' }).click();
  await expect(page).toHaveURL(/\/purchase\/viewOrder$/);
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.__runtimeErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect(page.__runtimeErrors).toEqual([]);
});

test('all five products and local images render; filters and cart editing work', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/purchase$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Good gear.');
  await expect(page.getByRole('article')).toHaveCount(5);
  await expect(page.locator('.product-image img')).toHaveCount(5);
  for (const image of await page.locator('.product-image img').all()) {
    await expect(image).toHaveJSProperty('complete', true);
    expect(await image.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  }
  await page.getByRole('button', { name: 'Essentials', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'All gear5', exact: true }).click();
  await addProduct(page, 'Ridge 28L Daypack', 2);
  await addProduct(page, 'Camp Insulated Bottle');
  const bag = await openBag(page);
  await expect(bag.getByText('$207.00', { exact: true })).toBeVisible();
  await bag.getByRole('spinbutton', { name: 'Quantity for Ridge 28L Daypack', exact: true }).fill('3');
  await expect(bag.getByText('$296.00', { exact: true })).toBeVisible();
  await bag.getByRole('button', { name: 'Remove Camp Insulated Bottle from cart' }).click();
  await expect(bag.getByRole('article')).toHaveCount(1);
  await expect(bag.locator('.total-row')).toContainText('$267.00');
  await bag.getByRole('button', { name: 'Close shopping cart' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open shopping cart, 3 items' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('complete checkout preserves edits, masks payment, and creates a persistent receipt', async ({ page }) => {
  await startCheckout(page);
  await fillPayment(page);
  await page.goBack();
  await expect(page.getByLabel('Cardholder name', { exact: true })).toHaveValue('Alex Taylor');
  await expect(page.getByLabel('Card number', { exact: true })).toHaveValue('4242 4242 4242 4242');
  await page.getByRole('button', { name: 'Continue to shipping' }).click();
  await fillShipping(page, 'Apt 5');
  await expect(page.locator('address')).toContainText('Apt 5');
  await expect(page.getByText('Card ending in', { exact: false })).toContainText('4242');
  await expect(page.getByText('4242 4242 4242 4242', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Edit shipping', exact: true }).click();
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('Columbus');
  await page.getByLabel('City', { exact: true }).fill('Dublin');
  await page.getByRole('button', { name: 'Review your order' }).click();
  await expect(page.locator('address')).toContainText('Dublin');
  await expect(page.getByRole('button', { name: /^Place demo order/ })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Place demo order/ }).click();
  await expect(page).toHaveURL(/\/purchase\/viewConfirmation$/);
  await expect(page.getByRole('heading', { name: 'Adventure, confirmed.' })).toBeVisible();
  await expect(page.locator('.confirmation-number')).toHaveText(/^AB-[A-Z0-9]{8}$/);
  const confirmationNumber = await page.locator('.confirmation-number').textContent();
  await expect(page.locator('.receipt-items li')).toHaveCount(2);
  await expect(page.locator('.confirmation-receipt .total-row')).toContainText('$207.00');
  await expect(page.getByRole('button', { name: 'Open shopping cart, 0 items' })).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify(sessionStorage));
  expect(stored).not.toContain('4242 4242 4242 4242');
  expect(stored).not.toContain('cvvCode');
  expect(stored).not.toContain('Trailhead Lane');
  await page.reload();
  await expect(page.locator('.confirmation-number')).toHaveText(confirmationNumber);
  await page.getByRole('link', { name: 'Back to exploring' }).click();
  await addProduct(page, 'Camp Insulated Bottle');
  await page.goto('/purchase/viewConfirmation');
  await expect(page.locator('.confirmation-receipt .total-row')).toContainText('$207.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('invalid payment and shipping inputs stay on their step with useful errors', async ({ page }) => {
  await startCheckout(page);
  await page.getByRole('button', { name: 'Continue to shipping' }).click();
  await expect(page.locator('.field-error')).toHaveCount(4);
  await expect(page.getByLabel('Cardholder name', { exact: true })).toBeFocused();
  await page.getByLabel('Cardholder name', { exact: true }).fill('Alex Taylor');
  await page.getByLabel('Card number', { exact: true }).fill('12');
  await page.getByLabel('Expiration date', { exact: true }).fill('01/20');
  await page.getByLabel('Security code (CVV)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Continue to shipping' }).click();
  await expect(page.getByText('Enter an expiration date that has not passed.')).toBeVisible();
  await fillPayment(page);
  await page.getByRole('button', { name: 'Review your order' }).click();
  await expect(page.locator('.field-error')).toHaveCount(5);
  await fillShipping(page);
  await expect(page.getByRole('button', { name: /^Place demo order/ })).toBeDisabled();
});

test('editing the bag at review updates totals and requires confirmation again', async ({ page }) => {
  await startCheckout(page);
  await fillPayment(page);
  await fillShipping(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Edit your bag', exact: true }).click();
  const bag = page.getByRole('dialog');
  await bag.getByRole('button', { name: 'Increase quantity for Camp Insulated Bottle' }).click();
  await bag.getByRole('button', { name: 'Close shopping cart' }).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Place demo order · $236.00', exact: true })).toBeDisabled();
  const reopened = await openBag(page);
  await reopened.getByRole('button', { name: 'Remove Camp Insulated Bottle from cart' }).click();
  await reopened.getByRole('button', { name: 'Remove Ridge 28L Daypack from cart' }).click();
  await expect(reopened.getByText('Your bag is empty.', { exact: false })).toBeVisible();
  await reopened.getByRole('button', { name: 'Close shopping cart' }).click();
  await expect(page).toHaveURL(/\/purchase$/);
});

test('direct URLs and refreshing checkout safely recover without exposing saved payment data', async ({ page }) => {
  for (const path of ['paymentEntry', 'shippingEntry', 'viewOrder', 'viewConfirmation']) {
    await page.goto(`/purchase/${path}`);
    await expect(page).toHaveURL(/\/purchase$/);
  }
  await startCheckout(page);
  await fillPayment(page);
  await fillShipping(page);
  await page.reload();
  await expect(page).toHaveURL(/\/purchase\/paymentEntry$/);
  await expect(page.getByLabel('Card number', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Open shopping cart, 3 items' })).toBeVisible();
  await page.goto('/missing-trail');
  await expect(page.getByRole('heading', { name: 'This trail ends here.' })).toBeVisible();
});

test('quantity boundaries and an empty shopping bag remain usable', async ({ page }) => {
  await page.goto('/purchase');
  const emptyBag = await openBag(page);
  await expect(emptyBag.getByRole('button', { name: 'Continue to payment' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(emptyBag).not.toBeVisible();
  const quantity = page.getByRole('spinbutton', { name: 'Quantity for Camp Insulated Bottle', exact: true });
  for (const invalid of ['0', '-1', '2.5', '100', '']) {
    await quantity.fill(invalid);
    await quantity.blur();
    await expect(quantity).toHaveValue('1');
  }
  await addProduct(page, 'Camp Insulated Bottle', 99);
  await expect(page.getByRole('button', { name: 'Add Camp Insulated Bottle to bag' })).toBeDisabled();
  const bag = await openBag(page);
  await expect(bag.getByRole('button', { name: 'Increase quantity for Camp Insulated Bottle' })).toBeDisabled();
  await expect(bag.locator('.total-row')).toContainText('$2,871.00');
});

test('corrupt session data recovers to a usable empty cart', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('adventure-beyond.cart.v1', '{broken');
    sessionStorage.setItem('adventure-beyond.receipt.v1', '{"number":"invalid","cart":[]}');
  });
  await page.goto('/purchase');
  await expect(page.getByRole('article')).toHaveCount(5);
  const bag = await openBag(page);
  await expect(bag.getByText('Your bag is empty.', { exact: false })).toBeVisible();
});

test('checkout works even if session storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage unavailable'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage unavailable'); };
    Storage.prototype.removeItem = () => { throw new DOMException('Storage unavailable'); };
  });
  await startCheckout(page);
  await fillPayment(page);
  await fillShipping(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Place demo order/ }).click();
  await expect(page.getByRole('heading', { name: 'Adventure, confirmed.' })).toBeVisible();
});
