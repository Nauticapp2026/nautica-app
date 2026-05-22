import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tareas');
});

test('carga la página con el heading correcto', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Gestión de Embarcaciones' })).toBeVisible();
});

test('muestra las columnas del kanban', async ({ page }) => {
  await expect(page.getByText('Salida programada').first()).toBeVisible();
  await expect(page.getByText('Preparar').first()).toBeVisible();
  await expect(page.getByText('Navegando').first()).toBeVisible();
  await expect(page.getByText('Guardada').first()).toBeVisible();
});

test('muestra las pestañas Operativa y Lavado', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Operativa' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lavado/ })).toBeVisible();
});

test('botón nueva tarea visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Nueva tarea' })).toBeVisible();
});
