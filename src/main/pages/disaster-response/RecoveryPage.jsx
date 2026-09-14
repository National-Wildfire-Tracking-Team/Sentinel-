import { HeartHandshake, ClipboardCheck, FileClock, ArrowRight } from 'lucide-react';
import PageHeader from './PageHeader';
import Seo from '../../../shared/components/Seo';
import { getAppOrigin } from '../../../shared/utils/getAppOrigin';

const recoveryStages = [
  {
    icon: ClipboardCheck,
    title: 'Damage Assessment',
    description:
      'Field teams document structure damage, road and utility impacts, and access conditions to guide where recovery resources are needed most.',
  },
  {
    icon: FileClock,
    title: 'After-Action / Debrief',
    description:
      'Every deployment closes with a formal after-action review, so lessons from each incident sharpen how the next one is handled.',
  },
];

const recoveryResources = [
  {
    name: 'FEMA Disaster Assistance',
    href: 'https://www.disasterassistance.gov',
    description: 'Apply for federal individual assistance after a declared disaster.',
  },
  {
    name: 'American Red Cross',
    href: 'https://www.redcross.org/get-help',
    description: 'Emergency shelter, food, and immediate relief services.',
  },
  {
    name: 'CAL FIRE Recovery Resources',
    href: 'https://www.fire.ca.gov/incidents',
    description: 'Rebuilding guidance and incident-specific recovery information.',
  },
  {
    name: '211 Community Resources',
    href: 'https://www.211.org',
    description: 'Local referrals for housing, financial, and recovery assistance.',
  },
];

export default function RecoveryPage() {
  return (
    <div className="min-h-screen">
      <Seo
        title="Disaster Recovery Resources | NWTT"
        description="Recovery stages after a wildfire or disaster event: damage assessment, after-action debriefs, and resources coordinated by the National Wildfire Tracking Team."
        path="/disaster-response/recovery"
      />
      <PageHeader
        icon={HeartHandshake}
        eyebrow="Recovery"
        title="The Work Continues"
        highlight="After the Incident Closes."
        description="Disaster Recovery (Post-Event Operations) is its own phase of every deployment — assessing damage, closing out the incident, and pointing communities toward the resources they need to rebuild."
      />

      <section className="bg-sentinel-900 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-white">From Response to Recovery</h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              As containment increases, our teams shift from active response into two
              dedicated recovery stages.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recoveryStages.map((stage) => {
              const Icon = stage.icon;
              return (
                <div
                  key={stage.title}
                  className="group p-6 rounded-2xl bg-sentinel-800/60 border border-sentinel-700 hover:border-fire-600/40 transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-xl bg-fire-600/10 border border-fire-600/20 flex items-center justify-center mb-4 group-hover:bg-fire-600/20 transition-colors">
                    <Icon size={22} className="text-fire-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{stage.title}</h3>
                  <p className="text-sentinel-300 text-sm leading-relaxed">{stage.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Live Incident Updates ── */}
      <section className="bg-sentinel-800 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center rounded-3xl bg-gradient-to-br from-fire-600/15 via-sentinel-900 to-sentinel-900 border border-fire-600/20 p-10 sm:p-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              See Active Recovery Deployments
            </h2>
            <p className="text-sentinel-200 max-w-xl mx-auto mb-8">
              Recovery-phase deployments — damage assessment, debris clearance,
              community aid — are posted on our deployments board as they open up.
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
      </section>

      {/* ── Recovery Resources ── */}
      <section className="bg-sentinel-900 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Recovery Resources for Affected Communities
            </h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              We aren't a direct-aid organization, but we make sure displaced families
              know exactly where to turn for shelter, financial assistance, and
              rebuilding support.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recoveryResources.map((r) => (
              <a
                key={r.name}
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group p-5 rounded-2xl bg-sentinel-800/60 border border-sentinel-700 hover:border-fire-600/50 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-white font-semibold text-sm leading-snug">{r.name}</h3>
                  <ArrowRight
                    size={15}
                    className="text-sentinel-500 group-hover:text-fire-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2 mt-0.5"
                  />
                </div>
                <p className="text-sentinel-300 text-xs leading-relaxed">{r.description}</p>
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
