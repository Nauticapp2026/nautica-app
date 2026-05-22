import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/publicaciones');
});

test('muestra la página de publicaciones', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Publicaciones' })).toBeVisible();
});

test('abre el modal de nueva publicación', async ({ page }) => {
  const btn = page.getByRole('button', { name: 'Nueva publicación' });
  // Si el plan es esencial, el botón no existe — saltamos el test
  if (!(await btn.isVisible()) || !(await btn.isEnabled())) {
    test.skip();
    return;
  }
  await btn.click();
  await expect(page.getByRole('heading', { name: 'Nueva publicación' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Amarra' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cama' })).toBeVisible();
});

test('crea y elimina una publicación borrador', async ({ page }) => {
  const btn = page.getByRole('button', { name: 'Nueva publicación' });
  if (!(await btn.isVisible()) || !(await btn.isEnabled())) {
    test.skip();
    return;
  }

  await btn.click();

  // Seleccionar tipo
  await page.getByRole('button', { name: 'Amarra' }).click();

  // Dirección
  await page.getByPlaceholder('Ej: Av. del Puerto 123, Tigre').fill('Test E2E — borrar');

  // Guardar como borrador
  await page.getByRole('button', { name: 'Guardar borrador' }).click();

  // Verificar que aparece en la lista
  await expect(page.getByText('Test E2E — borrar')).toBeVisible({ timeout: 8_000 });

  // Editar y eliminar
  await page.getByRole('button', { name: 'EDITAR' }).first().click();
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('button', { name: 'Sí, eliminar' }).click();

  // Verificar que desapareció
  await expect(page.getByText('Test E2E — borrar')).not.toBeVisible({ timeout: 8_000 });
});
