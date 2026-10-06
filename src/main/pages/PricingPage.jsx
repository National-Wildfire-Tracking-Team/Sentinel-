/**
 * PricingPage.jsx
 * Public pricing page — Free, Sentinel Plus, and Sentinel Pro tiers.
 * Checkout runs entirely through the embedded Stripe pricing table below;
 * these cards are informational (feature comparison), not separate
 * checkout flows.
 */

import { useEffect, useState, createElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import Seo from '../../shared/components/Seo';
import {
  Flame, Check, X, ChevronRight, AlertCircle, Lock,
  Radio, Camera, MapPin, Bell, BellRing,
  Layers, Droplets, Landmark, TreePine, Clock, Ruler, MessageSquare,
  Satellite, Plane, History, Radar,
  Globe, Factory, Mountain, TrendingUp, Target, BarChart3,
  Download, FileText, LayoutDashboard, Code2, ClipboardList,
  Building2, ShieldAlert, CloudFog, Sparkles,
} from 'lucide-react';
import { useAuth } from '../../shared/context/AuthContext';
import { usePlan } from '../../shared/hooks/usePlan';
import { getAppOrigin } from '../../shared/utils/getAppOrigin';

const STRIPE_PRICING_TABLE_ID = 'prctbl_1UEajnHwBOQlFhO3wR5g06KQ';
const STRIPE_PUBLISHABLE_KEY =
  'pk_live_51SZkn9HwBOQlFhO3YobFxbtHGSnTn8pbIY9dW5lmwVdGdgOg9pBbkDSALGoAOvftveH3wnRxkMdkkJ0JuciZ6BVL00CX0sXEss';

// ─── Feature data ─────────────────────────────────────────────────────────────

const FREE_FEATURES = [
  { icon: <MapPin size={14} />,   label: '4 saved locations with notifications' },
  { icon: <Flame size={14} />,    label: 'Wildfire map' },
  { icon: <CloudFog size={14} />, label: 'Weather map' },
  { icon: <Layers size={14} />,   label: 'All-hazard map' },
  { icon: <Ruler size={14} />,    label: 'Polygon drawing tool' },
  { icon: <Ruler size={14} />,    label: 'Distance-to-hazard tool' },
  { icon: <Radio size={14} />,    label: 'NWS outlooks' },
  { icon: <Radio size={14} />,    label: 'SPC outlooks' },
  { icon: <Radio size={14} />,    label: 'WPC outlooks' },
  { icon: <Radio size={14} />,    label: 'NHC outlooks' },
  { icon: <MessageSquare size={14} />, label: 'Mesoscale discussions' },
  { icon: <Camera size={14} />,   label: 'Available live cameras' },
  { icon: <Droplets size={14} />, label: 'Water-level gauges' },
  { icon: <Radar size={14} />,    label: 'NWS radar' },
  { icon: <Radar size={14} />,    label: 'Radar composite' },
];

const PLUS_FEATURES = [
  { icon: <Flame size={14} />,     label: 'Basic fire behavior modeling — spread projection rings (+1h / +3h / +6h)' },
  { icon: <MapPin size={14} />,    label: '15 saved locations' },
  { icon: <Bell size={14} />,      label: 'Custom alert settings' },
  { icon: <CloudFog size={14} />,  label: 'Smoke layers' },
  { icon: <Satellite size={14} />, label: 'Worldwide satellite imagery' },
  { icon: <Plane size={14} />,     label: 'Aircraft tracking', soon: true },
  { icon: <History size={14} />,   label: 'Historical wildfire perimeters' },
  { icon: <History size={14} />,   label: 'Historical weather data', soon: true },
  { icon: <Radar size={14} />,     label: 'Advanced radar products' },
  { icon: <Layers size={14} />,    label: 'Additional map layers' },
  { icon: <Ruler size={14} />,     label: 'Advanced distance-to-hazard analysis' },
  { icon: <TreePine size={14} />,  label: 'Protected / public lands', soon: true },
  { icon: <Landmark size={14} />,  label: 'WUI data', soon: true },
];

const PRO_FEATURES = [
  { icon: <MapPin size={14} />,        label: 'Unlimited saved locations' },
  { icon: <BellRing size={14} />,      label: 'Advanced alert rules' },
  { icon: <Globe size={14} />,         label: 'Advanced GIS layers' },
  { icon: <Landmark size={14} />,      label: 'WUI data' },
  { icon: <Landmark size={14} />,      label: 'Land ownership' },
  { icon: <Factory size={14} />,       label: 'Critical infrastructure' },
  { icon: <TreePine size={14} />,      label: 'Protected / public lands' },
  { icon: <Mountain size={14} />,      label: 'Advanced terrain data' },
  { icon: <TrendingUp size={14} />,    label: 'Fire progression modeling' },
  { icon: <Flame size={14} />,         label: 'Fire behavior modeling' },
  { icon: <TrendingUp size={14} />,    label: 'Fire spread projections' },
  { icon: <Target size={14} />,        label: 'Advanced hotspot analysis' },
  { icon: <BarChart3 size={14} />,     label: 'Advanced incident intelligence' },
  { icon: <History size={14} />,       label: 'Historical incident analysis' },
  { icon: <Download size={14} />,      label: 'Data exports' },
  { icon: <FileText size={14} />,      label: 'GIS exports' },
  { icon: <LayoutDashboard size={14} />, label: 'Custom dashboards' },
  { icon: <Code2 size={14} />,         label: 'API access' },
  { icon: <ClipboardList size={14} />, label: 'Professional reporting tools' },
  { icon: <Building2 size={14} />,     label: 'Multi-location monitoring' },
  { icon: <ShieldAlert size={14} />,   label: 'Advanced hazard analysis' },
];

const COMPARISON_ROWS = [
  { label: 'Wildfire, weather & all-hazard map tabs', free: true,  plus: true,  pro: true },
  { label: 'Polygon + distance tools',                free: true,  plus: true,  pro: true },
  { label: 'NWS/SPC/WPC/NHC outlooks',                free: true,  plus: true,  pro: true },
  { label: 'Mesoscale discussions',                   free: true,  plus: true,  pro: true },
  { label: 'Cameras & water-level gauges',             free: true,  plus: true,  pro: true },
  { label: 'NWS radar & radar composite',              free: true,  plus: true,  pro: true },
  { label: 'Saved locations',                          free: '4',   plus: '15',  pro: '∞' },
  { label: 'Fire behavior modeling',                   free: false, plus: 'Basic', pro: 'Advanced' },
  { label: 'Smoke layers & satellite imagery',         free: false, plus: true,  pro: true },
  { label: 'Advanced radar products',                  free: false, plus: true,  pro: true },
  { label: 'Historical wildfire perimeters',           free: false, plus: true,  pro: true },
  { label: 'Custom / advanced alert rules',            free: false, plus: true,  pro: true },
  { label: 'Critical infrastructure layers',           free: false, plus: false, pro: true },
  { label: 'WUI data & land ownership',                free: false, plus: '🔜',  pro: true },
  { label: 'Protected / public lands',                 free: false, plus: '🔜',  pro: true },
  { label: 'Fire progression & spread modeling',       free: false, plus: false, pro: true },
  { label: 'Advanced hotspot & incident intelligence', free: false, plus: false, pro: true },
  { label: 'Data & GIS exports',                       free: false, plus: false, pro: true },
  { label: 'Custom dashboards',                        free: false, plus: false, pro: true },
  { label: 'API access',                                free: false, plus: false, pro: true },
  { label: 'Multi-location monitoring',                 free: false, plus: false, pro: true },
];

const FAQ = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel at any time from your account billing settings. Your plan access stays active until the end of the current billing period, then reverts to Free.',
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
    q: 'What does "coming soon" mean for Plus/Pro features?',
    a: 'Those data layers are actively in development. Subscribers get access automatically as each layer launches — no extra charge, no action needed.',
  },
  {
    q: 'Can I upgrade or switch plans mid-month?',
    a: 'Yes. Plan changes are effective immediately and prorated to the day. You\'ll only pay for the remaining days in your current billing period.',
  },
  {
    q: 'Do you offer discounts for nonprofits or public agencies?',
    a: 'Yes — reach out via the Volunteer page and we\'ll discuss discounted or complimentary access for qualifying organizations.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [searchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const { planId: currentPlanId } = usePlan();

  const [openFaq, setOpenFaq] = useState(null);

  const checkoutResult = searchParams.get('checkout');

  useEffect(() => {
    const scriptId = 'stripe-pricing-table-js';
    if (document.getElementById(scriptId)) return;
    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = 'https://js.stripe.com/v3/pricing-table.js';
    document.body.appendChild(script);
  }, []);

  const alreadyPaid = isAuthenticated && (currentPlanId === 'plus' || currentPlanId === 'pro' || currentPlanId === 'team');

  return (
    <div className="bg-sentinel-900 text-white min-h-screen">
      <Seo
        title="Pricing & Plans | Sentinel Wildfire Tracker"
        description="Compare Sentinel's Free, Plus, and Pro plans for wildfire tracking: satellite hotspots, fire perimeters, radar, alerts, and more from the National Wildfire Tracking Team."
        path="/pricing"
      />

      {/* ── Hero + plan cards ── */}
      <div className="relative overflow-hidden">

      {/* ── Hero ── */}
      <section className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-20 pb-14 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">
          The Right{' '}
          Information
          <br className="hidden sm:block" /> for Every Situation
        </h1>
        <p className="text-sentinel-300 text-lg max-w-xl mx-auto">
          Core situational awareness is free — forever. Upgrade to Plus or Pro for
          fire behavior modeling, critical infrastructure intelligence, and personalized alerts.
        </p>

        {/* Result banners */}
        {checkoutResult === 'success' && (
          <div className="mt-8 inline-flex items-center gap-2 px-5 py-3 rounded-xl
                          bg-green-950/50 border border-green-700/60 text-green-300 text-sm">
            <Check size={15} />
            Subscription activated — welcome to Sentinel!
          </div>
        )}
        {checkoutResult === 'canceled' && (
          <div className="mt-8 inline-flex items-center gap-2 px-5 py-3 rounded-xl
                          bg-sentinel-800 border border-sentinel-600 text-sentinel-300 text-sm">
            <AlertCircle size={15} />
            Checkout was canceled. No charges were made.
          </div>
        )}
      </section>

      {/* ── Plan cards (informational — checkout happens in the pricing table below) ── */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">

          {/* ── Free card ── */}
          <div className="flex flex-col rounded-2xl border border-sentinel-700 bg-sentinel-900/80 p-7">
            <span className="text-xs font-bold uppercase tracking-widest text-sentinel-400 mb-2">
              Sentinel Free
            </span>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-4xl font-extrabold text-white">$0</span>
              <span className="text-sentinel-400 text-sm ml-1">forever</span>
            </div>
            <p className="text-sentinel-400 text-sm mb-6">
              Core situational awareness for everyone.
            </p>

            <a
              href={isAuthenticated ? getAppOrigin() : `${getAppOrigin()}/register`}
              className="w-full text-center py-2.5 rounded-xl text-sm font-semibold transition-colors mb-6
                         bg-sentinel-700 hover:bg-sentinel-600 border border-sentinel-500 text-white"
            >
              {isAuthenticated && currentPlanId === 'free' ? 'Your Current Plan' : 'Get Started — Free'}
            </a>

            <ul className="space-y-2.5 flex-1">
              {FREE_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-sentinel-200">
                  <span className="shrink-0 mt-0.5 text-sentinel-400">{f.icon}</span>
                  {f.label}
                </li>
              ))}
            </ul>
          </div>

          {/* ── Plus card ── */}
          <div className="flex flex-col rounded-2xl border border-amber-500/40 bg-sentinel-900/80 p-7">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-2
                             inline-flex items-center gap-1.5">
              <Sparkles size={12} />
              Sentinel Plus
            </span>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-4xl font-extrabold text-white">$7.99</span>
              <span className="text-sentinel-400 text-sm ml-1">/month</span>
            </div>
            <p className="text-sentinel-500 text-xs mb-1">or $69.99/year</p>
            <p className="text-sentinel-400 text-sm mb-6">
              Weather enthusiasts, wildfire trackers, media, and the prepared public.
            </p>

            <p className="text-xs font-bold uppercase tracking-widest text-sentinel-400 mb-3">
              Everything in Free, plus:
            </p>
            <ul className="space-y-2.5 flex-1">
              {PLUS_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-sentinel-200">
                  <span className="shrink-0 mt-0.5 text-amber-400">{f.icon}</span>
                  <span className="flex items-center gap-2 flex-wrap">
                    {f.label}
                    {f.soon && <ComingSoon />}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Pro card ── */}
          <div className="relative flex flex-col rounded-2xl border border-fire-500
                          bg-sentinel-900/80 ring-1 ring-fire-500/25 p-7">
            <span className="text-xs font-bold uppercase tracking-widest text-fire-400 mb-2">
              Sentinel Pro
            </span>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-4xl font-extrabold text-white">$14.99</span>
              <span className="text-sentinel-400 text-sm ml-1">/month</span>
            </div>
            <p className="text-sentinel-500 text-xs mb-1">or $149/year</p>
            <p className="text-sentinel-400 text-sm mb-6">
              Field-grade intelligence for professionals and power users.
            </p>

            <p className="text-xs font-bold uppercase tracking-widest text-sentinel-400 mb-3">
              Everything in Plus, plus:
            </p>
            <ul className="space-y-2.5 flex-1">
              {PRO_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-sentinel-200">
                  <span className="shrink-0 mt-0.5 text-fire-400">{f.icon}</span>
                  {f.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      </div>

      {/* ── Checkout widget ── */}
      <section id="subscribe" className="max-w-3xl mx-auto px-4 sm:px-6 pb-20 scroll-mt-10">
        <h2 className="text-2xl font-bold text-white text-center mb-8">Choose your plan</h2>

        {alreadyPaid ? (
          <div className="rounded-2xl border border-sentinel-700 bg-sentinel-900/80 p-8 text-center">
            <Check size={28} className="text-fire-400 mx-auto mb-3" />
            <p className="text-white font-semibold mb-1">You're already subscribed</p>
            <p className="text-sentinel-400 text-sm mb-5">
              Manage or change your plan from your account settings.
            </p>
            <a
              href={`${getAppOrigin()}/account`}
              className="btn-glass-fire inline-flex px-5 py-2.5 rounded-xl text-sm font-semibold"
            >
              Manage Plan
            </a>
          </div>
        ) : isAuthenticated ? (
          createElement('stripe-pricing-table', {
            'pricing-table-id': STRIPE_PRICING_TABLE_ID,
            'publishable-key': STRIPE_PUBLISHABLE_KEY,
            'client-reference-id': user?.id,
            'customer-email': user?.email,
          })
        ) : (
          <div className="rounded-2xl border border-sentinel-700 bg-sentinel-900/80 p-8 text-center">
            <Lock className="text-sentinel-400 mx-auto mb-3" size={24} />
            <p className="text-white font-semibold mb-1">Sign in to subscribe</p>
            <p className="text-sentinel-400 text-sm mb-5">
              Create an account to link to your subscription or log in.
            </p>
            <a
              href={`${getAppOrigin()}/register`}
              className="btn-glass-fire inline-flex px-5 py-2.5 rounded-xl text-sm font-semibold"
            >
              Create Free Account
            </a>
          </div>
        )}

        <p className="text-center text-xs text-sentinel-500 mt-6">
          All prices USD · Cancel anytime · Payments processed by{' '}
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
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-sentinel-700 bg-sentinel-900">
                <th className="text-left px-3 sm:px-5 py-4 text-sentinel-300 font-semibold">Feature</th>
                <th className="px-2 sm:px-4 py-4 text-center font-semibold text-white">Free</th>
                <th className="px-2 sm:px-4 py-4 text-center font-semibold text-amber-300">Plus</th>
                <th className="px-2 sm:px-4 py-4 text-center font-semibold text-fire-300">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sentinel-800">
              {COMPARISON_ROWS.map((row, i) => (
                <tr key={i} className="hover:bg-sentinel-800/40 transition-colors">
                  <td className="px-3 sm:px-5 py-3 text-sentinel-200">{row.label}</td>
                  <td className="px-2 sm:px-4 py-3 text-center"><CellValue val={row.free} freeCol /></td>
                  <td className="px-2 sm:px-4 py-3 text-center"><CellValue val={row.plus} /></td>
                  <td className="px-2 sm:px-4 py-3 text-center"><CellValue val={row.pro} /></td>
                </tr>
              ))}
            </tbody>
          </table>
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
    return <X size={14} className="inline text-sentinel-500" />;
  }
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
  // string values like '4', '15', '∞', 'Basic', 'Advanced'
  return <span className="text-sentinel-200 font-medium">{val}</span>;
}
