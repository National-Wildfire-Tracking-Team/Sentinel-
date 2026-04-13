import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Flame, Menu, X, LogIn, LogOut, ShieldCheck, Send } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/volunteer', label: 'Volunteer' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAuthenticated, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    setMobileOpen(false);
    navigate('/');
  };

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
            {isAuthenticated ? (
              <NavLink
                to="/submit-report"
                className={({ isActive }) =>
                  `inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-fire-600/15 text-fire-400'
                      : 'text-sentinel-200 hover:text-white hover:bg-sentinel-700/60'
                  }`
                }
              >
                <Send size={13} /> Report a Fire
              </NavLink>
            ) : (
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-fire-600/15 text-fire-400'
                      : 'text-sentinel-200 hover:text-white hover:bg-sentinel-700/60'
                  }`
                }
              >
                <LogIn size={13} /> Reporter Sign In
              </NavLink>
            )}

            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-fire-600/15 text-fire-400'
                      : 'text-sentinel-200 hover:text-white hover:bg-sentinel-700/60'
                  }`
                }
              >
                <ShieldCheck size={13} /> Admin
              </NavLink>
            )}

            {isAuthenticated && (
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-sentinel-300 hover:text-white hover:bg-sentinel-700/60 transition-colors"
              >
                <LogOut size={13} /> Sign Out
              </button>
            )}

            <NavLink
              to="/live-tracker"
              className="ml-2 px-4 py-2 rounded-lg text-sm font-semibold bg-fire-600 text-white hover:bg-fire-500 transition-colors"
            >
              View Live Map
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

            {isAuthenticated ? (
              <NavLink
                to="/submit-report"
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2.5 rounded-lg text-sm font-medium text-sentinel-200 hover:text-white hover:bg-sentinel-700/60"
              >
                Report a Fire
              </NavLink>
            ) : (
              <NavLink
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2.5 rounded-lg text-sm font-medium text-sentinel-200 hover:text-white hover:bg-sentinel-700/60"
              >
                Reporter Sign In
              </NavLink>
            )}
            {isAdmin && (
              <NavLink
                to="/admin"
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2.5 rounded-lg text-sm font-medium text-sentinel-200 hover:text-white hover:bg-sentinel-700/60"
              >
                Admin Dashboard
              </NavLink>
            )}
            {isAuthenticated && (
              <button
                onClick={handleSignOut}
                className="w-full text-left block px-4 py-2.5 rounded-lg text-sm font-medium text-sentinel-300 hover:text-white hover:bg-sentinel-700/60"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
