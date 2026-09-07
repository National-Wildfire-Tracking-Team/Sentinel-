import { Link } from 'react-router-dom';
import {
  Users,
  ArrowRight,
  UserPlus,
  KeyRound,
  Radio,
  Wrench,
  Camera,
  Stethoscope,
  Satellite,
  CalendarClock,
  GraduationCap,
  UsersRound,
} from 'lucide-react';
import PageHeader from './PageHeader';
import { getAppOrigin } from '../../../shared/utils/getAppOrigin';

const roles = [
  {
    icon: Radio,
    title: 'Command / Dispatch',
    description: 'Coordinate team communications, manage logistics, and dispatch resources from a command post.',
    requirements: 'Strong organizational and communication skills, experience with radio systems.',
  },
  {
    icon: Wrench,
    title: 'General Deployment',
    description: 'A flexible role for on-the-ground support, including logistics, setup, and assisting other teams as needed.',
    requirements: 'Willingness to help, physical fitness, adaptability.',
  },
  {
    icon: Camera,
    title: 'Media & Documentation',
    description: 'Capture high-quality photos and videos of our operations for documentation and public awareness.',
    requirements: 'Experience in photography/videography, own equipment preferred.',
  },
  {
    icon: Stethoscope,
    title: 'Medical or Rescue Support',
    description: 'Provide critical medical assistance, first aid, or rescue support in affected areas.',
    requirements: 'Medical/EMT/SAR certification, physical fitness, ability to work under pressure.',
  },
  {
    icon: Satellite,
    title: 'WXINTEL / OSINT',
    description: 'Gather and analyze weather intelligence (WXINTEL) and open-source intelligence (OSINT) to support operations.',
    requirements: 'Analytical skills, experience with data analysis tools, attention to detail.',
  },
];

const benefits = [
  {
    icon: CalendarClock,
    title: 'Flexible Schedule',
    description: 'Volunteer opportunities that fit your availability and lifestyle.',
  },
  {
    icon: GraduationCap,
    title: 'Professional Training',
    description: 'Receive certified training in emergency response and disaster management.',
  },
  {
    icon: UsersRound,
    title: 'Team Community',
    description: 'Join a dedicated team of professionals committed to helping others.',
  },
];

export default function GetInvolvedPage() {
  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Users}
        eyebrow="Get Involved"
        title="Join Our"
        highlight="Team."
        description="Become part of a dedicated team that makes a real difference when disasters strike. Create an NWTT account, complete your volunteer profile, and sign up for deployments right from this site."
      />

      {/* ── Roles ── */}
      <section className="bg-sentinel-900 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-white">Deployment Roles</h2>
            <p className="mt-4 text-sentinel-300 text-lg max-w-2xl mx-auto">
              These are the actual response roles you can select when you sign up
              for a deployment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roles.map((role) => {
              const Icon = role.icon;
              return (
                <div
                  key={role.title}
                  className="p-6 rounded-2xl bg-sentinel-800/60 border border-sentinel-700 hover:border-fire-600/40 transition-all"
                >
                  <div className="w-11 h-11 rounded-xl bg-fire-600/10 border border-fire-600/20 flex items-center justify-center mb-4">
                    <Icon size={20} className="text-fire-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{role.title}</h3>
                  <p className="text-sentinel-300 text-sm leading-relaxed mb-3">{role.description}</p>
                  <p className="text-sentinel-400 text-xs leading-relaxed border-t border-sentinel-700 pt-3">
                    <span className="font-semibold text-sentinel-300">Requirements: </span>
                    {role.requirements}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Why Volunteer ── */}
      <section className="bg-sentinel-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Why Volunteer with NWTT?</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {benefits.map((b) => {
              const Icon = b.icon;
              return (
                <div
                  key={b.title}
                  className="text-center p-6 rounded-2xl bg-sentinel-900 border border-sentinel-700"
                >
                  <div className="w-11 h-11 rounded-xl bg-fire-600/10 border border-fire-600/20 flex items-center justify-center mx-auto mb-4">
                    <Icon size={20} className="text-fire-400" />
                  </div>
                  <h3 className="text-white font-semibold mb-2">{b.title}</h3>
                  <p className="text-sentinel-300 text-sm leading-relaxed">{b.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-sentinel-900 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center rounded-3xl bg-gradient-to-br from-fire-600/15 via-sentinel-800 to-sentinel-900 border border-fire-600/20 p-10 sm:p-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Ready to Deploy?
            </h2>
            <p className="text-sentinel-200 max-w-xl mx-auto mb-8">
              Create your NWTT account, complete your volunteer profile, and
              sign up for a deployment — all in one place.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href={`${getAppOrigin()}/register`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-fire-600 text-white font-semibold hover:bg-fire-500 transition-colors shadow-lg shadow-fire-600/25"
              >
                <UserPlus size={18} />
                Create Your Account
              </a>
              <a
                href={`${getAppOrigin()}/login`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sentinel-700 text-white font-semibold hover:bg-sentinel-600 transition-colors border border-sentinel-600"
              >
                <KeyRound size={18} />
                Already Registered? Log In
              </a>
            </div>
            <div className="mt-6 flex flex-col items-center gap-2">
              <a
                href={`${getAppOrigin()}/deployments`}
                className="inline-flex items-center gap-1.5 text-sentinel-300 hover:text-fire-400 text-sm transition-colors"
              >
                Browse open deployments
                <ArrowRight size={13} />
              </a>
              <Link
                to="/volunteer"
                className="inline-flex items-center gap-1.5 text-sentinel-400 hover:text-fire-400 text-sm transition-colors"
              >
                Looking for a tracking desk role instead? See our other volunteer opportunities
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
