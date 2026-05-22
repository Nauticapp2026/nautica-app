import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/usuarios');
});

test('carga la página con las tres pestañas', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Socios', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invitados' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Proveedores' })).toBeVisible();
});

test('muestra la tabla de socios con columnas', async ({ page }) => {
  await expect(page.getByRole('columnheader', { name: 'Socio' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Embarcación' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Estado' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Deuda' })).toBeVisible();
});

test('botones de acción visibles', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Agregar socio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importar socios' })).toBeVisible();
});

test('abre el modal de alta de socio', async ({ page }) => {
  await page.getByRole('button', { name: 'Agregar socio' }).click();
  await expect(page.getByRole('heading', { name: 'Alta de Socio' })).toBeVisible();
  await page.keyboard.press('Escape');
});
