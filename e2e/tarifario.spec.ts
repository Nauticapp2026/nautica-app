import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tarifario');
});

test('carga la página de tarifario', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Tarifario' })).toBeVisible();
});

test('muestra los filtros de categoría', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Todas', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cuota mensual' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Servicios' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Espacios', exact: true })).toBeVisible();
});

test('botón nueva tarifa visible y abre modal', async ({ page }) => {
  await page.getByRole('button', { name: 'Nueva tarifa' }).click();
  await expect(page.getByRole('heading', { name: 'Nueva tarifa' })).toBeVisible();
  await page.keyboard.press('Escape');
});
