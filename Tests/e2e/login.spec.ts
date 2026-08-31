import { test, expect, type Page } from '@playwright/test';

const LOGIN_URL = 'http://app.localhost:3000/login';

// ── Helpers ──

async function fillEmail(page: Page, email: string) {
  await page.getByPlaceholder('you@example.com').fill(email);
}

async function fillPassword(page: Page, password: string) {
  await page.getByPlaceholder('Enter your password').fill(password);
}

async function submitLoginForm(page: Page) {
  await page.getByRole('button', { name: /log in/i }).click();
}

// ── Page Rendering ──

test.describe('LoginPage – Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL);
  });

  test('displays the Member Login heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Member Login' })).toBeVisible();
  });

  test('displays the subtitle text', async ({ page }) => {
    await expect(
      page.getByText('Sign in to access the live wildfire tracker'),
    ).toBeVisible();
  });

  test('renders email input with correct attributes', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(emailInput).toHaveAttribute('autoComplete', 'email');
  });

  test('renders password input with correct attributes', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Enter your password');
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');
  });

  test('renders the Log In submit button', async ({ page }) => {
    const button = page.getByRole('button', { name: /log in/i });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('type', 'submit');
  });

  test('renders Remember me checkbox unchecked by default', async ({ page }) => {
    const checkbox = page.getByRole('checkbox', { name: /remember me/i });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
  });

  test('renders Forgot Password link', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /forgot password/i }),
    ).toBeVisible();
  });

  test('renders Create one registration link', async ({ page }) => {
    const link = page.getByRole('link', { name: /create one/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/register');
  });

  test('renders Back to Sentinel link', async ({ page }) => {
    const link = page.getByRole('link', { name: /back to sentinel/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/');
  });
});

// ── Input Interactions ──

test.describe('LoginPage – Input Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL);
  });

  test('allows typing in the email field', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    await emailInput.fill('test@example.com');
    await expect(emailInput).toHaveValue('test@example.com');
  });

  test('allows typing in the password field', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Enter your password');
    await passwordInput.fill('secret123');
    await expect(passwordInput).toHaveValue('secret123');
  });

  test('password is masked by default', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Enter your password');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('toggling show/hide password reveals the password', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Enter your password');
    await passwordInput.fill('secret123');

    // Click the eye icon to show password
    const toggle = page.locator('button').filter({ has: page.locator('svg') }).last();
    await toggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again to hide
    await toggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('Remember me checkbox toggles on click', async ({ page }) => {
    const checkbox = page.getByRole('checkbox', { name: /remember me/i });
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  });
});

// ── Form Validation ──

test.describe('LoginPage – Form Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL);
  });

  test('email field is required', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    await expect(emailInput).toHaveAttribute('required', '');
  });

  test('password field is required', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Enter your password');
    await expect(passwordInput).toHaveAttribute('required', '');
  });

  test('password field has minLength of 6', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Enter your password');
    await expect(passwordInput).toHaveAttribute('minLength', '6');
  });

  test('browser prevents submission with empty email', async ({ page }) => {
    await page.getByPlaceholder('Enter your password').fill('password123');
    await submitLoginForm(page);
    // Should still be on login page (HTML5 validation prevents submit)
    await expect(page).toHaveURL(/\/login/);
  });

  test('browser prevents submission with empty password', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await submitLoginForm(page);
    await expect(page).toHaveURL(/\/login/);
  });
});

// ── Authentication – Invalid Credentials ──

test.describe('LoginPage – Invalid Credentials', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL);
  });

  test('shows error message on invalid login credentials', async ({ page }) => {
    // Intercept Supabase auth to return an error
    await page.route('**/auth/v1/token?grant_type=password', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        }),
      }),
    );

    await fillEmail(page, 'wrong@example.com');
    await fillPassword(page, 'wrongpass');
    await submitLoginForm(page);

    await expect(
      page.getByText(/invalid credentials/i),
    ).toBeVisible();
  });

  test('shows error message for unconfirmed email', async ({ page }) => {
    await page.route('**/auth/v1/token?grant_type=password', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'email_not_confirmed',
          error_description: 'Email not confirmed',
        }),
      }),
    );

    await fillEmail(page, 'unconfirmed@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);

    await expect(
      page.getByText(/confirm your email/i),
    ).toBeVisible();
  });

  test('shows generic error for other failures', async ({ page }) => {
    await page.route('**/auth/v1/token**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'server_error',
          error_description: 'Something went wrong',
        }),
      }),
    );

    await fillEmail(page, 'user@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);

    // Supabase client may present the error differently; just verify an error is shown
    await expect(
      page.locator('.bg-red-950\\/40, [class*="red"]').first(),
    ).toBeVisible();
  });
});

// ── Authentication – Successful Login ──

test.describe('LoginPage – Successful Login', () => {
  async function mockSupabaseAuth(
    page: import('@playwright/test').Page,
    userId: string,
    userEmail: string,
  ) {
    // Mock token endpoint
    await page.route('**/auth/v1/token**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: { id: userId, email: userEmail, role: 'authenticated' },
        }),
      }),
    );

    // Mock session/user check endpoints that Supabase calls after login
    await page.route('**/auth/v1/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: userId,
          email: userEmail,
          role: 'authenticated',
        }),
      }),
    );

    await page.route('**/auth/v1/session**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: { id: userId, email: userEmail, role: 'authenticated' },
        }),
      }),
    );

    // Mock profiles query for role check (both select and role patterns)
    await page.route('**/rest/v1/profiles**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' },
        body: JSON.stringify([{ id: userId, role: 'public' }]),
      }),
    );

    // Mock subscriptions query
    await page.route('**/rest/v1/subscriptions**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' },
        body: JSON.stringify([{ plan: 'free', status: 'active', cancel_at_period_end: false }]),
      }),
    );
  }

  test('redirects public user to the app root after login', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await mockSupabaseAuth(page, 'user-123', 'public@example.com');
    await fillEmail(page, 'public@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);
    await expect(page).toHaveURL(/^http:\/\/app\.localhost:3000\/$/);
  });

  test('redirects reporter to /reporter-dashboard after login', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.route('**/auth/v1/token**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: { id: 'reporter-456', email: 'reporter@example.com', role: 'authenticated' },
        }),
      }),
    );
    await page.route('**/auth/v1/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'reporter-456', email: 'reporter@example.com', role: 'authenticated' }),
      }),
    );
    await page.route('**/auth/v1/session**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token', token_type: 'bearer', expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: { id: 'reporter-456', email: 'reporter@example.com', role: 'authenticated' },
        }),
      }),
    );
    await page.route('**/rest/v1/profiles**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' },
        body: JSON.stringify([{ id: 'reporter-456', role: 'reporter' }]),
      }),
    );
    await page.route('**/rest/v1/subscriptions**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' },
        body: JSON.stringify([{ plan: 'free', status: 'active', cancel_at_period_end: false }]),
      }),
    );

    await fillEmail(page, 'reporter@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);

    await expect(page).toHaveURL(/\/reporter-dashboard/);
  });

  test('redirects admin to /reporter-dashboard after login', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.route('**/auth/v1/token**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: { id: 'admin-789', email: 'admin@example.com', role: 'authenticated' },
        }),
      }),
    );
    await page.route('**/auth/v1/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'admin-789', email: 'admin@example.com', role: 'authenticated' }),
      }),
    );
    await page.route('**/auth/v1/session**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token', token_type: 'bearer', expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: { id: 'admin-789', email: 'admin@example.com', role: 'authenticated' },
        }),
      }),
    );
    await page.route('**/rest/v1/profiles**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' },
        body: JSON.stringify([{ id: 'admin-789', role: 'admin' }]),
      }),
    );
    await page.route('**/rest/v1/subscriptions**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' },
        body: JSON.stringify([{ plan: 'free', status: 'active', cancel_at_period_end: false }]),
      }),
    );

    await fillEmail(page, 'admin@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);

    await expect(page).toHaveURL(/\/reporter-dashboard/);
  });
});

// ── Forgot Password Flow ──

test.describe('LoginPage – Forgot Password', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL);
  });

  test('clicking Forgot Password switches to reset form', async ({ page }) => {
    await page.getByRole('button', { name: /forgot password/i }).click();

    await expect(
      page.getByRole('heading', { name: 'Reset Password' }),
    ).toBeVisible();
    await expect(
      page.getByText(/enter your email and we/i),
    ).toBeVisible();
  });

  test('reset form has Back to login button', async ({ page }) => {
    await page.getByRole('button', { name: /forgot password/i }).click();

    const backBtn = page.getByRole('button', { name: /back to login/i });
    await expect(backBtn).toBeVisible();

    await backBtn.click();
    await expect(
      page.getByRole('heading', { name: 'Member Login' }),
    ).toBeVisible();
  });

  test('pre-fills reset email from login email field', async ({ page }) => {
    await fillEmail(page, 'user@example.com');
    await page.getByRole('button', { name: /forgot password/i }).click();

    const resetInput = page.getByPlaceholder('you@example.com');
    await expect(resetInput).toHaveValue('user@example.com');
  });

  test('sends reset link and shows success message', async ({ page }) => {
    await page.route('**/auth/v1/recover', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      }),
    );

    await page.getByRole('button', { name: /forgot password/i }).click();
    await page.getByPlaceholder('you@example.com').fill('user@example.com');
    await page.getByRole('button', { name: /send reset link/i }).click();

    await expect(
      page.getByText(/reset link sent/i),
    ).toBeVisible();
  });

  test('shows error on reset failure', async ({ page }) => {
    await page.route('**/auth/v1/recover', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_request',
          error_description: 'Unable to process request',
        }),
      }),
    );

    await page.getByRole('button', { name: /forgot password/i }).click();
    await page.getByPlaceholder('you@example.com').fill('bad@example.com');
    await page.getByRole('button', { name: /send reset link/i }).click();

    await expect(
      page.getByText(/unable to process request/i),
    ).toBeVisible();
  });
});

// ── Navigation ──

test.describe('LoginPage – Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL);
  });

  test('Create one link navigates to /register', async ({ page }) => {
    const link = page.getByRole('link', { name: /create one/i });
    await link.click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('Back to Sentinel link navigates to app root', async ({ page }) => {
    const link = page.getByRole('link', { name: /back to sentinel/i });
    await link.click();
    await expect(page).toHaveURL('http://app.localhost:3000/');
  });
});

// ── Submit Button States ──

test.describe('LoginPage – Submit Button States', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL);
  });

  test('shows "Signing in…" text while request is in progress', async ({ page }) => {
    // Delay the response to observe loading state
    await page.route('**/auth/v1/token?grant_type=password', (route) =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Invalid login credentials',
              }),
            }),
          1500,
        ),
      ),
    );

    await fillEmail(page, 'test@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);

    await expect(
      page.getByRole('button', { name: /signing in/i }),
    ).toBeVisible();
  });

  test('button returns to "Log In" after request completes', async ({ page }) => {
    await page.route('**/auth/v1/token?grant_type=password', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        }),
      }),
    );

    await fillEmail(page, 'test@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);

    // Wait for error to appear (request completed)
    await expect(page.getByText(/invalid credentials/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /log in$/i }),
    ).toBeVisible();
  });
});

// ── Post-Login Error Resilience ──

test.describe('LoginPage – Post-Login Error Resilience', () => {
  async function mockSuccessfulAuth(
    page: import('@playwright/test').Page,
    userId: string,
    userEmail: string,
  ) {
    await page.route('**/auth/v1/token**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: { id: userId, email: userEmail, role: 'authenticated' },
        }),
      }),
    );

    await page.route('**/auth/v1/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: userId, email: userEmail, role: 'authenticated' }),
      }),
    );

    await page.route('**/auth/v1/session**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: { id: userId, email: userEmail, role: 'authenticated' },
        }),
      }),
    );
  }

  test('reaches the app root when profiles endpoint returns 500 after auth', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await mockSuccessfulAuth(page, 'user-err-1', 'profilefail@example.com');

    // Mock profiles endpoint to return 500
    await page.route('**/rest/v1/profiles**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal server error' }),
      }),
    );

    // Mock subscriptions endpoint to return empty
    await page.route('**/rest/v1/subscriptions**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' },
        body: JSON.stringify([]),
      }),
    );

    await fillEmail(page, 'profilefail@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);

    // Should still reach the app root (fallback to 'public' role), NOT the error boundary
    await expect(page).toHaveURL(/^http:\/\/app\.localhost:3000\/$/, { timeout: 10000 });
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('reaches the app root when profiles endpoint times out after auth', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await mockSuccessfulAuth(page, 'user-err-2', 'timeout@example.com');

    // Mock profiles endpoint to hang (simulate timeout)
    await page.route('**/rest/v1/profiles**', (route) =>
      new Promise((resolve) =>
        setTimeout(() => resolve(route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' },
          body: JSON.stringify([{ id: 'user-err-2', role: 'public' }]),
        })), 5000),
      ),
    );

    await page.route('**/rest/v1/subscriptions**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' },
        body: JSON.stringify([{ plan: 'free', status: 'active', cancel_at_period_end: false }]),
      }),
    );

    await fillEmail(page, 'timeout@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);

    // Should reach the app root — timeout should not crash the app
    await expect(page).toHaveURL(/^http:\/\/app\.localhost:3000\/$/, { timeout: 15000 });
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('does not show ErrorBoundary after normal successful login', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await mockSuccessfulAuth(page, 'user-ok-1', 'success@example.com');

    await page.route('**/rest/v1/profiles**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' },
        body: JSON.stringify([{ id: 'user-ok-1', role: 'public' }]),
      }),
    );

    await page.route('**/rest/v1/subscriptions**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' },
        body: JSON.stringify([{ plan: 'free', status: 'active', cancel_at_period_end: false }]),
      }),
    );

    await fillEmail(page, 'success@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);

    await expect(page).toHaveURL(/^http:\/\/app\.localhost:3000\/$/);
    // Verify ErrorBoundary is NOT shown
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
    await expect(page.getByText('An unexpected error occurred')).not.toBeVisible();
  });
});

// ── Inline Error Feedback (Auth Failures) ──

test.describe('LoginPage – Inline Error Feedback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL);
  });

  test('shows inline error (not ErrorBoundary) when auth returns 500', async ({ page }) => {
    await page.route('**/auth/v1/token**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'server_error',
          error_description: 'Internal server error',
        }),
      }),
    );

    await fillEmail(page, 'user@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);

    // Inline error should appear on the login page
    await expect(
      page.locator('.bg-red-950\\/40, [class*="red"]').first(),
    ).toBeVisible();
    // ErrorBoundary should NOT trigger
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
    // User should still be on the login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows inline error when auth times out', async ({ page }) => {
    // Simulate a timeout by delaying the response beyond a reasonable limit
    await page.route('**/auth/v1/token**', (route) =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            route.fulfill({
              status: 408,
              contentType: 'application/json',
              body: JSON.stringify({
                error: 'timeout',
                error_description: 'Request timed out',
              }),
            }),
          3000,
        ),
      ),
    );

    await fillEmail(page, 'user@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);

    // Should show inline error, not ErrorBoundary
    await expect(
      page.locator('.bg-red-950\\/40, [class*="red"]').first(),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows connectivity error when auth request is aborted (network error)', async ({ page }) => {
    await page.route('**/auth/v1/token**', (route) =>
      route.abort('connectionrefused'),
    );

    await fillEmail(page, 'user@example.com');
    await fillPassword(page, 'password123');
    await submitLoginForm(page);

    // Should show network-specific inline error, not ErrorBoundary
    await expect(
      page.getByText(/unable to connect/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('stays on login page after auth failure (no redirect to the app)', async ({ page }) => {
    await page.route('**/auth/v1/token**', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        }),
      }),
    );

    await fillEmail(page, 'bad@example.com');
    await fillPassword(page, 'wrongpass');
    await submitLoginForm(page);

    await expect(page.getByText(/invalid credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

// ── Error Boundary Login-Aware Recovery ──

test.describe('ErrorBoundary – Login-Aware Recovery', () => {
  test('shows login-aware message when user has active session', async ({ page }) => {
    // Set auth cookie before navigating — this persists across full-page navigations
    await page.context().addCookies([{
      name: 'sentinel_auth',
      value: '1',
      domain: 'app.localhost',
      path: '/',
    }]);

    // Navigate to the error test page — this throws and triggers ErrorBoundary
    await page.goto('http://app.localhost:3000/error-test');

    // ErrorBoundary should detect the session and show login-aware message
    await expect(
      page.getByText(/your sign-in was successful/i),
    ).toBeVisible({ timeout: 10000 });

    // Should also show the heading
    await expect(
      page.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeVisible();
  });

  test('shows generic message when user has no session', async ({ page }) => {
    // Ensure no sb- auth tokens exist (don't set any)
    await page.goto('http://app.localhost:3000/error-test');

    // ErrorBoundary should show generic message (no session detected)
    await expect(
      page.getByText(/an unexpected error occurred/i),
    ).toBeVisible({ timeout: 10000 });

    // Should NOT show login-aware message
    await expect(
      page.getByText(/your sign-in was successful/i),
    ).not.toBeVisible();
  });

  test('ErrorBoundary recovery navigates to the app root', async ({ page }) => {
    // Set auth cookie
    await page.context().addCookies([{
      name: 'sentinel_auth',
      value: '1',
      domain: 'app.localhost',
      path: '/',
    }]);

    // Trigger ErrorBoundary
    await page.goto('http://app.localhost:3000/error-test');
    await expect(
      page.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeVisible({ timeout: 10000 });

    // Click "Go to Live Map" — should navigate to the app root
    await page.getByRole('button', { name: /go to live map/i }).click();
    await expect(page).toHaveURL(/^http:\/\/app\.localhost:3000\/$/);
  });
});
