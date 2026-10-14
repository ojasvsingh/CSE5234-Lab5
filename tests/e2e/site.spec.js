import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { teamMembers } from '../../src/data/company.js';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.__runtimeErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.__runtimeErrors).toEqual([]);
});

test('home is a real landing page and featured products lead to the matching gear', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Take the long');
  await expect(page.locator('.featured-product')).toHaveCount(3);
  await page.getByRole('link', { name: /Ridge 28L Daypack.*89/ }).click();
  await expect(page).toHaveURL(/\/purchase#ridge-daypack$/);
  await expect(page.locator('#ridge-daypack')).toBeInViewport();
  await page.getByRole('link', { name: 'Adventure Beyond home', exact: true }).click();
  await expect(page).toHaveTitle('Home | Adventure Beyond');
  await page.getByRole('link', { name: 'Explore the collection', exact: true }).click();
  await expect(page).toHaveURL(/\/purchase$/);
});

test('all primary pages share visible navigation, working footer links, and a responsive layout', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  const destinations = [
    ['Home', '/', 'Home'],
    ['About us', '/about', 'About us'],
    ['Contact us', '/contact', 'Contact us'],
    ['Shop gear', '/purchase', 'Outdoor essentials'],
  ];
  for (const [label, path, title] of destinations) {
    await navigation.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/' : path}$`));
    await expect(page).toHaveTitle(`${title} | Adventure Beyond`);
    await expect(navigation.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
    for (const [name] of destinations) {
      await expect(navigation.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('navigation', { name: 'Customer support', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('navigation', { name: 'Customer support', exact: true })
    .getByRole('link', { name: 'Returns & support', exact: true }).click();
  await expect(page).toHaveURL(/\/contact#returns$/);
  await expect(page.getByRole('heading', { name: 'Returns & support policy', exact: true })).toBeInViewport();
  await page.getByRole('navigation', { name: 'Customer support', exact: true })
    .getByRole('link', { name: 'Frequently asked questions', exact: true }).click();
  await expect(page).toHaveURL(/\/contact#faq$/);
  await expect(page.getByRole('group').filter({ has: page.getByText('Is this a real store?', { exact: true }) })).toHaveCount(1);
});

test('the company page explains mission, vision, strategy, and the executive profiles', async ({ page }) => {
  await page.goto('/about');
  for (const heading of ['Our mission', 'Our vision', 'Our strategy', 'Meet our executives']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.locator('.strategy-grid article')).toHaveCount(3);
  if (teamMembers.length) {
    await expect(page.locator('.team-card')).toHaveCount(teamMembers.length);
    for (const member of teamMembers) {
      const profile = page.locator('.team-card').filter({ has: page.getByRole('heading', { name: member.name, exact: true }) });
      await expect(profile).toContainText(member.title);
      await expect(profile).toContainText(member.education);
      await expect(profile.locator('img')).toHaveJSProperty('complete', true);
      expect(await profile.locator('img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
    }
  } else {
    await expect(page.locator('.team-pending')).toContainText('Member profiles are still awaiting those details.');
  }
});

test('support validates input and prepares a local preview without sending or storing it', async ({ page }) => {
  const outboundRequests = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' || new URL(request.url()).origin !== 'http://127.0.0.1:4173') {
      outboundRequests.push(request.url());
    }
  });
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Preview support request', exact: true }).click();
  await expect(page.locator('.field-error')).toHaveCount(4);
  await expect(page.getByLabel('Your name', { exact: true })).toBeFocused();
  await page.getByLabel('Your name', { exact: true }).fill('Alex Taylor');
  await page.getByLabel('Email address', { exact: true }).fill('invalid-email');
  await page.getByRole('button', { name: 'Preview support request', exact: true }).click();
  await expect(page.getByLabel('Email address', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Email address', { exact: true }).fill('alex@example.com');
  await page.getByLabel('How can we help?', { exact: true }).selectOption('product');
  await page.getByLabel('Your message', { exact: true }).fill('Can you help me choose a daypack for a short trail?');
  await page.getByRole('button', { name: 'Preview support request', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Your request preview', exact: true });
  await expect(preview).toBeVisible();
  await expect(preview).toBeFocused();
  await expect(preview).toContainText('This request has not been sent');
  await expect(preview.locator('pre')).toContainText('Team: Gear support');
  await expect(preview.locator('pre')).toContainText('Order number: Not supplied');
  const stored = await page.evaluate(() => JSON.stringify({ session: { ...sessionStorage }, local: { ...localStorage } }));
  expect(stored).not.toContain('alex@example.com');
  expect(stored).not.toContain('short trail');
  expect(outboundRequests).toEqual([]);
  await page.getByLabel('Your message', { exact: true }).fill('I have a different product question now.');
  await expect(preview).toHaveCount(0);
});

test('return links select the right support team and request previews can be downloaded', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('link', { name: 'Get help with a return', exact: true }).click();
  await expect(page.getByLabel('How can we help?', { exact: true })).toHaveValue('return');
  await page.getByLabel('Your name', { exact: true }).fill('Alex Taylor');
  await page.getByLabel('Email address', { exact: true }).fill('alex@example.com');
  await page.getByLabel('Order number', { exact: false }).fill('wrong');
  await page.getByLabel('Your message', { exact: true }).fill('The daypack in my demo order needs a return review.');
  await page.getByRole('button', { name: 'Preview support request', exact: true }).click();
  await expect(page.getByLabel('Order number', { exact: false })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Order number', { exact: false }).fill('ab-1234abcd');
  await page.getByRole('button', { name: 'Preview support request', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download preview', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('adventure-beyond-support-preview.txt');
  const downloadedText = await readFile(await download.path(), 'utf8');
  expect(downloadedText).toContain('Team: Returns support');
  expect(downloadedText).toContain('Order number: AB-1234ABCD');
  expect(downloadedText).toContain('This request has not been sent.');
});

test('FAQ works with the keyboard and company pages retain the shopping bag and payment draft', async ({ page }) => {
  await page.goto('/contact#faq');
  const question = page.locator('summary').filter({ hasText: 'Will anyone receive the support request?' });
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(question.locator('..')).toHaveAttribute('open', '');
  await expect(question.locator('..')).toContainText('No. Previewing a request does not send an email');
  await page.keyboard.press('Enter');
  await expect(question.locator('..')).not.toHaveAttribute('open');

  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Shop gear', exact: true }).click();
  await page.getByRole('button', { name: 'Add Camp Insulated Bottle to bag', exact: true }).click();
  await page.getByRole('button', { name: 'Open shopping cart, 1 items' }).click();
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await page.getByLabel('Cardholder name', { exact: true }).fill('Alex Taylor');
  const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  await navigation.getByRole('link', { name: 'About us', exact: true }).click();
  await page.getByRole('button', { name: 'Open shopping cart, 1 items' }).click();
  const bag = page.getByRole('dialog');
  await expect(bag.getByRole('heading', { name: 'Camp Insulated Bottle', exact: true })).toBeVisible();
  await bag.getByRole('button', { name: 'Close shopping cart' }).click();
  await navigation.getByRole('link', { name: 'Contact us', exact: true }).click();
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/purchase\/paymentEntry$/);
  await expect(page.getByLabel('Cardholder name', { exact: true })).toHaveValue('Alex Taylor');
});
