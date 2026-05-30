import { test, expect } from '@playwright/test';

/**
 * Tests que requieren credenciales reales.
 * Configura las variables de entorno antes de correr:
 *   $env:PLAYWRIGHT_TEST_EMAIL = "tu@email.com"
 *   $env:PLAYWRIGHT_TEST_PASSWORD = "tupassword"
 */

const TEST_EMAIL    = process.env.PLAYWRIGHT_TEST_EMAIL;
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD;

const tieneCredenciales = !!TEST_EMAIL && !!TEST_PASSWORD;

async function login(page: any) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(TEST_EMAIL!);
  await page.getByLabel('Contraseña').fill(TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL('/', { timeout: 20_000 });
}

test.describe('Flujos autenticados', () => {
  test.skip(!tieneCredenciales, 'Requiere PLAYWRIGHT_TEST_EMAIL y PLAYWRIGHT_TEST_PASSWORD');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard carga después del login', async ({ page }) => {
    await expect(page.getByText('InventaPro')).toBeVisible();
  });

  test('/productos carga sin errores', async ({ page }) => {
    await page.goto('/productos');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 });
  });

  test('/ventas/pos carga sin errores', async ({ page }) => {
    await page.goto('/ventas/pos');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 });
  });

  test('/ventas/historial carga sin errores', async ({ page }) => {
    await page.goto('/ventas/historial');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 });
  });

  test('/tributario/form-104 muestra el formulario IVA', async ({ page }) => {
    await page.goto('/tributario/form-104');
    await expect(page.getByText('Formulario 104')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('IVA GENERADO')).toBeVisible();
    await expect(page.getByText('LIQUIDACIÓN DEL IMPUESTO')).toBeVisible();
  });

  test('/tributario/form-103 carga sin errores', async ({ page }) => {
    await page.goto('/tributario/form-103');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 });
  });

  test('/tributario/ats carga sin errores', async ({ page }) => {
    await page.goto('/tributario/ats');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 });
  });

  test('/contabilidad/libro-diario carga sin errores', async ({ page }) => {
    await page.goto('/contabilidad/libro-diario');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 });
  });

  test('/contabilidad/balance-general carga sin errores', async ({ page }) => {
    await page.goto('/contabilidad/balance-general');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 });
  });

  test('/contabilidad/estado-resultados carga sin errores', async ({ page }) => {
    await page.goto('/contabilidad/estado-resultados');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 });
  });

  test('/facturacion/emitir carga sin errores', async ({ page }) => {
    await page.goto('/facturacion/emitir');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 });
  });
});
