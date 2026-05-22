import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/comunicaciones');
});

test('carga la página de comunicaciones', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Comunicaciones' })).toBeVisible();
});

test('muestra las métricas de comunicaciones', async ({ page }) => {
  await expect(page.getByText('Total')).toBeVisible();
  await expect(page.getByText('Publicadas')).toBeVisible();
  await expect(page.getByText('Solo Socios')).toBeVisible();
  await expect(page.getByText('Públicas')).toBeVisible();
});

test('botón nueva comunicación visible y abre modal', async ({ page }) => {
  await page.getByRole('button', { name: 'Nueva comunicación' }).click();
  await expect(page.getByRole('heading', { name: 'Nueva Comunicación' })).toBeVisible();
  await page.keyboard.press('Escape');
});
