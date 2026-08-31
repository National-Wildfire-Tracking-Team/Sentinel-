import { test, expect, type Page } from '@playwright/test';

// The tracker now lives at the root of the app subdomain, not "/sentinel"
// on the main domain — requires an /etc/hosts entry mapping app.localhost
// to 127.0.0.1 for local dev/test (see README).
const TRACKER_URL = 'http://app.localhost:3000/';

// ── Mock Data ──

const MOCK_RFW_1 = {
  id: 'alert-rfw-1',
  type: 'Red Flag Warning',
  headline: 'Red Flag Warning issued April 8 at 10:13AM EDT until April 8 at 8:00PM EDT by NWS Tallahassee FL',
  description: 'Critical fire weather conditions across south Georgia.',
  instruction: 'Avoid outdoor burning.',
  severity: 'Severe',
  urgency: 'Expected',
  certainty: 'Likely',
  onset: '2026-04-08T12:00:00-04:00',
  expires: '2026-12-31T20:00:00-04:00',
  senderName: 'NWS Tallahassee FL',
  affectedArea: 'Dougherty; Lee; Worth; Turner; Tift; Ben Hill; Irwin',
  response: 'Prepare',
  parameters: {},
  geocode: { UGC: ['GAZ125', 'GAZ126'] },
  geometry: {
    type: 'Polygon',
    coordinates: [[[-84.6, 31.0], [-83.2, 31.0], [-83.2, 31.9], [-84.6, 31.9], [-84.6, 31.0]]],
  },
};

const MOCK_RFW_2 = {
  id: 'alert-rfw-2',
  type: 'Red Flag Warning',
  headline: 'Red Flag Warning issued April 8 at 8:11AM EDT until April 8 at 8:00PM EDT by NWS Peachtree City GA',
  description: 'Critical fire weather conditions across central Georgia.',
  instruction: 'Follow local burn permit regulations.',
  severity: 'Severe',
  urgency: 'Expected',
  certainty: 'Likely',
  onset: '2026-04-08T12:00:00-04:00',
  expires: '2026-12-31T20:00:00-04:00',
  senderName: 'NWS Peachtree City GA',
  affectedArea: 'Central Georgia',
  response: 'Prepare',
  parameters: {},
  geocode: { UGC: ['GAZ100'] },
  geometry: {
    type: 'Polygon',
    coordinates: [[[-84.2, 31.8], [-81.8, 31.8], [-81.8, 33.2], [-84.2, 33.2], [-84.2, 31.8]]],
  },
};

const MOCK_NON_RFW = [
  {
    id: 'alert-tsw-1',
    type: 'Tornado Watch',
    headline: 'Tornado Watch issued for portions of the Ohio Valley',
    description: 'Conditions favorable for tornadoes.',
    instruction: 'Review tornado safety procedures.',
    severity: 'Extreme',
    urgency: 'Immediate',
    certainty: 'Possible',
    onset: '2026-04-08T14:00:00-04:00',
    expires: '2026-12-31T22:00:00-04:00',
    senderName: 'NWS Storm Prediction Center',
    affectedArea: 'Portions of Ohio and Indiana',
    response: 'Shelter',
    parameters: {},
    geocode: { UGC: ['OHC001'] },
    geometry: {
      type: 'Polygon',
      coordinates: [[[-84.5, 39.0], [-83.0, 39.0], [-83.0, 40.0], [-84.5, 40.0], [-84.5, 39.0]]],
    },
  },
];

function toNWSFeature(alert: typeof MOCK_RFW_1) {
  return {
    id: alert.id,
    type: 'Feature',
    geometry: alert.geometry,
    properties: {
      id: alert.id,
      event: alert.type,
      headline: alert.headline,
      description: alert.description,
      instruction: alert.instruction,
      severity: alert.severity,
      urgency: alert.urgency,
      certainty: alert.certainty,
      onset: alert.onset,
      expires: alert.expires,
      senderName: alert.senderName,
      areaDesc: alert.affectedArea,
      response: alert.response,
      parameters: alert.parameters,
      geocode: alert.geocode,
      sent: '2026-04-08T10:13:00-04:00',
      effective: '2026-04-08T10:13:00-04:00',
    },
  };
}

function buildResponse(features: ReturnType<typeof toNWSFeature>[]) {
  return { type: 'FeatureCollection', features, pagination: null };
}

// ── Helpers ──

async function mockAPIs(page: Page, features: ReturnType<typeof toNWSFeature>[]) {
  await page.route('**/api.weather.gov/alerts/active**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/geo+json',
      body: JSON.stringify(buildResponse(features)),
    }),
  );
  await page.route('**/mapservices.weather.noaa.gov/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"type":"FeatureCollection","features":[]}' }),
  );
  await page.route('**/api/fema**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/xml', body: '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>' }),
  );
  await page.route('**/arcgis/**LatestNWSZones**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"type":"FeatureCollection","features":[]}' }),
  );
  await page.route('**/api/census/counties', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"type":"FeatureCollection","features":[]}' }),
  );
  await page.route('**/nws_reference**FeatureServer**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"type":"FeatureCollection","features":[]}' }),
  );
  await page.route('**/auth/v1/session**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"session":null}' }),
  );
  await page.route('**/auth/v1/user**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/rest/v1/profiles**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' }, body: '[]' }),
  );
  await page.route('**/rest/v1/subscriptions**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-profile': 'supabase', 'content-range': '0-0/1' }, body: '[]' }),
  );
  await page.route('**/realtime/v1/websocket**', (route) =>
    route.fulfill({ status: 101, contentType: 'text/plain', body: '' }),
  );
}

async function goToTracker(page: Page, features: ReturnType<typeof toNWSFeature>[]) {
  await mockAPIs(page, features);
  await page.goto(TRACKER_URL);
  await page.waitForSelector('text=Active Incidents', { timeout: 15000 });
}

// ══════════════════════════════════════════════════════════════════════════════
// Red Flag Warning Banner
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Red Flag Warning Banner – Rendering', () => {
  test('shows banner when Red Flag Warnings exist', async ({ page }) => {
    await goToTracker(page, [toNWSFeature(MOCK_RFW_1), toNWSFeature(MOCK_RFW_2)]);
    await expect(page.locator('text=Red Flag Warning').first()).toBeVisible();
  });

  test('does not show banner when no Red Flag Warnings exist', async ({ page }) => {
    await goToTracker(page, [toNWSFeature(MOCK_NON_RFW[0])]);
    await expect(page.getByRole('button', { name: /dismiss alert banner/i })).not.toBeVisible();
  });

  test('displays the Red Flag Warning label text', async ({ page }) => {
    await goToTracker(page, [toNWSFeature(MOCK_RFW_1)]);
    await expect(page.locator('span:has-text("Red Flag Warning")').first()).toBeVisible();
  });

  test('displays the alert headline from NWS', async ({ page }) => {
    await goToTracker(page, [toNWSFeature(MOCK_RFW_1)]);
    await expect(page.getByText('NWS Tallahassee FL').first()).toBeVisible();
  });

  test('shows a dismiss button', async ({ page }) => {
    await goToTracker(page, [toNWSFeature(MOCK_RFW_1)]);
    await expect(page.getByRole('button', { name: /dismiss alert banner/i })).toBeVisible();
  });
});

test.describe('Red Flag Warning Banner – Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await goToTracker(page, [toNWSFeature(MOCK_RFW_1), toNWSFeature(MOCK_RFW_2)]);
  });

  test('shows prev/next navigation when multiple RFW alerts exist', async ({ page }) => {
    await expect(page.getByRole('button', { name: /previous alert/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /next alert/i })).toBeVisible();
  });

  test('shows counter 1/2 for two RFW alerts', async ({ page }) => {
    await expect(page.getByText('1/2')).toBeVisible();
  });

  test('next button advances to second alert', async ({ page }) => {
    await page.getByRole('button', { name: /next alert/i }).click();
    await expect(page.getByText('2/2')).toBeVisible();
    await expect(page.getByText('NWS Peachtree City GA').first()).toBeVisible();
  });

  test('next button wraps from last to first', async ({ page }) => {
    await page.getByRole('button', { name: /next alert/i }).click();
    await expect(page.getByText('2/2')).toBeVisible();
    await page.getByRole('button', { name: /next alert/i }).click();
    await expect(page.getByText('1/2')).toBeVisible();
  });

  test('previous button wraps from first to last', async ({ page }) => {
    await expect(page.getByText('1/2')).toBeVisible();
    await page.getByRole('button', { name: /previous alert/i }).click();
    await expect(page.getByText('2/2')).toBeVisible();
  });

  test('navigation is hidden when only one RFW alert exists', async ({ page }) => {
    await goToTracker(page, [toNWSFeature(MOCK_RFW_1)]);
    await expect(page.getByRole('button', { name: /previous alert/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /next alert/i })).not.toBeVisible();
  });
});

test.describe('Red Flag Warning Banner – Dismiss', () => {
  test('dismiss button hides the banner', async ({ page }) => {
    await goToTracker(page, [toNWSFeature(MOCK_RFW_1)]);
    await expect(page.getByRole('button', { name: /dismiss alert banner/i })).toBeVisible();
    await page.getByRole('button', { name: /dismiss alert banner/i }).click();
    await expect(page.getByRole('button', { name: /dismiss alert banner/i })).not.toBeVisible();
  });

  test('dismissing does not remove alerts from the sidebar feed', async ({ page }) => {
    await goToTracker(page, [toNWSFeature(MOCK_RFW_1)]);
    await page.getByRole('button', { name: /dismiss alert banner/i }).click();
    await expect(page.getByRole('button', { name: /dismiss alert banner/i })).not.toBeVisible();
    // Switch to weather tab — alerts should still be in the sidebar
    await page.getByRole('button', { name: /weather/i }).first().click();
    await expect(page.locator('text=Red Flag Warning').first()).toBeVisible();
  });
});

test.describe('Red Flag Warning Banner – Click to Detail', () => {
  test('clicking the headline opens the alert detail panel', async ({ page }) => {
    await goToTracker(page, [toNWSFeature(MOCK_RFW_1)]);
    await page.getByText('NWS Tallahassee FL').first().click();
    // Detail panel should open — look for the selected alert's headline
    await expect(
      page.locator('text=Red Flag Warning issued April 8 at 10:13AM EDT').first()
    ).toBeVisible();
  });
});

test.describe('Red Flag Warning Banner – Multiple Alerts', () => {
  test('shows the first RFW alert by default', async ({ page }) => {
    await goToTracker(page, [toNWSFeature(MOCK_RFW_1), toNWSFeature(MOCK_RFW_2)]);
    await expect(page.getByText('NWS Tallahassee FL').first()).toBeVisible();
  });

  test('switching between alerts updates the headline', async ({ page }) => {
    await goToTracker(page, [toNWSFeature(MOCK_RFW_1), toNWSFeature(MOCK_RFW_2)]);
    await expect(page.getByText('NWS Tallahassee FL').first()).toBeVisible();
    await page.getByRole('button', { name: /next alert/i }).click();
    await expect(page.getByText('NWS Peachtree City GA').first()).toBeVisible();
    // First NWS office should no longer be the primary display
    await expect(page.getByText('NWS Tallahassee FL').first()).not.toBeVisible();
  });
});
