import { expect, type Page, test } from '@playwright/test';

/**
 * The SIH judge demo flow, end to end through the real UI and backend:
 * landing → sign in → dashboard → new analysis → live processing → blueprint →
 * graph → versions → certification → gaps → evidence → specification → export.
 */
const SHOTS = process.env.E2E_SCREENSHOTS ?? '.tmp/screens';
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });

test('judge demo flow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('FiiSpec');
  await expect(page.getByText('Turn product and tender specifications into evidence-backed standards intelligence.')).toBeVisible();
  await shot(page, '01-landing');
  await shot(page, '01-landing-full', true);

  // Sign in as the demo procurement officer.
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill('officer@fiispec.demo');
  await page.getByLabel('Password').fill('FiiSpec#2026');
  await shot(page, '02-login');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await expect(page.getByText('Analyses completed')).toBeVisible();
  await shot(page, '03-dashboard');

  // New analysis with the demo description.
  await page.getByRole('link', { name: 'New Analysis' }).first().click();
  await expect(page).toHaveURL(/\/analysis\/new/);
  await page.getByLabel('Describe what you need').fill('11 kW outdoor AC EV charger for public charging.');
  await shot(page, '04-new-analysis');
  await page.getByRole('button', { name: 'Analyze with FiiSpec' }).click();
  // The dev server compiles routes on first visit, so allow extra time for navigation.
  await expect(page).toHaveURL(/\/analysis\/(?!new)[A-Za-z0-9]+/, { timeout: 90_000 });
  await shot(page, '05-processing');

  // Results (real pipeline via the emulator).
  await expect(page.getByRole('heading', { name: 'Standards Blueprint' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('IS 17017 (Part 1) : 2018').first()).toBeVisible();
  await shot(page, '06-blueprint');
  await shot(page, '06-blueprint-full', true);

  await page.getByRole('tab', { name: 'Graph' }).click();
  await expect(page.getByLabel('Standards relationship graph')).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, '07-graph');
  // Click a relationship-bearing node and verify the detail panel.
  await page.locator('.react-flow__node').filter({ hasText: 'IS 17017 (Part 2/Sec 2)' }).first().click();
  await expect(page.getByRole('link', { name: 'Open standard' })).toBeVisible();
  await shot(page, '07-graph-node');

  await page.getByRole('tab', { name: 'Versions' }).click();
  await expect(page.getByText('Version requires verification').first()).toBeVisible();
  await shot(page, '08-versions');

  await page.getByRole('tab', { name: 'Certification' }).click();
  await expect(page.getByText('Potentially applicable').first()).toBeVisible();
  await shot(page, '09-certification');

  await page.getByRole('tab', { name: 'Gaps' }).click();
  await expect(page.getByRole('heading', { name: 'Specification Readiness' })).toBeVisible();
  await expect(page.getByText('Vehicle connector type: not specified.')).toBeVisible();
  await shot(page, '10-gaps');

  await page.getByRole('tab', { name: 'Evidence' }).click();
  await expect(page.getByRole('heading', { name: 'Recommendations' })).toBeVisible();
  await shot(page, '11-evidence');

  await page.getByRole('tab', { name: 'Specification' }).click();
  await page.getByRole('button', { name: 'Generate Procurement Specification' }).click();
  await expect(page.getByText('Generated draft — not reviewed')).toBeVisible({ timeout: 60_000 });
  await shot(page, '12-specification');

  // Export PDF.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export report/ }).click();
  await page.getByRole('menuitem', { name: 'PDF report' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^FiiSpec-.*\.pdf$/);
  await download.saveAs(`${SHOTS}/export.pdf`);

  await page.getByRole('tab', { name: 'Audit trail' }).click();
  await expect(page.getByText('Report exported', { exact: true })).toBeVisible();
  await shot(page, '13-audit');
});

test('mobile layout of results and abstention case', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill('officer@fiispec.demo');
  await page.getByLabel('Password').fill('FiiSpec#2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await shot(page, '20-mobile-dashboard');
  await page.goto('/analysis/new');
  await page.getByLabel('Describe what you need').fill('Supply of ergonomic office chairs with mesh back and adjustable armrests.');
  await page.getByRole('button', { name: 'Analyze with FiiSpec' }).click();
  await expect(page.getByText('FiiSpec could not establish sufficient evidence for a reliable recommendation.')).toBeVisible({ timeout: 120_000 });
  await shot(page, '21-mobile-abstention');
  await page.getByRole('tab', { name: 'Graph' }).click();
  await shot(page, '22-mobile-graph-list');
  await context.close();
});

test('admin console is restricted and functional', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('reviewer@fiispec.demo');
  await page.getByLabel('Password').fill('FiiSpec#2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/admin');
  await expect(page.getByText('Administrator access required')).toBeVisible();

  await page.getByRole('button', { name: /Rahul|Meera|Aditi|Karan/ }).click().catch(() => undefined);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@fiispec.demo');
  await page.getByLabel('Password').fill('FiiSpec#2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/admin/standards');
  await expect(page.getByRole('heading', { name: 'Standards' })).toBeVisible();
  await expect(page.getByText('IS 17017 (Part 1)').first()).toBeVisible();
  await shot(page, '30-admin-standards');
  await page.goto('/admin/benchmarks');
  await page.getByRole('button', { name: 'Run benchmark' }).click();
  await expect(page.getByText(/Latest run/)).toBeVisible({ timeout: 120_000 });
  await shot(page, '31-admin-benchmarks');
  await page.goto('/admin/health');
  await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
  await shot(page, '32-admin-health');
});
