import { useRef, useState, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Flame, Menu, X, Heart, Settings, LogOut, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useConfirmSignOut } from '../../hooks/useConfirmSignOut';
import { getAppOrigin } from '../../utils/getAppOrigin';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/volunteer', label: 'Volunteer' },
  { to: '/pricing', label: 'Pricing' },
];

// Pages that open with a ParallaxHero. The bar is transparent over the photo
// and turns back to the solid bar once the photo has scrolled out from under it.
const HERO_ROUTES = new Set(['/', '/about', '/volunteer']);
const NAV_HEIGHT = 64;

function useOverHero(enabled) {
  const [overHero, setOverHero] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setOverHero(false);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const hero = document.querySelector('[data-parallax-hero]');
      // The route chunk may not have mounted yet; treat that as still at the top.
      setOverHero(hero ? hero.getBoundingClientRect().bottom > NAV_HEIGHT : window.scrollY < NAV_HEIGHT);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);

  return overHero;
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { requestSignOut, signOutDialog } = useConfirmSignOut(() => navigate('/'));
  const userMenuRef = useRef(null);
  const { pathname } = useLocation();
  const overHero = useOverHero(HERO_ROUTES.has(pathname));
  const clear = overHero && !mobileOpen;

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

  function handleSignOut() {
    setUserMenuOpen(false);
    requestSignOut();
  }

  const userInitial = user?.email ? user.email[0].toUpperCase() : '?';

  return (
    <nav
      className={`sticky top-0 z-50 border-b transition-colors duration-300 ${
        clear
          ? 'bg-transparent border-transparent'
          : 'bg-sentinel-900/95 backdrop-blur-md border-sentinel-700'
      }`}
    >
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
              <span className={`text-[10px] font-medium tracking-wide uppercase ${clear ? 'text-sentinel-200' : 'text-sentinel-400'}`}>
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
            <a
              href={`${getAppOrigin()}/`}
              className="ml-2 px-4 py-2 rounded-lg text-sm font-semibold bg-fire-600 text-white hover:bg-fire-500 transition-colors"
            >
              Sentinel
            </a>

            {!isAuthenticated && (
              <a
                href={`${getAppOrigin()}/login?from=home`}
                aria-label="Login"
                title="Login"
                className={`ml-2 flex items-center justify-center w-9 h-9 rounded-full border text-sentinel-200 hover:bg-sentinel-700 hover:text-white transition-colors ${
                  clear ? 'border-white/25 bg-white/10' : 'border-sentinel-600 bg-sentinel-800'
                }`}
              >
                <User size={18} />
              </a>
            )}

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
            <a
              href={`${getAppOrigin()}/login?from=home`}
              onClick={() => setMobileOpen(false)}
              className="block px-4 py-2.5 rounded-lg text-sm font-medium text-sentinel-200 hover:text-white hover:bg-sentinel-700/60 transition-colors"
            >
              Login
            </a>
            <a
              href={`${getAppOrigin()}/`}
              onClick={() => setMobileOpen(false)}
              className="block px-4 py-2.5 rounded-lg text-sm font-semibold bg-fire-600 text-white hover:bg-fire-500 transition-colors"
            >
              Sentinel
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

      {signOutDialog}
    </nav>
  );
}
