import { Link } from 'react-router-dom';
import {
  Flame,
  Satellite,
  Radio,
  ShieldAlert,
  MapPin,
  Users,
  ArrowRight,
  Eye,
  CloudLightning,
  BarChart3,
} from 'lucide-react';

const capabilities = [
  {
    icon: Satellite,
    title: 'Satellite Fire Detection',
    description:
      'We leverage NASA FIRMS satellite data to detect active fire hotspots across the United States in near real-time, identifying new fires within hours of ignition.',
  },
  {
    icon: MapPin,
    title: 'Fire Perimeter Tracking',
    description:
      'Our team maps and monitors fire perimeters using NIFC and InciWeb data, providing accurate boundaries of active wildfires as they grow or are contained.',
  },
  {
    icon: CloudLightning,
    title: 'Weather Alert Monitoring',
    description:
      'We track Red Flag Warnings, Fire Weather Watches, and other critical weather alerts from the National Weather Service that indicate elevated wildfire risk.',
  },
  {
    icon: Eye,
    title: 'Air Quality Intelligence',
    description:
      'Real-time air quality index monitoring across the country helps communities understand smoke impacts and take protective action during wildfire events.',
  },
  {
    icon: Radio,
    title: 'Incident Reporting',
    description:
      'We compile and distribute incident reports from NIFC and InciWeb, giving the public and first responders a consolidated view of active wildfire situations.',
  },
  {
    icon: BarChart3,
    title: 'Data Analysis & Trends',
    description:
      'Our analysts study fire behavior, drought conditions, and seasonal patterns to help predict where the next critical wildfire situations may emerge.',
  },
];

const stats = [
  { value: '24/7', label: 'Monitoring' },
  { value: '50', label: 'States Covered' },
  { value: '1000+', label: 'Fires Tracked Yearly' },
  { value: '100%', label: 'Volunteer Powered' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-sentinel-900 via-sentinel-800 to-sentinel-900" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,90,0,0.12),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(255,116,16,0.08),_transparent_50%)]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fire-600/15 border border-fire-600/30 text-fire-400 text-xs font-semibold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-fire-500 animate-pulse" />
                Active Monitoring
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight">
              Protecting Communities{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-fire-500 to-fire-300">
                Through Wildfire Intelligence
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-sentinel-200 leading-relaxed max-w-2xl">
              The National Wildfire Tracking Team provides real-time wildfire monitoring,
              satellite detection, and weather intelligence to keep communities informed
              and safe across the United States.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                to="/live-tracker"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-fire-600 text-white font-semibold hover:bg-fire-500 transition-colors shadow-lg shadow-fire-600/25"
              >
                <Flame size={18} />
                View Live Wildfires
              </Link>
              <Link
                to="/volunteer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sentinel-700 text-white font-semibold hover:bg-sentinel-600 transition-colors border border-sentinel-600"
              >
                Join Our Team
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="bg-sentinel-800 border-y border-sentinel-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-fire-400">{stat.value}</div>
                <div className="mt-1 text-sm text-sentinel-300 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What We Do ── */}
      <section className="bg-sentinel-900 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">What We Do</h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              Our team operates around the clock to detect, track, and report wildfire
              activity using cutting-edge technology and open-source intelligence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {capabilities.map((cap) => {
              const Icon = cap.icon;
              return (
                <div
                  key={cap.title}
                  className="group p-6 rounded-2xl bg-sentinel-800/60 border border-sentinel-700 hover:border-fire-600/40 transition-all duration-300 hover:shadow-lg hover:shadow-fire-600/5"
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

      {/* ── Mission CTA ── */}
      <section className="bg-sentinel-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-fire-600/20 via-sentinel-800 to-sentinel-900 border border-fire-600/20 p-10 sm:p-14">
            <div className="absolute top-0 right-0 w-72 h-72 bg-fire-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative flex flex-col lg:flex-row items-center gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldAlert size={20} className="text-fire-400" />
                  <span className="text-fire-400 font-semibold text-sm uppercase tracking-wider">Our Mission</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                  Early Detection Saves Lives
                </h2>
                <p className="text-sentinel-200 leading-relaxed max-w-xl">
                  Every minute counts during a wildfire. Our volunteer team works tirelessly
                  to provide the earliest possible detection and the most accurate tracking
                  data available, helping emergency responders and communities make
                  life-saving decisions.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to="/about"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sentinel-700 text-white font-semibold hover:bg-sentinel-600 transition-colors border border-sentinel-600"
                >
                  <Users size={18} />
                  Meet the Team
                </Link>
                <Link
                  to="/volunteer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-fire-600 text-white font-semibold hover:bg-fire-500 transition-colors shadow-lg shadow-fire-600/25"
                >
                  Become a Volunteer
                  <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
