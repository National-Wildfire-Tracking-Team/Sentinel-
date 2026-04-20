import {
  Flame,
  Database,
  Cloud,
  MessageSquare,
  Map,
  Users,
  Code2,
  Plus,
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
    icon: Database,
    title: 'Data Engineer',
    description:
      'Build and maintain data pipelines that ingest information from NASA FIRMS, NIFC, NWS, and other authoritative sources to power our tracking platform.',
    badge: 'Technical',
  },
  {
    icon: Cloud,
    title: 'Weather Analyst',
    description:
      'Track fire weather conditions including Red Flag Warnings, wind events, and drought patterns that influence wildfire behavior and spread.',
    badge: 'Specialist',
  },
  {
    icon: MessageSquare,
    title: 'Communications / Social Media',
    description:
      'Translate complex fire data into clear, actionable updates for the public, media, and partner agencies during wildfire events.',
    badge: 'Outreach',
  },
  {
    icon: Map,
    title: 'GIS & Mapping Specialist',
    description:
      'Create and maintain interactive maps, perimeter overlays, and geospatial visualizations that make wildfire data accessible and understandable.',
    badge: 'Technical',
  },
  {
    icon: Users,
    title: 'Community Liaison',
    description:
      'Connect with local emergency management agencies, fire departments, and community groups to ensure our intelligence reaches those on the ground.',
    badge: 'Field',
  },
  {
    icon: Code2,
    title: 'Web Developer',
    description:
      'Help build and improve the tools and interfaces that volunteers and the public rely on for real-time wildfire tracking.',
    badge: 'Technical',
  },
  {
    icon: Plus,
    title: 'Other',
    description:
      'Have a unique skill set that could help our mission? We welcome all backgrounds. Tell us what you bring to the team.',
    badge: 'Open',
  },
];

export default function VolunteerPage() {
  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="relative bg-sentinel-900 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,90,0,0.08),_transparent_50%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 sm:pt-20 sm:pb-16">
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
      </section>

      {/* ── Role Boxes ── */}
      <section className="bg-sentinel-800 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Choose Your Role</h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              Click any role to open our application form. No matter your
              background, there's a place for you on our team.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roles.map((role) => {
              const Icon = role.icon;
              return (
                <a
                  key={role.title}
                  href={GOOGLE_FORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group p-6 rounded-2xl bg-sentinel-900 border border-sentinel-700 hover:border-fire-600/50 transition-all cursor-pointer hover:bg-sentinel-900/80"
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
                  <span className="inline-block px-2.5 py-0.5 rounded-md bg-fire-600/10 text-fire-400 text-xs font-semibold mb-3">
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
