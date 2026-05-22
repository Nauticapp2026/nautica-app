import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/configuracion');
});

test('carga la página de configuración', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
});

test('muestra las cinco pestañas', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Información general' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Equipo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Datos de facturación' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notificaciones' })).toBeVisible();
});

test('pestaña Equipo muestra botón agregar miembro', async ({ page }) => {
  await page.getByRole('button', { name: 'Equipo' }).click();
  await expect(page.getByRole('button', { name: 'Agregar miembro' })).toBeVisible();
});

test('pestaña Plan muestra los planes disponibles', async ({ page }) => {
  await page.getByRole('button', { name: 'Plan' }).click();
  await expect(page.locator('h3').filter({ hasText: /esencial/i })).toBeVisible();
  await expect(page.locator('h3').filter({ hasText: /premium/i })).toBeVisible();
  await expect(page.locator('h3').filter({ hasText: /élite/i })).toBeVisible();
});
