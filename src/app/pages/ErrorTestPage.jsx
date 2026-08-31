/**
 * ErrorTestPage.jsx
 * Test-only page that throws during render to trigger the ErrorBoundary.
 * Used by e2e tests to verify ErrorBoundary behavior.
 */

export default function ErrorTestPage() {
  throw new Error('Test error: triggering ErrorBoundary');
}
