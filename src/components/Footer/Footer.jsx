import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-sentinel-900 border-t border-sentinel-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Flame size={22} className="text-fire-600" />
              <span className="font-bold text-white text-lg tracking-tight">NWTT</span>
            </div>
            <p className="text-sentinel-300 text-sm leading-relaxed max-w-xs">
              The National Wildfire Tracking Team is dedicated to monitoring, tracking,
              and providing real-time intelligence on wildfires across the United States.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">Quick Links</h3>
            <ul className="space-y-2.5">
              <li>
                <Link to="/" className="text-sentinel-300 hover:text-fire-400 text-sm transition-colors">Home</Link>
              </li>
              <li>
                <Link to="/about" className="text-sentinel-300 hover:text-fire-400 text-sm transition-colors">About the Team</Link>
              </li>
              <li>
                <Link to="/volunteer" className="text-sentinel-300 hover:text-fire-400 text-sm transition-colors">Volunteer</Link>
              </li>
              <li>
                <Link to="/live-tracker" className="text-sentinel-300 hover:text-fire-400 text-sm transition-colors">Live Wildfire Tracker</Link>
              </li>
              <li>
                <Link to="/privacy-policy" className="text-sentinel-300 hover:text-fire-400 text-sm transition-colors">Privacy Policy</Link>
              </li>
              <li>
                <Link to="/terms" className="text-sentinel-300 hover:text-fire-400 text-sm transition-colors">Terms of Service</Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">Resources</h3>
            <ul className="space-y-2.5">
              <li>
                <a href="https://www.nifc.gov" target="_blank" rel="noopener noreferrer" className="text-sentinel-300 hover:text-fire-400 text-sm transition-colors">
                  NIFC (National Interagency Fire Center)
                </a>
              </li>
              <li>
                <a href="https://inciweb.wildfire.gov" target="_blank" rel="noopener noreferrer" className="text-sentinel-300 hover:text-fire-400 text-sm transition-colors">
                  InciWeb Incident Information
                </a>
              </li>
              <li>
                <a href="https://www.weather.gov" target="_blank" rel="noopener noreferrer" className="text-sentinel-300 hover:text-fire-400 text-sm transition-colors">
                  National Weather Service
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-sentinel-700 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sentinel-400 text-xs">
            &copy; {new Date().getFullYear()} National Wildfire Tracking Team. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/terms" className="text-sentinel-400 hover:text-fire-400 transition-colors">
              Terms of Service
            </Link>
            <p className="text-sentinel-500">
              Data sourced from NASA FIRMS, NIFC, NOAA &amp; NWS
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
