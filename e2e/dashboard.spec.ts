import { test, expect } from '@playwright/test';

test('dashboard carga con las métricas', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveTitle(/NauticApp/i);
  await expect(page.getByText('Embarcaciones en guardería')).toBeVisible();
  await expect(page.getByText('Socios activos')).toBeVisible();
});

test('sidebar muestra las secciones principales', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Usuarios' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Espacios' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Publicaciones' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Facturación' })).toBeVisible();
});
