import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../shared/components/Seo';
import ParallaxHero from '../components/ParallaxHero';
import NewsletterModal from '../components/NewsletterModal';
import homeHero from '../assets/home-hero.jpg';
import homeHeroAvif from '../assets/home-hero.avif';
import { ArrowRight, ChevronRight } from 'lucide-react';

const capabilities = [
  {
    title: 'Satellite Fire Detection',
    description:
      'We leverage NASA FIRMS satellite data to detect active fire hotspots across the United States in near real-time, identifying new fires within hours of ignition.',
  },
  {
    title: 'Fire Perimeter Tracking',
    description:
      'Our team maps and monitors fire perimeters using NIFC and InciWeb data, providing accurate boundaries of active wildfires as they grow or are contained.',
  },
  {
    title: 'Weather Alert Monitoring',
    description:
      'We track Red Flag Warnings, Fire Weather Watches, and other critical NOAA/NWS alerts that indicate elevated wildfire risk.',
  },
  {
    title: 'Incident Reporting',
    description:
      'We compile and distribute incident reports from NIFC and InciWeb, giving the public and first responders a consolidated view of active wildfire situations.',
  },
];

// Oldest first. Each entry gets its own clickable card under "Weekly Newsletter".
const newsletters = [
  {
    title: 'v1.00.01 First Update',
    sections: [
      {
        heading: 'Model Feature Added',
        body: 'HRRR, GFS, and HAFS forecasting models are now live on the Sentinel platform. Model types can be compared between each other and offer history as well as forecasts up to 384 hours out.',
      },
      {
        heading: 'Navigation Feature Now Live for Pro Users',
        body: 'Pro subscribers now have access to navigation tools built directly into the Sentinel Platform. The navigation tool offers point to point routing as well as a beta for shortest route from current location to safe zone. More features coming soon.',
      },
    ],
  },
  {
    title: 'v1.00.02 Update',
    sections: [
      {
        heading: 'Toolkit Drawer Improvements',
        body: 'As more features necessitate the use of individual settings, a new toolkit drawer system has been implemented. The new toolkit drawer was designed to make it easier to change feature settings with multiple in use.',
      },
      {
        heading: 'Site Radar Now Available for All Users',
        body: 'All users have already had access to MRMS composite radar, but, to make local radar scans more accurate, individual radar sites have been added. Try it out on both the Weather and All Hazards tabs now.',
      },
      {
        heading: 'Lightning Detection Added',
        body: 'Lightning detection is now live and available for free for all users.',
      },
    ],
  },
  {
    title: 'v1.00.03 Update',
    sections: [
      {
        heading: 'Fire Danger Sidebar Tab',
        body: 'The Wildfire sidebar now has a Fire Danger tab next to Incidents. It sums up current station readings in plain language, shows the week ahead, and ranks states and stations by fire danger. Click any state or station to fly the map straight there.',
      },
      {
        heading: 'Aviation Weather Now Available for All Users',
        body: 'Aviation Weather Center data is now on the Weather and All Hazards tabs. Airport weather (METAR and TAF) with flight rules and wind barbs, SIGMETs, AIRMETs, PIREPs, winds aloft and more each have their own switch in the toolkit drawer.',
      },
      {
        heading: 'Fire Danger & Fuels Added for Plus and Pro Users',
        body: 'A new Fire Danger & Fuels section is now on the Wildfire and All Hazards tabs. It brings together the NWCG 7-day Significant Fire Potential outlook, NFDRS station readings for Energy Release Component, Burning Index and fuel moisture, the USGS Fire Potential Index forecast, live fuel moisture field samples, and LANDFIRE fuel types.',
      },
    ],
  },
];

const stats = [
  { value: '50', label: 'States Covered' },
  { value: '24/7', label: 'Monitoring' },
  { value: '100%', label: 'Volunteer Powered' },
];

export default function HomePage() {
  const [openNewsletter, setOpenNewsletter] = useState(null);
  const closeNewsletter = useCallback(() => setOpenNewsletter(null), []);

  return (
    <div className="min-h-screen">
      <Seo
        title="Sentinel Wildfire Tracker | National Wildfire Tracking Team (NWTT)"
        description="Free real-time wildfire tracking from the National Wildfire Tracking Team: satellite fire detection, fire perimeters, weather alerts, and air quality data across the United States."
        path="/"
      />
      {/* ── Hero Section ── */}
      {/* The photo is pre-cropped so the helicopter sits at its vertical centre,
          which keeps it centred in the bar at every viewport — see focal in
          ParallaxHero for why object-position alone can't guarantee that. */}
      <ParallaxHero image={homeHero} avif={homeHeroAvif} focal="50%">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight">
              Protecting Communities Through{' '}
              All-Hazard Intelligence
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-white leading-relaxed max-w-2xl">
              The National Wildfire Tracking Team provides real-time wildfire monitoring,
              satellite detection, and weather intelligence to keep communities informed
              and safe across the United States.
            </p>

          </div>
        </div>
      </ParallaxHero>

      {/* ── Stats Bar ── */}
      <section className="bg-sentinel-850 border-b border-sentinel-700/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-5xl lg:text-6xl font-bold text-white">{stat.value}</div>
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
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              What We{' '}
              Do
            </h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              Our team operates around the clock to detect, track, and report wildfire
              activity using cutting-edge technology and open-source intelligence.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 auto-rows-fr max-w-4xl mx-auto">
            {capabilities.map((cap) => (
              <div
                key={cap.title}
                className="flex flex-col h-full p-6 rounded-2xl bg-sentinel-800/60 border border-sentinel-700 hover:border-fire-600/40 transition-all duration-300 hover:shadow-lg hover:shadow-fire-600/5"
              >
                <h3 className="text-lg font-semibold text-white mb-2">{cap.title}</h3>
                <p className="text-sentinel-300 text-sm leading-relaxed">{cap.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Mission CTA ── */}
      <section className="bg-sentinel-850 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl overflow-hidden bg-sentinel-800 border border-fire-600/20 p-10 sm:p-14">
            <div className="relative flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1">
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
                  to="/volunteer"
                  className="btn-glass-fire inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold"
                >
                  Become a Volunteer
                  <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </div>

          {/* ── Weekly Newsletter ── */}
          <h2 className="mt-16 text-center text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Weekly Newsletter
          </h2>
          <ul className="mt-6 max-w-3xl mx-auto space-y-3">
            {newsletters.map((issue) => (
              <li key={issue.title}>
                <button
                  type="button"
                  onClick={() => setOpenNewsletter(issue)}
                  aria-haspopup="dialog"
                  className="group w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-sentinel-800 border border-fire-600/40 hover:border-fire-600/70 hover:bg-sentinel-800/80 text-left transition-colors active:scale-[0.99] active:duration-100"
                >
                  <span className="flex-1 min-w-0 truncate font-semibold text-white">
                    {issue.title}
                  </span>
                  <ChevronRight
                    size={18}
                    className="shrink-0 text-sentinel-300 group-hover:text-white group-hover:translate-x-0.5 transition"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <NewsletterModal
        open={openNewsletter !== null}
        title={openNewsletter?.title}
        onClose={closeNewsletter}
      >
        {openNewsletter?.sections.map((section, i) => (
          <section key={section.heading ?? i}>
            {section.heading && (
              <h3 className="text-lg font-semibold text-white">{section.heading}</h3>
            )}
            <p className="mt-1">{section.body}</p>
          </section>
        ))}
      </NewsletterModal>
    </div>
  );
}
