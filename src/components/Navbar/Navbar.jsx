import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Flame, Menu, X, Heart } from 'lucide-react';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/volunteer', label: 'Volunteer' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-sentinel-900/95 backdrop-blur-md border-b border-sentinel-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="relative">
              <Flame size={26} className="text-fire-600 group-hover:text-fire-500 transition-colors" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-fire-500 rounded-full animate-pulse" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-white text-lg tracking-tight">
                NWTT
              </span>
              <span className="text-[10px] text-sentinel-400 font-medium tracking-wide uppercase">
                National Wildfire Tracking Team
              </span>
            </div>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-fire-600/15 text-fire-400'
                      : 'text-sentinel-200 hover:text-white hover:bg-sentinel-700/60'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <a
              href="https://givebutter.com/national-wildfire-tracking-team-dvi6jx"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-pink-600 text-white hover:bg-pink-500 transition-colors"
            >
              <Heart size={15} />
              Donate
            </a>
            <NavLink
              to="/sentinel"
              className="ml-2 px-4 py-2 rounded-lg text-sm font-semibold bg-fire-600 text-white hover:bg-fire-500 transition-colors"
            >
              Sentinel<sup className="ml-0.5 text-[0.6em] font-bold tracking-wider align-super">BETA</sup>
            </NavLink>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-md text-sentinel-300 hover:text-white hover:bg-sentinel-700 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-sentinel-700 bg-sentinel-900/98 backdrop-blur-md animate-fade-in">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-fire-600/15 text-fire-400'
                      : 'text-sentinel-200 hover:text-white hover:bg-sentinel-700/60'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}

            <a
              href="https://givebutter.com/national-wildfire-tracking-team-dvi6jx"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-pink-400 hover:text-white hover:bg-pink-600/20 transition-colors"
            >
              <Heart size={15} />
              Donate
            </a>

          </div>
        </div>
      )}
    </nav>
  );
}
