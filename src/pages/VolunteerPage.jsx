import { useState } from 'react';
import {
  Send,
  CheckCircle,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';

const roleOptions = [
  'Reporter',
  'Data Engineer',
  'Weather Analyst',
  'Communications / Social Media',
  'GIS & Mapping Specialist',
  'Community Liaison',
  'Web Developer',
  'Other',
];

const experienceOptions = [
  'No prior experience',
  'Some related experience',
  '1-3 years experience',
  '3-5 years experience',
  '5+ years experience',
];

const availabilityOptions = [
  '1-5 hours per week',
  '5-10 hours per week',
  '10-20 hours per week',
  '20+ hours per week',
];

export default function VolunteerPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    state: '',
    role: '',
    experience: '',
    availability: '',
    motivation: '',
    skills: '',
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // In a real application, this would send data to a backend
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-sentinel-900 flex items-center justify-center px-4">
        <div className="text-center max-w-md animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Application Submitted!</h2>
          <p className="text-sentinel-300 leading-relaxed mb-2">
            Thank you for your interest in volunteering with the National Wildfire
            Tracking Team, <span className="text-white font-medium">{form.firstName}</span>.
          </p>
          <p className="text-sentinel-400 text-sm">
            Our team will review your application and reach out to you at{' '}
            <span className="text-sentinel-200">{form.email}</span> within 5-7 business days.
          </p>
        </div>
      </div>
    );
  }

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
              through real-time wildfire intelligence. No matter your background,
              there's a place for you on our team.
            </p>
          </div>
        </div>
      </section>

      {/* ── Form Section ── */}
      <section className="bg-sentinel-800 py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-sentinel-900 border border-sentinel-700 p-6 sm:p-10">
            <h2 className="text-2xl font-bold text-white mb-2">Volunteer Application</h2>
            <p className="text-sentinel-400 text-sm mb-8">
              Fill out the form below and we'll be in touch. All fields marked with * are required.
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="flex items-center gap-1.5 text-sm font-medium text-sentinel-200 mb-2">
                    <User size={14} className="text-sentinel-400" />
                    First Name *
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    value={form.firstName}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-600 text-white placeholder-sentinel-500 text-sm focus:outline-none focus:ring-2 focus:ring-fire-600/50 focus:border-fire-600 transition-colors"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="flex items-center gap-1.5 text-sm font-medium text-sentinel-200 mb-2">
                    Last Name *
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    value={form.lastName}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-600 text-white placeholder-sentinel-500 text-sm focus:outline-none focus:ring-2 focus:ring-fire-600/50 focus:border-fire-600 transition-colors"
                    placeholder="Doe"
                  />
                </div>
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="email" className="flex items-center gap-1.5 text-sm font-medium text-sentinel-200 mb-2">
                    <Mail size={14} className="text-sentinel-400" />
                    Email Address *
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-600 text-white placeholder-sentinel-500 text-sm focus:outline-none focus:ring-2 focus:ring-fire-600/50 focus:border-fire-600 transition-colors"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="flex items-center gap-1.5 text-sm font-medium text-sentinel-200 mb-2">
                    <Phone size={14} className="text-sentinel-400" />
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-600 text-white placeholder-sentinel-500 text-sm focus:outline-none focus:ring-2 focus:ring-fire-600/50 focus:border-fire-600 transition-colors"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              {/* State */}
              <div>
                <label htmlFor="state" className="flex items-center gap-1.5 text-sm font-medium text-sentinel-200 mb-2">
                  <MapPin size={14} className="text-sentinel-400" />
                  State / Region *
                </label>
                <input
                  id="state"
                  name="state"
                  type="text"
                  required
                  value={form.state}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-600 text-white placeholder-sentinel-500 text-sm focus:outline-none focus:ring-2 focus:ring-fire-600/50 focus:border-fire-600 transition-colors"
                  placeholder="California"
                />
              </div>

              {/* Role Interest */}
              <div>
                <label htmlFor="role" className="flex items-center gap-1.5 text-sm font-medium text-sentinel-200 mb-2">
                  <Briefcase size={14} className="text-sentinel-400" />
                  Role of Interest *
                </label>
                <div className="relative">
                  <select
                    id="role"
                    name="role"
                    required
                    value={form.role}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-fire-600/50 focus:border-fire-600 transition-colors appearance-none"
                  >
                    <option value="" disabled>Select a role...</option>
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
                </div>
              </div>

              {/* Experience & Availability */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="experience" className="text-sm font-medium text-sentinel-200 mb-2 block">
                    Experience Level *
                  </label>
                  <div className="relative">
                    <select
                      id="experience"
                      name="experience"
                      required
                      value={form.experience}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-fire-600/50 focus:border-fire-600 transition-colors appearance-none"
                    >
                      <option value="" disabled>Select...</option>
                      {experienceOptions.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label htmlFor="availability" className="text-sm font-medium text-sentinel-200 mb-2 block">
                    Weekly Availability *
                  </label>
                  <div className="relative">
                    <select
                      id="availability"
                      name="availability"
                      required
                      value={form.availability}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-fire-600/50 focus:border-fire-600 transition-colors appearance-none"
                    >
                      <option value="" disabled>Select...</option>
                      {availabilityOptions.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Skills */}
              <div>
                <label htmlFor="skills" className="text-sm font-medium text-sentinel-200 mb-2 block">
                  Relevant Skills
                </label>
                <input
                  id="skills"
                  name="skills"
                  type="text"
                  value={form.skills}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-600 text-white placeholder-sentinel-500 text-sm focus:outline-none focus:ring-2 focus:ring-fire-600/50 focus:border-fire-600 transition-colors"
                  placeholder="e.g., GIS, Python, weather analysis, emergency management..."
                />
              </div>

              {/* Motivation */}
              <div>
                <label htmlFor="motivation" className="flex items-center gap-1.5 text-sm font-medium text-sentinel-200 mb-2">
                  <MessageSquare size={14} className="text-sentinel-400" />
                  Why do you want to volunteer? *
                </label>
                <textarea
                  id="motivation"
                  name="motivation"
                  required
                  rows={4}
                  value={form.motivation}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-600 text-white placeholder-sentinel-500 text-sm focus:outline-none focus:ring-2 focus:ring-fire-600/50 focus:border-fire-600 transition-colors resize-none"
                  placeholder="Tell us about your interest in wildfire tracking and what motivates you to volunteer..."
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-fire-600 text-white font-semibold hover:bg-fire-500 transition-colors shadow-lg shadow-fire-600/25 text-sm"
              >
                <Send size={16} />
                Submit Application
              </button>

              <p className="text-center text-sentinel-500 text-xs">
                By submitting this form, you agree to be contacted by the National Wildfire
                Tracking Team regarding volunteer opportunities.
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
