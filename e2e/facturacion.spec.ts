import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/facturacion');
});

test('carga la página con las métricas', async ({ page }) => {
  await expect(page.getByText('Pendientes')).toBeVisible();
  await expect(page.getByText('Pagadas este mes')).toBeVisible();
  await expect(page.getByText('Vencidas')).toBeVisible();
  await expect(page.getByText('Total facturado')).toBeVisible();
});

test('botón nueva factura visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Nueva factura' })).toBeVisible();
});

test('abre el modal de nueva factura', async ({ page }) => {
  await page.getByRole('button', { name: 'Nueva factura' }).click();
  await expect(page.getByRole('heading', { name: 'Nueva factura' })).toBeVisible();
  await page.keyboard.press('Escape');
});
