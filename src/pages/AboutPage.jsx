import { Link } from 'react-router-dom';
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
} from 'lucide-react';

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

const teamRoles = [
  {
    title: 'Fire Intelligence Analysts',
    description:
      'Monitor satellite feeds and cross-reference fire detections with weather data, terrain models, and ground reports to provide accurate situational awareness.',
    count: 'Core Team',
  },
  {
    title: 'Data Engineers',
    description:
      'Build and maintain the data pipelines that ingest information from NASA FIRMS, NIFC, NWS, and other authoritative sources to power our tracking platform.',
    count: 'Technical',
  },
  {
    title: 'Weather Analysts',
    description:
      'Track fire weather conditions including Red Flag Warnings, wind events, and drought patterns that influence wildfire behavior and spread.',
    count: 'Specialist',
  },
  {
    title: 'Communications Team',
    description:
      'Translate complex fire data into clear, actionable information for the public, media, and partner agencies during wildfire events.',
    count: 'Outreach',
  },
  {
    title: 'GIS & Mapping Specialists',
    description:
      'Create and maintain interactive maps, perimeter overlays, and geospatial visualizations that make wildfire data accessible and understandable.',
    count: 'Technical',
  },
  {
    title: 'Community Liaisons',
    description:
      'Connect with local emergency management agencies, fire departments, and community groups to ensure our intelligence reaches those on the ground.',
    count: 'Field',
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen">
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
                <p>
                  The National Wildfire Tracking Team was founded by a group of concerned
                  citizens who witnessed firsthand the devastation caused by wildfires and
                  the critical gap in real-time public information during fire emergencies.
                </p>
                <p>
                  Recognizing that government agencies like NASA, NOAA, and NIFC publish
                  invaluable wildfire data, our founders set out to build a platform that
                  consolidates this information into a single, easy-to-understand tracking
                  system accessible to everyone.
                </p>
                <p>
                  Today, our team of dedicated volunteers monitors wildfire activity 24/7,
                  combining satellite data, weather intelligence, and ground reports to
                  provide comprehensive situational awareness during the nation's most
                  critical fire events.
                </p>
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

      {/* ── Team Roles ── */}
      <section className="bg-sentinel-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">How Our Team Works</h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              Our volunteers contribute across multiple disciplines, each playing a
              critical role in our wildfire intelligence operation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teamRoles.map((role) => (
              <div
                key={role.title}
                className="p-6 rounded-2xl bg-sentinel-900 border border-sentinel-700 hover:border-fire-600/30 transition-all"
              >
                <span className="inline-block px-2.5 py-0.5 rounded-md bg-fire-600/10 text-fire-400 text-xs font-semibold mb-3">
                  {role.count}
                </span>
                <h3 className="text-lg font-semibold text-white mb-2">{role.title}</h3>
                <p className="text-sentinel-300 text-sm leading-relaxed">{role.description}</p>
              </div>
            ))}
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
