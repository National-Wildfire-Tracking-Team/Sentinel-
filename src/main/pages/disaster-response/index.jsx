import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  ArrowRight,
  Users,
  CloudLightning,
  HeartHandshake,
  Siren,
  Waves,
  Activity,
  Wind,
  LifeBuoy,
  Stethoscope,
  DoorOpen,
} from 'lucide-react';
import PageHeader from './PageHeader';
import { getAppOrigin } from '../../../shared/utils/getAppOrigin';

const hazards = [
  { icon: Siren, label: 'Wildfire Incident' },
  { icon: Waves, label: 'Flood / Swift Water Response' },
  { icon: Activity, label: 'Earthquake Response' },
  { icon: Wind, label: 'Storm Response (Hurricane / Tornado)' },
  { icon: LifeBuoy, label: 'Search & Rescue (SAR)' },
  { icon: Stethoscope, label: 'Medical Support / First Aid' },
  { icon: DoorOpen, label: 'Evacuation Assistance' },
];

const teasers = [
  {
    to: '/disaster-response/preparedness',
    icon: CloudLightning,
    title: 'Preparedness',
    description: 'How our WXIntel and OSINT monitoring, plus certified training, get volunteers ready before a callout.',
  },
  {
    to: '/disaster-response/recovery',
    icon: HeartHandshake,
    title: 'Recovery',
    description: 'Damage assessment, after-action reviews, and resources for communities rebuilding after an incident.',
  },
  {
    to: '/disaster-response/get-involved',
    icon: Users,
    title: 'Get Involved',
    description: 'The real deployment roles you can sign up for on the NWTT Disaster Ops platform.',
  },
];

export default function DisasterResponsePage() {
  return (
    <div className="min-h-screen">
      <PageHeader
        icon={ShieldAlert}
        eyebrow="Emergency Response Ready"
        title="When Disaster Strikes,"
        highlight="We Respond."
        description="NWTT Disaster Response volunteers deploy, dispatch, and coordinate through our live Disaster Ops platform — register for emergency response events, training sessions, and volunteer opportunities in your community."
      />

      {/* ── About ── */}
      <section className="bg-sentinel-900 py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">About NWTT Disaster Response</h2>
          <p className="text-lg text-sentinel-200 leading-relaxed">
            National Wildfire Tracking Team (NWTT) Disaster Response is a dedicated
            organization committed to providing rapid, effective emergency response
            and disaster relief services to communities in need.
          </p>
        </div>
      </section>

      {/* ── All-Hazard Coverage ── */}
      <section className="bg-sentinel-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">All-Hazard Response Coverage</h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              Our dispatch system tracks and coordinates response across every major
              hazard type, not just wildfire.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {hazards.map((h) => {
              const Icon = h.icon;
              return (
                <div
                  key={h.label}
                  className="flex flex-col items-center text-center gap-3 p-5 rounded-2xl bg-sentinel-900 border border-sentinel-700"
                >
                  <div className="w-11 h-11 rounded-xl bg-fire-600/10 border border-fire-600/20 flex items-center justify-center">
                    <Icon size={20} className="text-fire-400" />
                  </div>
                  <span className="text-sentinel-200 text-sm font-medium leading-snug">{h.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Live Deployments CTA ── */}
      <section className="bg-sentinel-900 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-fire-600/20 via-sentinel-800 to-sentinel-900 border border-fire-600/20 p-10 sm:p-14 text-center">
            <div className="absolute top-0 right-0 w-72 h-72 bg-fire-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                Live Deployments
              </h2>
              <p className="text-sentinel-200 max-w-xl mx-auto mb-8">
                Browse current disaster-response deployments and sign up directly
                from your NWTT account.
              </p>
              <a
                href={`${getAppOrigin()}/deployments`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-fire-600 text-white font-semibold hover:bg-fire-500 transition-colors shadow-lg shadow-fire-600/25"
              >
                Browse Deployments
                <ArrowRight size={18} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Explore More ── */}
      <section className="bg-sentinel-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Explore the Full Response Lifecycle</h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              Effective response doesn't start when disaster strikes, and it doesn't end
              when the incident is closed.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {teasers.map((t) => {
              const Icon = t.icon;
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className="group p-6 rounded-2xl bg-sentinel-900 border border-sentinel-700 hover:border-fire-600/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-xl bg-fire-600/10 border border-fire-600/20 flex items-center justify-center group-hover:bg-fire-600/20 transition-colors">
                      <Icon size={20} className="text-fire-400" />
                    </div>
                    <ArrowRight
                      size={16}
                      className="text-sentinel-500 group-hover:text-fire-400 group-hover:translate-x-0.5 transition-all mt-1"
                    />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{t.title}</h3>
                  <p className="text-sentinel-300 text-sm leading-relaxed">{t.description}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
