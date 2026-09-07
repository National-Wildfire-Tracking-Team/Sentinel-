import { NavLink } from 'react-router-dom';
import { ShieldAlert, CloudLightning, HeartHandshake, Users } from 'lucide-react';

const tabs = [
  { to: '/disaster-response', label: 'Response', icon: ShieldAlert, end: true },
  { to: '/disaster-response/preparedness', label: 'Preparedness', icon: CloudLightning },
  { to: '/disaster-response/recovery', label: 'Recovery', icon: HeartHandshake },
  { to: '/disaster-response/get-involved', label: 'Get Involved', icon: Users },
];

export default function SubNav() {
  return (
    <div className="sticky top-16 z-40 bg-sentinel-800/95 backdrop-blur-md border-b border-sentinel-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex gap-1 py-3 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-fire-600/15 text-fire-400'
                      : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700/60'
                  }`
                }
              >
                <Icon size={15} />
                {tab.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
