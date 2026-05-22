import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/espacios');
});

test('carga la página de espacios', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Espacios' })).toBeVisible();
});

test('muestra los filtros de tipo Marina y Nave', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Marina' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nave' }).first()).toBeVisible();
});

test('muestra los filtros de búsqueda de espacios', async ({ page }) => {
  await expect(page.getByText('Eslora del barco')).toBeVisible();
  await expect(page.getByText('Solo disponibles')).toBeVisible();
});
