import { Link } from 'react-router-dom';
import Seo from '../../../shared/components/Seo';
import {
  CloudLightning,
  ArrowRight,
  Radar,
  Satellite,
  GraduationCap,
  ClipboardList,
} from 'lucide-react';
import PageHeader from './PageHeader';

const capabilities = [
  {
    icon: Radar,
    title: 'WXIntel Activation',
    description:
      'Weather intelligence monitoring that flags rising fire weather, storm, and flood risk so response teams can be staged before conditions turn critical.',
  },
  {
    icon: Satellite,
    title: 'OSINT Activation',
    description:
      'Open-source intelligence gathering that cross-references scanner traffic, agency releases, and public reports into a single verified picture.',
  },
  {
    icon: GraduationCap,
    title: 'Certified Training',
    description:
      'Volunteers complete required and role-based training in emergency response and disaster management before they take a deployment.',
  },
  {
    icon: ClipboardList,
    title: 'Preparedness Planning',
    description:
      'Ongoing planning work that keeps branch readiness, equipment checks, and staging procedures current ahead of the next activation.',
  },
];

export default function PreparednessPage() {
  return (
    <div className="min-h-screen">
      <Seo
        title="Wildfire Preparedness Guide | NWTT"
        description="Preparedness guidance from the National Wildfire Tracking Team: how WXIntel activation, training, and planning tools help communities get ready before a wildfire starts."
        path="/disaster-response/preparedness"
      />
      <PageHeader
        icon={CloudLightning}
        eyebrow="Preparedness"
        title="The Best Response"
        highlight="Starts Before the Callout."
        description="Advance warning and trained volunteers give responders and communities the time they need to act. Our preparedness work is built to buy back that time."
      />

      <section className="bg-sentinel-900 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-white">Ready Before the Alert</h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              Preparedness runs on two tracks: constant intelligence monitoring, and a
              trained, certified volunteer base ready to deploy.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {capabilities.map((cap) => {
              const Icon = cap.icon;
              return (
                <div
                  key={cap.title}
                  className="group p-6 rounded-2xl bg-sentinel-800/60 border border-sentinel-700 hover:border-fire-600/40 transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-xl bg-fire-600/10 border border-fire-600/20 flex items-center justify-center mb-4 group-hover:bg-fire-600/20 transition-colors">
                    <Icon size={22} className="text-fire-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{cap.title}</h3>
                  <p className="text-sentinel-300 text-sm leading-relaxed">{cap.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-sentinel-850 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center rounded-3xl bg-gradient-to-br from-fire-600/15 via-sentinel-900 to-sentinel-900 border border-fire-600/20 p-10 sm:p-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Get Ready to Deploy
            </h2>
            <p className="text-sentinel-200 max-w-xl mx-auto mb-8">
              Create a volunteer profile, see the response roles available, and
              sign up for the training and deployment opportunities that fit you.
            </p>
            <Link
              to="/disaster-response/get-involved"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-fire-600 text-white font-semibold hover:bg-fire-500 transition-colors shadow-lg shadow-fire-600/25"
            >
              Get Involved
              <ArrowRight size={18} />
            </Link>
            <div className="mt-4">
              <Link
                to="/disaster-response"
                className="text-sentinel-300 hover:text-fire-400 text-sm transition-colors"
              >
                Back to Overview
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
