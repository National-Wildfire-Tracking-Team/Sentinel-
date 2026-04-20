import { useRef, useState, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Flame, Menu, X, Heart, User, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/volunteer', label: 'Volunteer' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();
  const userMenuRef = useRef(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  async function handleSignOut() {
    setUserMenuOpen(false);
    await signOut();
    navigate('/');
  }

  const userInitial = user?.email ? user.email[0].toUpperCase() : '?';

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

            {/* User menu (logged-in only) */}
            {isAuthenticated && (
              <div className="relative ml-2" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(v => !v)}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-fire-600 hover:bg-fire-500 text-white text-xs font-bold transition-colors"
                  aria-label="User menu"
                  title={user?.email}
                >
                  {userInitial}
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-sentinel-600 bg-sentinel-800 shadow-2xl z-50 overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-sentinel-700">
                      <p className="text-xs font-medium text-white truncate">{user?.email}</p>
                      <p className="text-[10px] text-sentinel-400 mt-0.5">Signed in</p>
                    </div>
                    <div className="py-1">
                      <Link
                        to="/account"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full text-left px-3 py-2 text-sm text-sentinel-200 hover:bg-sentinel-700 hover:text-white transition-colors flex items-center gap-2"
                      >
                        <Settings size={13} />
                        Account Settings
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-3 py-2 text-sm text-sentinel-200 hover:bg-sentinel-700 hover:text-white transition-colors flex items-center gap-2"
                      >
                        <LogOut size={13} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
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

            {isAuthenticated && (
              <>
                <div className="border-t border-sentinel-700 my-1" />
                <div className="px-1 py-0.5">
                  <p className="text-[10px] text-sentinel-500 px-3 pb-1 uppercase tracking-wider">{user?.email}</p>
                  <Link
                    to="/account"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-sentinel-200 hover:text-white hover:bg-sentinel-700/60 transition-colors"
                  >
                    <Settings size={15} />
                    Account Settings
                  </Link>
                  <button
                    onClick={() => { setMobileOpen(false); handleSignOut(); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-sentinel-200 hover:text-white hover:bg-sentinel-700/60 transition-colors"
                  >
                    <LogOut size={15} />
                    Sign Out
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </nav>
  );
}
