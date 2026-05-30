import { test, expect } from '@playwright/test';

test.describe('Página de Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('muestra el formulario de login', async ({ page }) => {
    await expect(page.getByText('InventaPro')).toBeVisible();
    await expect(page.getByText('Iniciar sesión')).toBeVisible();
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });

  test('valida email inválido antes de enviar', async ({ page }) => {
    await page.getByLabel('Correo electrónico').fill('esto-no-es-un-email');
    await page.getByLabel('Contraseña').fill('password123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByText('Email inválido')).toBeVisible();
  });

  test('valida contraseña menor a 6 caracteres', async ({ page }) => {
    await page.getByLabel('Correo electrónico').fill('test@test.com');
    await page.getByLabel('Contraseña').fill('123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByText('Mínimo 6 caracteres')).toBeVisible();
  });

  test('muestra error con credenciales incorrectas', async ({ page }) => {
    await page.getByLabel('Correo electrónico').fill('usuario@inventapro.com');
    await page.getByLabel('Contraseña').fill('contraseña_incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByText('Credenciales incorrectas')).toBeVisible({ timeout: 10_000 });
  });

  test('botón queda deshabilitado mientras procesa', async ({ page }) => {
    await page.getByLabel('Correo electrónico').fill('test@test.com');
    await page.getByLabel('Contraseña').fill('password123');

    const btn = page.getByRole('button', { name: 'Ingresar' });
    await btn.click();
    await expect(page.getByText('Verificando...')).toBeVisible();
  });
});
