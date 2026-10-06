import Seo from '../../shared/components/Seo';
import ParallaxHero from '../components/ParallaxHero';
import aboutHero from '../assets/about-hero.jpg';
import { getAppOrigin } from '../../shared/utils/getAppOrigin';
import { ArrowRight } from 'lucide-react';

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
    title: 'Vigilance',
    description:
      'We maintain constant awareness of wildfire conditions, ensuring no fire goes unnoticed and no community is left uninformed.',
  },
  {
    title: 'Accuracy',
    description:
      'Every piece of data we share is verified against multiple sources. We prioritize precision because lives depend on the information we provide.',
  },
  {
    title: 'Timeliness',
    description:
      'In wildfire emergencies, minutes matter. We are committed to delivering intelligence as fast as technology and human diligence allow.',
  },
  {
    title: 'Service',
    description:
      'Our team is 100% volunteer-driven. We serve because we believe every community deserves access to the best wildfire information available.',
  },
  {
    title: 'Transparency',
    description:
      'We use publicly available data from government agencies like NASA, NOAA, and NIFC, and we make our tracking tools freely available to all.',
  },
  {
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
      {/* The firefighter sits low in this photo, so the parallax runs shallower
          here — a deeper crop would carry him past the bottom edge at rest.
          The scrim is lighter too: the shot is already a night exposure. */}
      <ParallaxHero
        image={aboutHero}
        focal="50%"
        focalX="32%"
        overhang={0.28}
        drift={0.22}
        overlayClassName="bg-sentinel-900/55"
      >
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-20 sm:pb-24">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight tracking-tight">
              Volunteers United by{' '}
              One Mission
            </h1>
            <p className="mt-6 text-lg text-white leading-relaxed">
              The National Wildfire Tracking Team is an all-volunteer organization
              dedicated to providing the public with real-time wildfire intelligence.
              We believe that access to accurate, timely fire information should be
              available to everyone.
            </p>
          </div>
        </div>
      </ParallaxHero>

      {/* ── Our Story ── */}
      <section className="bg-sentinel-850 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            <div className="h-full rounded-2xl bg-sentinel-900 border border-sentinel-700 hover:border-fire-600/30 transition-all p-8">
              <h2 className="text-3xl font-bold text-white mb-6">
                Born From a Need to{' '}
                Inform and Protect
              </h2>
              <div className="space-y-4 text-sentinel-200 leading-relaxed">
                The National Wildfire Tracking Team (NWTT) is a nonpartisan, nonprofit organization dedicated to providing real-time, verified public safety information on wildfires, severe weather, and other natural disasters. Our mission is to deliver accurate situational awareness so communities and first responders can respond safely during emergencies.

              </div>
            </div>

            {/* Visual element */}
            <div className="relative h-full">
              <div className="h-full rounded-2xl bg-sentinel-900 border border-sentinel-700 hover:border-fire-600/30 transition-all p-8 space-y-6">
                <div>
                  <h3 className="text-white font-semibold mb-1">Our Mission</h3>
                  <p className="text-sentinel-300 text-sm leading-relaxed">
                    To provide free, real-time wildfire tracking and intelligence to
                    every community in the United States, empowering people to make
                    informed decisions during all events.
                  </p>
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-1">Our Vision</h3>
                  <p className="text-sentinel-300 text-sm leading-relaxed">
                    A nation where no community is caught off guard by disasters, where
                    real-time intelligence is universally accessible, and where
                    technology bridges the gap between detection and public awareness.
                  </p>
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-1">Our Commitment</h3>
                  <p className="text-sentinel-300 text-sm leading-relaxed">
                    We are committed to accuracy, speed, and public service. Every data
                    point we share is verified, every alert is timely, and every lifesaving tool
                    we build is freely available.
                  </p>
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
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Our{' '}
              Values
            </h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              These principles guide everything we do, from how we verify data to how
              we serve communities in crisis.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {values.map((val) => (
              <div
                key={val.title}
                className="p-6 rounded-2xl bg-sentinel-800/60 border border-sentinel-700 hover:border-fire-600/30 transition-all"
              >
                <h3 className="text-lg font-semibold text-white mb-2">{val.title}</h3>
                <p className="text-sentinel-300 text-sm leading-relaxed">{val.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Data Sources & Methodology ── */}
      <section id="data-methodology" className="bg-sentinel-850 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Where Our{' '}
              Data{' '}
              Comes From
            </h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              Sentinel does not generate its own fire detections. We aggregate, cross-reference, and
              display data published by public agencies, then layer in our own verification.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {dataSources.map((source) => (
              <div
                key={source.name}
                className="p-6 rounded-2xl bg-sentinel-900 border border-sentinel-700 hover:border-fire-600/40 transition-all duration-300 hover:shadow-lg hover:shadow-fire-600/5"
              >
                <h3 className="text-white font-semibold mb-2">{source.name}</h3>
                <p className="text-sentinel-300 text-sm leading-relaxed">{source.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <a
              href={`${getAppOrigin()}/`}
              className="btn-glass-fire inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold"
            >
              View the Live Wildfire Tracker
              <ArrowRight size={18} />
            </a>
          </div>
        </div>
      </section>

    </div>
  );
}
