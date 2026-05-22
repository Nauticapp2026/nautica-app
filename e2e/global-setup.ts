import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

export default async function globalSetup() {
  const baseURL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error('TEST_USER_EMAIL y TEST_USER_PASSWORD son requeridos en .env.test');
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    httpCredentials: {
      username: process.env.PRELAUNCH_GATE_USER ?? '',
      password: process.env.PRELAUNCH_GATE_PASSWORD ?? '',
    },
  });

  const page = await context.newPage();

  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();

  // Esperar a que redirija al dashboard
  await page.waitForURL(`${baseURL}/dashboard`, { timeout: 15_000 });

  // Guardar sesión para todos los tests
  await context.storageState({ path: 'e2e/.auth/session.json' });

  await browser.close();
}
