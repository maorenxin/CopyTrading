import { HashRouter, Routes, Route } from 'react-router-dom';
import { TradingPlatform } from './components/TradingPlatform';
import { Dashboard } from './components/dashboard/Dashboard';
import { Toaster } from './components/ui/sonner';

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen" style={{ backgroundColor: '#0a0e17' }}>
        <Routes>
          <Route path="/" element={<TradingPlatform />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
        <Toaster />
      </div>
    </HashRouter>
  );
}
