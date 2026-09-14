import { Link } from 'react-router-dom';
import Seo from '../../shared/components/Seo';
import { getAppOrigin } from '../../shared/utils/getAppOrigin';
import {
  Flame,
  Target,
  Eye,
  Heart,
  Users,
  ShieldCheck,
  Globe,
  ArrowRight,
  Award,
  Clock,
  Database,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

const dataSources = [
  {
    name: 'NASA FIRMS',
    description: 'Satellite-detected active fire hotspots (VIIRS and MODIS), refreshed multiple times per day.',
  },
  {
    name: 'NIFC',
    description: 'National Interagency Fire Center incident data, including large-fire status and containment.',
  },
  {
    name: 'InciWeb',
    description: 'Official incident reports and public information for active wildfire responses.',
  },
  {
    name: 'CAL FIRE',
    description: 'California-specific incident and perimeter data, preferred over national feeds for CA fires.',
  },
  {
    name: 'NOAA / National Weather Service',
    description: 'Red Flag Warnings, Fire Weather Watches, and other alerts tied to elevated fire risk.',
  },
  {
    name: 'AirNow & EPA',
    description: 'Air Quality Index readings used to show smoke impact on nearby communities.',
  },
];

const values = [
  {
    icon: Eye,
    title: 'Vigilance',
    description:
      'We maintain constant awareness of wildfire conditions, ensuring no fire goes unnoticed and no community is left uninformed.',
  },
  {
    icon: ShieldCheck,
    title: 'Accuracy',
    description:
      'Every piece of data we share is verified against multiple sources. We prioritize precision because lives depend on the information we provide.',
  },
  {
    icon: Clock,
    title: 'Timeliness',
    description:
      'In wildfire emergencies, minutes matter. We are committed to delivering intelligence as fast as technology and human diligence allow.',
  },
  {
    icon: Heart,
    title: 'Service',
    description:
      'Our team is 100% volunteer-driven. We serve because we believe every community deserves access to the best wildfire information available.',
  },
  {
    icon: Globe,
    title: 'Transparency',
    description:
      'We use publicly available data from government agencies like NASA, NOAA, and NIFC, and we make our tracking tools freely available to all.',
  },
  {
    icon: Users,
    title: 'Community',
    description:
      'We work alongside local fire departments, emergency managers, and community organizations to ensure our data reaches those who need it most.',
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <Seo
        title="About Us | National Wildfire Tracking Team (NWTT)"
        description="The National Wildfire Tracking Team (NWTT) is an all-volunteer nonprofit. Learn who operates Sentinel, our mission, and how we source and verify wildfire, weather, and air quality data."
        path="/about"
      />
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-sentinel-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,90,0,0.08),_transparent_60%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-20 sm:pb-24">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-full bg-fire-600/15 border border-fire-600/30 text-fire-400 text-xs font-semibold uppercase tracking-wider">
              <Users size={14} />
              About Our Team
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight tracking-tight">
              Volunteers United by{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-fire-500 to-fire-300">
                One Mission
              </span>
            </h1>
            <p className="mt-6 text-lg text-sentinel-200 leading-relaxed">
              The National Wildfire Tracking Team is an all-volunteer organization
              dedicated to providing the public with real-time wildfire intelligence.
              We believe that access to accurate, timely fire information should be
              available to everyone.
            </p>
          </div>
        </div>
      </section>

      {/* ── Our Story ── */}
      <section className="bg-sentinel-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Flame size={18} className="text-fire-400" />
                <span className="text-fire-400 font-semibold text-sm uppercase tracking-wider">Our Story</span>
              </div>
              <h2 className="text-3xl font-bold text-white mb-6">
                Born From a Need to Inform and Protect
              </h2>
              <div className="space-y-4 text-sentinel-200 leading-relaxed">
                The National Wildfire Tracking Team (NWTT) is a nonpartisan, nonprofit organization dedicated to providing real-time, verified public-safety information on wildfires, severe weather, and other natural disasters. Our mission is to deliver accurate situational awareness so communities can respond safely during emergencies.

              </div>
            </div>

            {/* Visual element */}
            <div className="relative">
              <div className="rounded-2xl bg-sentinel-900 border border-sentinel-700 p-8 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-fire-600/15 border border-fire-600/25 flex items-center justify-center flex-shrink-0">
                    <Target size={18} className="text-fire-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">Our Mission</h3>
                    <p className="text-sentinel-300 text-sm leading-relaxed">
                      To provide free, real-time wildfire tracking and intelligence to
                      every community in the United States, empowering people to make
                      informed decisions during wildfire events.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-fire-600/15 border border-fire-600/25 flex items-center justify-center flex-shrink-0">
                    <Eye size={18} className="text-fire-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">Our Vision</h3>
                    <p className="text-sentinel-300 text-sm leading-relaxed">
                      A nation where no community is caught off guard by wildfire, where
                      real-time intelligence is universally accessible, and where
                      technology bridges the gap between detection and public awareness.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-fire-600/15 border border-fire-600/25 flex items-center justify-center flex-shrink-0">
                    <Award size={18} className="text-fire-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">Our Commitment</h3>
                    <p className="text-sentinel-300 text-sm leading-relaxed">
                      We are committed to accuracy, speed, and public service. Every data
                      point we share is verified, every alert is timely, and every tool
                      we build is freely available.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Our Values ── */}
      <section className="bg-sentinel-900 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Our Values</h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              These principles guide everything we do, from how we verify data to how
              we serve communities in crisis.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {values.map((val) => {
              const Icon = val.icon;
              return (
                <div
                  key={val.title}
                  className="p-6 rounded-2xl bg-sentinel-800/60 border border-sentinel-700 hover:border-fire-600/30 transition-all"
                >
                  <div className="w-11 h-11 rounded-xl bg-fire-600/10 border border-fire-600/20 flex items-center justify-center mb-4">
                    <Icon size={20} className="text-fire-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{val.title}</h3>
                  <p className="text-sentinel-300 text-sm leading-relaxed">{val.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Data Sources & Methodology ── */}
      <section id="data-methodology" className="bg-sentinel-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Database size={18} className="text-fire-400" />
              <span className="text-fire-400 font-semibold text-sm uppercase tracking-wider">Data & Methodology</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Where Our Data Comes From</h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              Sentinel does not generate its own fire detections. We aggregate, cross-reference, and
              display data published by public agencies, then layer in our own verification.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {dataSources.map((source) => (
              <div
                key={source.name}
                className="p-6 rounded-2xl bg-sentinel-900 border border-sentinel-700"
              >
                <h3 className="text-white font-semibold mb-2">{source.name}</h3>
                <p className="text-sentinel-300 text-sm leading-relaxed">{source.description}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-sentinel-900 border border-sentinel-700 flex gap-4">
              <RefreshCw size={20} className="text-fire-400 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-white font-semibold mb-1">Update Frequency</h3>
                <p className="text-sentinel-300 text-sm leading-relaxed">
                  Satellite hotspots and weather alerts refresh continuously throughout the day.
                  Incident perimeters and containment figures update as fast as source agencies
                  publish them, which is typically once or twice daily during active incidents.
                </p>
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-sentinel-900 border border-sentinel-700 flex gap-4">
              <AlertTriangle size={20} className="text-fire-400 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-white font-semibold mb-1">Limitations</h3>
                <p className="text-sentinel-300 text-sm leading-relaxed">
                  Sentinel is not a government agency or an official emergency service, and
                  information shown may be delayed, incomplete, or occasionally inaccurate. Always
                  confirm evacuation orders and emergency instructions with official local sources.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <a
              href={`${getAppOrigin()}/`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sentinel-700 text-white font-semibold hover:bg-sentinel-600 transition-colors border border-sentinel-600"
            >
              View the Live Wildfire Tracker
              <ArrowRight size={18} />
            </a>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-sentinel-900 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center rounded-3xl bg-gradient-to-br from-fire-600/15 via-sentinel-800 to-sentinel-900 border border-fire-600/20 p-10 sm:p-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Ready to Make a Difference?
            </h2>
            <p className="text-sentinel-200 max-w-xl mx-auto mb-8">
              We're always looking for dedicated volunteers who share our passion for
              public safety and wildfire awareness. Join our team and help protect
              communities across the nation.
            </p>
            <Link
              to="/volunteer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-fire-600 text-white font-semibold hover:bg-fire-500 transition-colors shadow-lg shadow-fire-600/25"
            >
              Apply to Volunteer
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
