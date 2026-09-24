import Seo from '../../shared/components/Seo';
import ParallaxHero from '../components/ParallaxHero';
import volunteerHero from '../assets/volunteer-hero.jpg';
import {
  Flame,
  MessageSquare,
  Map,
  Code2,
  ArrowRight,
} from 'lucide-react';

// TODO: Replace with your actual Google Form URL
const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfTcBRvksqEWIujHeb1cgqAtisKUjJ4yRmVBVX6H_7FVnLgaA/viewform?usp=header';

const roles = [
  {
    icon: Flame,
    title: 'Reporter',
    description:
      'Monitor scanner traffic, fire cameras, agency updates, and Sentinel\'s automated detections to confirm what\'s happening on active incidents, then publish clear, timely updates the public can act on.',
    badge: 'Core Team',
  },
  {
    icon: MessageSquare,
    title: 'Communications / Social Media',
    description:
      'Turn verified incident updates into clear posts, alerts, and graphics for our social channels, and help grow NWTT\'s reach with the public, media, and partner organizations.',
    badge: 'Outreach',
        link: 'https://docs.google.com/forms/d/e/1FAIpQLSf0_7xTXrIA5T8eTLL5tYVjoH7ppqeIw8K302RE5uXpICW2sg/viewform?usp=header',
  },
  {
    icon: Map,
    title: 'GIS & Mapping Specialist',
    description:
      'Build and maintain the map layers behind Sentinel, from fire perimeters to evacuation zones and hazard overlays, and turn raw geospatial data into maps anyone can read.',
    badge: 'Technical',
  },
  {
    icon: Code2,
    title: 'Web Developer',
    description:
      'Help build new features and improve Sentinel, the wildfire tracking platform our volunteers and the public rely on, keeping it fast, reliable, and easy to use.',
    badge: 'Technical',
    link: 'https://docs.google.com/forms/d/e/1FAIpQLSfbjW4BisLzInH3eEbDPzDH10pVHGx_ubbVPQGlf5wzRbqaLw/viewform?usp=header',
  },
];

export default function VolunteerPage() {
  return (
    <div className="min-h-screen">
      <Seo
        title="Volunteer With NWTT | National Wildfire Tracking Team"
        description="Join the National Wildfire Tracking Team as a volunteer. Help with data monitoring, mapping, engineering, and public communications for our free wildfire tracking platform."
        path="/volunteer"
      />
      {/* ── Hero ── */}
      {/* focal holds the burning ridgeline in the middle of the bar. */}
      <ParallaxHero image={volunteerHero} focal="70%">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 sm:pt-24 sm:pb-20">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight tracking-tight">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-fire-500 to-fire-300">
                Volunteer
              </span>{' '}
              With Us
            </h1>
            <p className="mt-6 text-lg text-white leading-relaxed">
              Join a dedicated team of volunteers working to protect communities
              through real-time wildfire intelligence. Select a role below to
              apply via our volunteer application form.
            </p>
          </div>
        </div>
      </ParallaxHero>

      {/* ── Role Boxes ── */}
      <section className="relative overflow-hidden bg-sentinel-850 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Same fire gradient the hero headlines use, so the section reads as a headline. */}
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Find{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-fire-500 to-fire-300">
                Your Role
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 auto-rows-fr max-w-4xl mx-auto">
            {roles.map((role) => {
              const Icon = role.icon;
              return (
                <a
                  key={role.title}
                  href={role.link || GOOGLE_FORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col h-full p-6 rounded-2xl bg-sentinel-900 border border-sentinel-700 hover:border-fire-600/50 transition-all cursor-pointer hover:bg-sentinel-900/80"
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
                  <span className="self-start px-2.5 py-0.5 rounded-md bg-fire-600/10 text-fire-400 text-xs font-semibold mb-3">
                    {role.badge}
                  </span>
                  <h3 className="text-lg font-semibold text-white mb-2">{role.title}</h3>
                  <p className="text-sentinel-300 text-sm leading-relaxed">{role.description}</p>
                </a>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
