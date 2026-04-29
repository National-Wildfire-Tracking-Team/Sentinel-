/**
 * PricingPage.jsx
 * Public pricing page — Free Tier (situational awareness) and
 * Sentinel Pro (field intelligence, $9.99/month).
 */

import { useState, useEffect, createElement } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Flame, Check, X, Zap, ChevronRight, AlertCircle,
  Radio, Wind, Camera, Plane, MapPin, Bell,
  Layers, Shield, AlertTriangle, Building2, Train,
  Bolt, Droplets, Factory, Cross, GraduationCap,
  Users, Landmark, TreePine, Ban, Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../hooks/usePlan';
import { supabase } from '../api/supabaseClient';

// ─── Feature data ─────────────────────────────────────────────────────────────

const FREE_FEATURES = [
  { icon: <Layers size={14} />,       label: 'Wildfire, weather, and all-hazard map tabs' },
  { icon: <Radio size={14} />,        label: 'NWS alerts, radar, and satellite imagery' },
  { icon: <Wind size={14} />,         label: 'AQI and wind data' },
  { icon: <MapPin size={14} />,       label: 'Up to 4 saved locations with basic alerts' },
  { icon: <Camera size={14} />,       label: 'Cameras and aircraft when available' },
];

const PRO_INFRA_LIVE = [
  { icon: <AlertTriangle size={14} />, label: 'Highways & evacuation routes' },
  { icon: <Train size={14} />,         label: 'Railroads' },
  { icon: <Bolt size={14} />,          label: 'Powerlines (nationwide)' },
  { icon: <Droplets size={14} />,      label: 'Pipelines (nationwide)' },
];

const PRO_INFRA_SOON = [
  { icon: <Factory size={14} />,      label: 'Major manufacturing sites' },
  { icon: <Factory size={14} />,      label: 'Chemical manufacturing facilities' },
  { icon: <Cross size={14} />,         label: 'Hospitals & medical centers' },
  { icon: <GraduationCap size={14} />, label: 'Schools & universities' },
  { icon: <Users size={14} />,        label: 'Mass gathering locations (stadiums, venues, fairs)' },
];

const PRO_GOVT_SOON = [
  { icon: <Landmark size={14} />,    label: 'Tribal nations' },
  { icon: <TreePine size={14} />,    label: 'National Parks' },
  { icon: <TreePine size={14} />,    label: 'Bureau of Land Management (BLM)' },
  { icon: <TreePine size={14} />,    label: 'US Forest Service land' },
  { icon: <Ban size={14} />,         label: 'Temporary Flight Restrictions (TFRs)' },
  { icon: <Flame size={14} />,       label: 'Fire Behavior Modeling' },
];

const FAQ = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel at any time from your account billing settings. Your Pro access stays active until the end of the current billing period, then reverts to Free.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'All major credit and debit cards (Visa, Mastercard, Amex, Discover) via Stripe. All payments are encrypted and PCI-compliant.',
  },
  {
    q: 'Is the Free tier really permanent?',
    a: 'Yes. The Free tier is not a trial — it\'s a permanent, no-credit-card-required plan designed to keep core situational awareness accessible to everyone.',
  },
  {
    q: 'What does "coming soon" mean for Pro layers?',
    a: 'Those data layers are actively in development. Pro subscribers will get access automatically as each layer launches — no extra charge, no action needed.',
  },
  {
    q: 'Can I upgrade mid-month?',
    a: 'Yes. Upgrades are effective immediately and prorated to the day. You\'ll only pay for the remaining days in your current billing period.',
  },
  {
    q: 'Do you offer discounts for nonprofits or public agencies?',
    a: 'Yes — reach out via the Volunteer page and we\'ll discuss discounted or complimentary access for qualifying organizations.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { planId: currentPlanId } = usePlan();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);

  const checkoutResult = searchParams.get('checkout');

  useEffect(() => {
    const scriptId = 'stripe-buy-button-js';
    if (document.getElementById(scriptId)) return;
    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = 'https://js.stripe.com/v3/buy-button.js';
    document.body.appendChild(script);
  }, []);

  async function handleUpgradePro() {
    setError(null);

    if (!isAuthenticated) {
      navigate('/register', { state: { intent: 'upgrade', plan: 'pro' } });
      return;
    }

    if (currentPlanId === 'pro' || currentPlanId === 'team') {
      navigate('/account');
      return;
    }

    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('stripe-checkout', {
        body: { plan: 'pro' },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      if (res.error || !res.data?.url) {
        throw new Error(res.data?.error ?? res.error?.message ?? 'Failed to start checkout.');
      }
      window.location.href = res.data.url;
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const alreadyPro = isAuthenticated && (currentPlanId === 'pro' || currentPlanId === 'team');

  return (
    <div className="bg-[#0a0c0e] text-white min-h-screen">

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-20 pb-14 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                        bg-fire-600/10 border border-fire-600/20 text-fire-400 text-xs font-semibold mb-6">
          <Flame size={13} />
          Sentinel Plans
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">
          The right intelligence<br className="hidden sm:block" /> for every situation
        </h1>
        <p className="text-sentinel-300 text-lg max-w-xl mx-auto">
          Core situational awareness is free — forever. Upgrade to Pro for field-grade
          infrastructure intelligence and personalized location alerts.
        </p>

        {/* Result banners */}
        {checkoutResult === 'success' && (
          <div className="mt-8 inline-flex items-center gap-2 px-5 py-3 rounded-xl
                          bg-green-950/50 border border-green-700/60 text-green-300 text-sm">
            <Check size={15} />
            Subscription activated — welcome to Sentinel Pro!
          </div>
        )}
        {checkoutResult === 'canceled' && (
          <div className="mt-8 inline-flex items-center gap-2 px-5 py-3 rounded-xl
                          bg-sentinel-800 border border-sentinel-600 text-sentinel-300 text-sm">
            <AlertCircle size={15} />
            Checkout was canceled. No charges were made.
          </div>
        )}
        {error && (
          <div className="mt-8 inline-flex items-center gap-2 px-5 py-3 rounded-xl
                          bg-red-950/50 border border-red-700/60 text-red-300 text-sm">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
      </section>

      {/* ── Plan cards ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">

          {/* ── Free card ── */}
          <div className="flex flex-col rounded-2xl border border-sentinel-700 bg-sentinel-900/80 p-8">
            <div className="mb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-sentinel-400">
                Free Tier — Situational Awareness
              </span>
            </div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-5xl font-extrabold text-white">$0</span>
              <span className="text-sentinel-400 text-sm ml-1">permanent free tier</span>
            </div>
            <p className="text-sentinel-400 text-sm mb-6">
              User acquisition, trust building, and broad accessibility.
            </p>

            <button
              onClick={() => isAuthenticated ? navigate('/sentinel') : navigate('/register')}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors mb-8
                         bg-sentinel-700 hover:bg-sentinel-600 border border-sentinel-500 text-white"
            >
              {isAuthenticated && currentPlanId === 'free' ? 'Your Current Plan' : 'Get Started — Free'}
            </button>

            <p className="text-xs font-bold uppercase tracking-widest text-sentinel-400 mb-4">
              Included Features
            </p>
            <ul className="space-y-3 flex-1">
              {FREE_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-sentinel-200">
                  <span className="shrink-0 mt-0.5 text-sentinel-400">{f.icon}</span>
                  {f.label}
                </li>
              ))}
            </ul>
          </div>

          {/* ── Pro card ── */}
          <div className="relative flex flex-col rounded-2xl border border-fire-500
                          bg-sentinel-900/80 ring-1 ring-fire-500/25 p-8">
            {/* Badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1
                            rounded-full bg-fire-600 text-white text-xs font-bold whitespace-nowrap">
              Most Popular
            </div>

            <div className="mb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-fire-400">
                Sentinel Pro — Field Intelligence
              </span>
            </div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-5xl font-extrabold text-white">$9.99</span>
              <span className="text-sentinel-400 text-sm ml-1">/month</span>
            </div>
            <p className="text-sentinel-400 text-sm mb-6">
              Weather enthusiasts, wildfire trackers, media, and the prepared public.
            </p>

            {alreadyPro ? (
              <button
                type="button"
                disabled
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors mb-8
                  bg-sentinel-700 border border-sentinel-600 text-sentinel-400 cursor-default"
              >
                Current Plan
              </button>
            ) : (
              <div className="w-full flex justify-center mb-8 min-h-[42px] items-center">
                {createElement('stripe-buy-button', {
                  'buy-button-id': 'buy_btn_1TRMm6HwBOQlFhO30vGZ8D9I',
                  'publishable-key':
                    'pk_live_51SZkn9HwBOQlFhO3YobFxbtHGSnTn8pbIY9dW5lmwVdGdgOg9pBbkDSALGoAOvftveH3wnRxkMdkkJ0JuciZ6BVL00CX0sXEss',
                })}
              </div>
            )}

            {/* All Free features */}
            <p className="text-xs font-bold uppercase tracking-widest text-sentinel-400 mb-3">
              All Free features, plus:
            </p>

            {/* Live infrastructure layers */}
            <p className="text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2 mt-1">
              Critical Infrastructure Layers
            </p>
            <ul className="space-y-2.5 mb-4">
              {PRO_INFRA_LIVE.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-sentinel-200">
                  <span className="shrink-0 mt-0.5 text-fire-400">{f.icon}</span>
                  {f.label}
                </li>
              ))}
              {PRO_INFRA_SOON.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-sentinel-400">
                  <span className="shrink-0 mt-0.5 text-sentinel-500">{f.icon}</span>
                  <span className="flex items-center gap-2 flex-wrap">
                    {f.label}
                    <ComingSoon />
                  </span>
                </li>
              ))}
            </ul>

            {/* Government & land management */}
            <p className="text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-2">
              Government &amp; Land Management
            </p>
            <ul className="space-y-2.5">
              {PRO_GOVT_SOON.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-sentinel-400">
                  <span className="shrink-0 mt-0.5 text-sentinel-500">{f.icon}</span>
                  <span className="flex items-center gap-2 flex-wrap">
                    {f.label}
                    <ComingSoon />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-center text-xs text-sentinel-500 mt-6">
          All prices USD · Billed monthly · Cancel anytime ·
          Payments processed by{' '}
          <a href="https://stripe.com" target="_blank" rel="noopener noreferrer"
            className="text-sentinel-400 hover:text-white underline underline-offset-2">
            Stripe
          </a>
        </p>
      </section>

      {/* ── Feature comparison table ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <h2 className="text-2xl font-bold text-white text-center mb-8">Plan comparison</h2>
        <div className="overflow-x-auto rounded-xl border border-sentinel-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sentinel-700 bg-sentinel-900">
                <th className="text-left px-5 py-4 text-sentinel-300 font-semibold w-3/5">Feature</th>
                <th className="px-4 py-4 text-center font-semibold text-white">Free</th>
                <th className="px-4 py-4 text-center font-semibold text-fire-300">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sentinel-800">
              {[
                { label: 'Wildfire, weather & all-hazard map tabs',    free: true,  pro: true  },
                { label: 'NWS alerts, radar & satellite imagery',       free: true,  pro: true  },
                { label: 'AQI and wind data',                           free: true,  pro: true  },
                { label: 'Cameras & aircraft (when available)',         free: true,  pro: true  },
                { label: 'Saved locations',                             free: '4',   pro: '25'  },
                { label: 'Basic location alerts',                       free: true,  pro: true  },
                { label: 'Priority alert delivery',                     free: false, pro: true  },
                { label: 'Evacuation routes',                           free: false, pro: true  },
                { label: 'Highways layer',                              free: false, pro: true  },
                { label: 'Railroads layer',                             free: false, pro: true  },
                { label: 'Powerlines — nationwide',                     free: false, pro: true  },
                { label: 'Pipelines — nationwide',                      free: false, pro: true  },
                { label: 'Hospitals & medical centers',                 free: false, pro: '🔜'  },
                { label: 'Schools & universities',                      free: false, pro: '🔜'  },
                { label: 'Mass gathering locations',                    free: false, pro: '🔜'  },
                { label: 'Chemical & manufacturing facilities',         free: false, pro: '🔜'  },
                { label: 'Tribal nations',                              free: false, pro: '🔜'  },
                { label: 'National Parks / BLM / Forest Service',       free: false, pro: '🔜'  },
                { label: 'Temporary Flight Restrictions (TFRs)',        free: false, pro: '🔜'  },
                { label: 'Fire Behavior Modeling',                      free: false, pro: '🔜'  },
              ].map((row, i) => (
                <tr key={i} className="hover:bg-sentinel-800/40 transition-colors">
                  <td className="px-5 py-3 text-sentinel-200">{row.label}</td>
                  <td className="px-4 py-3 text-center">
                    <CellValue val={row.free} freeCol />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CellValue val={row.pro} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Value props ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            {
              icon: <Shield size={22} className="text-fire-400" />,
              title: 'Infrastructure Awareness',
              desc: 'Know which power lines, pipelines, and roads are in the fire\'s path before the news does.',
            },
            {
              icon: <Bell size={22} className="text-amber-400" />,
              title: 'Personal Alerts',
              desc: 'Pro alerts are delivered with finer granularity and higher priority for your saved locations.',
            },
            {
              icon: <Layers size={22} className="text-blue-400" />,
              title: 'Expanding Layer Library',
              desc: 'Every new Pro data layer — government land, TFRs, fire modeling — ships automatically to your account.',
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
                <div className="px-5 pb-5 text-sm text-sentinel-300 leading-relaxed border-t border-sentinel-700">
                  <p className="pt-4">{item.a}</p>
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
          <h2 className="text-2xl font-bold text-white mb-3">Stay ahead of the fire</h2>
          <p className="text-sentinel-300 mb-6 max-w-md mx-auto">
            Open the live Sentinel tracker for free, or unlock Pro for infrastructure intelligence,
            priority alerts, and every new layer as it ships.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate('/sentinel')}
              className="px-6 py-3 rounded-xl text-sm font-semibold bg-sentinel-700 border
                         border-sentinel-600 text-white hover:bg-sentinel-600 transition-colors"
            >
              Open Sentinel — Free
            </button>
            <button
              onClick={handleUpgradePro}
              disabled={busy || alreadyPro}
              className="px-6 py-3 rounded-xl text-sm font-semibold bg-fire-600 hover:bg-fire-500
                         text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? 'Redirecting…' : alreadyPro ? 'Manage Plan' : 'Start Pro — $9.99/mo'}
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function ComingSoon() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
                     font-bold bg-sentinel-700/80 border border-sentinel-600 text-sentinel-300
                     uppercase tracking-wide">
      <Clock size={8} />
      Soon
    </span>
  );
}

function CellValue({ val, freeCol }) {
  if (val === true) {
    return (
      <Check
        size={15}
        className={`inline ${freeCol ? 'text-sentinel-300' : 'text-fire-400'}`}
      />
    );
  }
  if (val === false) {
    return <X size={14} className="inline text-sentinel-700" />;
  }
  // string values like '4', '25', '🔜'
  if (val === '🔜') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
                       font-bold bg-sentinel-700/80 border border-sentinel-600
                       text-sentinel-300 uppercase tracking-wide">
        <Clock size={8} />
        Soon
      </span>
    );
  }
  return <span className="text-sentinel-200 font-medium">{val}</span>;
}
