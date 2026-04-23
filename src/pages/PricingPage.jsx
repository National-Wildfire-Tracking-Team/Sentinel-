/**
 * PricingPage.jsx
 * Public pricing page showing Free, Pro, and Team plans.
 * Authenticated users are redirected straight to checkout;
 * unauthenticated users are sent to register first.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Flame, Check, X, Zap, Users, Shield, MapPin,
  Bell, Layers, Code2, Star, ChevronRight, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../hooks/usePlan';
import { supabase } from '../api/supabaseClient';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceLabel: '$0',
    period: 'forever',
    tagline: 'Get started with essential wildfire tracking.',
    color: 'sentinel',
    highlight: false,
    cta: 'Get Started — Free',
    features: [
      { label: 'Live wildfire map (Sentinel)', included: true },
      { label: 'FIRMS satellite hotspot layers', included: true },
      { label: 'Weather & AQI overlays', included: true },
      { label: 'NOAA weather alerts', included: true },
      { label: 'Up to 4 saved locations', included: true },
      { label: 'Email alerts for saved locations', included: true },
      { label: 'Advanced radar & smoke layers', included: false },
      { label: 'Priority alert delivery', included: false },
      { label: 'Up to 25 saved locations', included: false },
      { label: 'API access', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 9,
    priceLabel: '$9',
    period: '/month',
    tagline: 'For individuals who need deeper situational awareness.',
    color: 'fire',
    highlight: true,
    badge: 'Most Popular',
    cta: 'Start Pro',
    features: [
      { label: 'Everything in Free', included: true },
      { label: 'Up to 25 saved locations', included: true },
      { label: 'Priority alert delivery', included: true },
      { label: 'Advanced radar & smoke layers', included: true },
      { label: 'GOES satellite imagery', included: true },
      { label: 'Historical fire data access', included: true },
      { label: 'Export location data (CSV)', included: true },
      { label: 'Team members', included: false },
      { label: 'API access', included: false },
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: 29,
    priceLabel: '$29',
    period: '/month',
    tagline: 'For agencies, crews, and organizations monitoring at scale.',
    color: 'emerald',
    highlight: false,
    cta: 'Start Team',
    features: [
      { label: 'Everything in Pro', included: true },
      { label: 'Up to 100 saved locations', included: true },
      { label: 'Up to 10 team members', included: true },
      { label: 'API access (read)', included: true },
      { label: 'Webhook alert delivery', included: true },
      { label: 'Priority support', included: true },
      { label: 'Custom branding (coming soon)', included: true },
    ],
  },
];

const FAQ = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. You can cancel at any time from your account billing settings. Your plan stays active until the end of the current billing period.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We accept all major credit and debit cards (Visa, Mastercard, Amex, Discover) via Stripe. All payments are encrypted and secure.',
  },
  {
    q: 'Is there a free trial for paid plans?',
    a: 'We don\'t currently offer a time-limited trial, but the Free plan gives you full access to the core Sentinel tracker at no cost — no credit card required.',
  },
  {
    q: 'What are "priority alerts"?',
    a: 'Priority alerts are delivered faster and with finer granularity — you receive notifications for any new hotspot or NOAA warning within your saved areas, rather than only for significant events.',
  },
  {
    q: 'Can I upgrade or downgrade my plan?',
    a: 'Yes. You can change your plan at any time from the billing portal. Upgrades are prorated immediately; downgrades take effect at the next billing cycle.',
  },
  {
    q: 'Do you offer discounts for nonprofits or public agencies?',
    a: 'Yes — reach out to us via the Volunteer page and we\'ll be happy to discuss discounted pricing for qualifying organizations.',
  },
];

export default function PricingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const { planId: currentPlanId } = usePlan();

  const [busy, setBusy] = useState(null); // plan id being checked out
  const [error, setError] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);

  // Show success/cancel toast if returning from Stripe
  const checkoutResult = searchParams.get('checkout');

  async function handleSelectPlan(planId) {
    setError(null);

    if (planId === 'free') {
      if (!isAuthenticated) {
        navigate('/register');
      } else {
        navigate('/sentinel');
      }
      return;
    }

    // Paid plan: must be logged in
    if (!isAuthenticated) {
      navigate('/register', { state: { intent: 'upgrade', plan: planId } });
      return;
    }

    // Already on this plan?
    if (planId === currentPlanId) {
      navigate('/account');
      return;
    }

    setBusy(planId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      const res = await supabase.functions.invoke('stripe-checkout', {
        body: { plan: planId },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (res.error || !res.data?.url) {
        throw new Error(res.data?.error ?? res.error?.message ?? 'Failed to start checkout.');
      }

      window.location.href = res.data.url;
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const colorMap = {
    sentinel: {
      border: 'border-sentinel-600',
      badge: '',
      btn: 'bg-sentinel-700 hover:bg-sentinel-600 text-white border border-sentinel-500',
      check: 'text-sentinel-300',
    },
    fire: {
      border: 'border-fire-500',
      badge: 'bg-fire-600 text-white',
      btn: 'bg-fire-600 hover:bg-fire-500 text-white',
      check: 'text-fire-400',
    },
    emerald: {
      border: 'border-emerald-600',
      badge: 'bg-emerald-700 text-white',
      btn: 'bg-emerald-700 hover:bg-emerald-600 text-white',
      check: 'text-emerald-400',
    },
  };

  return (
    <div className="bg-[#0a0c0e] text-white min-h-screen">

      {/* ── Hero ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                        bg-fire-600/10 border border-fire-600/20 text-fire-400 text-xs font-semibold mb-6">
          <Flame size={13} />
          Sentinel Plans
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">
          Track wildfires at every scale
        </h1>
        <p className="text-sentinel-300 text-lg max-w-xl mx-auto">
          Start free and upgrade when you need more coverage, faster alerts, or team access.
        </p>

        {/* Checkout result banners */}
        {checkoutResult === 'success' && (
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-3 rounded-xl
                          bg-green-950/50 border border-green-700/60 text-green-300 text-sm">
            <Check size={16} />
            Subscription activated! Your plan has been upgraded.
          </div>
        )}
        {checkoutResult === 'canceled' && (
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-3 rounded-xl
                          bg-sentinel-800 border border-sentinel-600 text-sentinel-300 text-sm">
            <AlertCircle size={16} />
            Checkout was canceled. You can try again below.
          </div>
        )}
        {error && (
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-3 rounded-xl
                          bg-red-950/50 border border-red-700/60 text-red-300 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </section>

      {/* ── Plan cards ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const c = colorMap[plan.color];
            const isCurrent = isAuthenticated && currentPlanId === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border bg-sentinel-900/80 p-7
                  ${plan.highlight ? `${c.border} ring-1 ring-fire-500/30` : c.border}`}
              >
                {plan.badge && (
                  <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5
                                  rounded-full text-xs font-bold ${c.badge}`}>
                    {plan.badge}
                  </div>
                )}

                {/* Header */}
                <div className="mb-6">
                  <h2 className="text-lg font-bold text-white mb-1">{plan.name}</h2>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-extrabold text-white">{plan.priceLabel}</span>
                    <span className="text-sentinel-400 text-sm">{plan.period}</span>
                  </div>
                  <p className="text-sentinel-400 text-sm">{plan.tagline}</p>
                </div>

                {/* CTA */}
                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={!!busy || isCurrent}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors mb-6
                    ${isCurrent
                      ? 'bg-sentinel-700 border border-sentinel-600 text-sentinel-400 cursor-default'
                      : c.btn}
                    disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {busy === plan.id
                    ? 'Redirecting…'
                    : isCurrent
                      ? 'Current Plan'
                      : plan.cta}
                </button>

                {/* Features */}
                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f.label} className="flex items-start gap-2.5 text-sm">
                      {f.included ? (
                        <Check size={15} className={`shrink-0 mt-0.5 ${c.check}`} />
                      ) : (
                        <X size={15} className="shrink-0 mt-0.5 text-sentinel-600" />
                      )}
                      <span className={f.included ? 'text-sentinel-200' : 'text-sentinel-500'}>
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-sentinel-500 mt-6">
          All prices in USD. Billed monthly. Cancel anytime.
          Payments securely processed by{' '}
          <a href="https://stripe.com" target="_blank" rel="noopener noreferrer"
            className="text-sentinel-400 hover:text-white underline underline-offset-2">
            Stripe
          </a>.
        </p>
      </section>

      {/* ── Feature comparison ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20">
        <h2 className="text-2xl font-bold text-white text-center mb-8">Feature comparison</h2>
        <div className="overflow-x-auto rounded-xl border border-sentinel-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sentinel-700 bg-sentinel-900">
                <th className="text-left px-5 py-3.5 text-sentinel-300 font-semibold w-1/2">Feature</th>
                {PLANS.map(p => (
                  <th key={p.id} className="px-4 py-3.5 text-center font-semibold text-white">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sentinel-800">
              {[
                { label: 'Live wildfire map', values: [true, true, true] },
                { label: 'Satellite hotspot layers', values: [true, true, true] },
                { label: 'Weather & AQI overlays', values: [true, true, true] },
                { label: 'NOAA weather alerts', values: [true, true, true] },
                { label: 'Saved locations', values: ['4', '25', '100'] },
                { label: 'Email / push alerts', values: [true, true, true] },
                { label: 'Priority alerts', values: [false, true, true] },
                { label: 'Advanced radar & smoke', values: [false, true, true] },
                { label: 'GOES satellite imagery', values: [false, true, true] },
                { label: 'Export data (CSV)', values: [false, true, true] },
                { label: 'Team members', values: ['—', '1', '10'] },
                { label: 'API access', values: [false, false, true] },
                { label: 'Priority support', values: [false, false, true] },
              ].map((row, i) => (
                <tr key={i} className="hover:bg-sentinel-800/40 transition-colors">
                  <td className="px-5 py-3 text-sentinel-200">{row.label}</td>
                  {row.values.map((val, j) => (
                    <td key={j} className="px-4 py-3 text-center">
                      {typeof val === 'boolean' ? (
                        val
                          ? <Check size={16} className={`inline ${colorMap[PLANS[j].color].check}`} />
                          : <X size={14} className="inline text-sentinel-600" />
                      ) : (
                        <span className="text-sentinel-200 font-medium">{val}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Value props ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            {
              icon: <Bell size={22} className="text-fire-400" />,
              title: 'Faster Alerts',
              desc: 'Pro and Team plans get priority delivery so you hear about new hotspots before the crowd.',
            },
            {
              icon: <Layers size={22} className="text-blue-400" />,
              title: 'Richer Layers',
              desc: 'Unlock advanced GOES satellite, high-res smoke dispersion, and RAWS station feeds.',
            },
            {
              icon: <Shield size={22} className="text-emerald-400" />,
              title: 'Reliable & Secure',
              desc: 'Enterprise-grade Supabase infrastructure. Data is encrypted at rest and in transit.',
            },
          ].map((item, i) => (
            <div key={i} className="rounded-xl bg-sentinel-900 border border-sentinel-700 p-5">
              <div className="w-10 h-10 rounded-xl bg-sentinel-800 flex items-center justify-center mb-4">
                {item.icon}
              </div>
              <h3 className="font-semibold text-white mb-1">{item.title}</h3>
              <p className="text-sentinel-400 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 pb-24">
        <h2 className="text-2xl font-bold text-white text-center mb-8">Frequently asked questions</h2>
        <div className="space-y-2">
          {FAQ.map((item, i) => (
            <div key={i} className="rounded-xl border border-sentinel-700 bg-sentinel-900 overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left
                           text-sm font-semibold text-white hover:bg-sentinel-800 transition-colors"
              >
                {item.q}
                <ChevronRight
                  size={16}
                  className={`text-sentinel-400 shrink-0 transition-transform ${openFaq === i ? 'rotate-90' : ''}`}
                />
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 text-sm text-sentinel-300 leading-relaxed border-t border-sentinel-700">
                  <p className="pt-3">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 text-center">
        <div className="rounded-2xl bg-gradient-to-br from-fire-900/40 to-sentinel-900
                        border border-fire-700/30 p-10">
          <Flame size={36} className="text-fire-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Ready to get started?</h2>
          <p className="text-sentinel-300 mb-6 max-w-md mx-auto">
            Open the live Sentinel tracker for free, or upgrade to Pro for the full experience.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate('/sentinel')}
              className="px-6 py-3 rounded-xl text-sm font-semibold bg-sentinel-700 border border-sentinel-600 text-white hover:bg-sentinel-600 transition-colors"
            >
              Open Sentinel (Free)
            </button>
            <button
              onClick={() => handleSelectPlan('pro')}
              disabled={!!busy}
              className="px-6 py-3 rounded-xl text-sm font-semibold bg-fire-600 hover:bg-fire-500 text-white transition-colors disabled:opacity-60"
            >
              {busy === 'pro' ? 'Redirecting…' : 'Start Pro — $9/mo'}
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
