import { test, expect } from '@playwright/test';

// Este test corre sin sesión guardada
test.use({ storageState: { cookies: [], origins: [] } });

test('login con credenciales incorrectas muestra error', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill('noexiste@test.com');
  await page.locator('input[name="password"]').fill('contraseñamala123');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.locator('p.text-red-500').first()).toBeVisible({ timeout: 10_000 });
});

test('acceder a /dashboard sin sesión redirige al login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
});
