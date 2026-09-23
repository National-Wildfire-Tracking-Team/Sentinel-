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
      'Volunteer Desk Reporters help gather, verify, and synthesize information related to active wildfires and weather events. This includes monitoring multiple sources such as scanner traffic, fire cameras, official agency updates, user-submitted intel, and automated detections within NWTT.',
    badge: 'Core Team',
  },
  {
    icon: MessageSquare,
    title: 'Communications / Social Media',
    description:
      'Translate complex fire data into clear, actionable updates for the public, media, and partner agencies during wildfire events.',
    badge: 'Outreach',
        link: 'https://docs.google.com/forms/d/e/1FAIpQLSf0_7xTXrIA5T8eTLL5tYVjoH7ppqeIw8K302RE5uXpICW2sg/viewform?usp=header',
  },
  {
    icon: Map,
    title: 'GIS & Mapping Specialist',
    description:
      'Create and maintain interactive maps, perimeter overlays, and geospatial visualizations that make wildfire data accessible and understandable.',
    badge: 'Technical',
  },
  {
    icon: Code2,
    title: 'Web Developer',
    description:
      'Help build and improve the tools and interfaces that volunteers and the public rely on for real-time wildfire tracking.',
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
              Volunteer With Us
            </h1>
            <p className="mt-6 text-lg text-sentinel-200 leading-relaxed">
              Join a dedicated team of volunteers working to protect communities
              through real-time wildfire intelligence. Select a role below to
              apply via our volunteer application form.
            </p>
          </div>
        </div>
      </ParallaxHero>

      {/* ── Role Boxes ── */}
      <section className="relative overflow-hidden bg-sentinel-800 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative text-center mb-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] max-w-[90vw] h-36 rounded-full bg-fire-600/25 blur-3xl"
            />
            <h2 className="relative text-2xl sm:text-3xl font-bold text-white">Find Your Role</h2>
            <p className="relative mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              Click any role to open our application form. No matter your
              background, there's a place for you on our team.
            </p>
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
