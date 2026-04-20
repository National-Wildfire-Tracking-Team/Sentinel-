import { Navigate, useNavigate } from 'react-router-dom';
import { ChevronLeft, MapPin } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import MapAddressSearchPanel from '../components/Auth/MapAddressSearchPanel';

export default function ManageZipcodesPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0c0e] flex items-center justify-center text-sentinel-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: '/manage-zipcodes' }} replace />;
  }

  return (
    <div className="min-h-screen bg-[#0a0c0e] px-4 sm:px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <button
          onClick={() => navigate('/account')}
          className="inline-flex items-center gap-1.5 text-xs text-sentinel-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={13} />
          Back to Account
        </button>

        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-emerald-400" />
          <h1 className="text-xl sm:text-2xl font-bold text-white">Manage My Zip Codes</h1>
        </div>

        <MapAddressSearchPanel asPage />
      </div>
    </div>
  );
}
