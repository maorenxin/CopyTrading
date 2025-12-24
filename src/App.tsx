import { TradingPlatform } from './components/TradingPlatform';
import { Toaster } from './components/ui/sonner';

export default function App() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1A0B2E' }}>
      <TradingPlatform />
      <Toaster />
    </div>
  );
}