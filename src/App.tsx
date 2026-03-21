import { TradingPlatform } from './components/TradingPlatform';
import { Toaster } from './components/ui/sonner';

export default function App() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0e17' }}>
      <TradingPlatform />
      <Toaster />
    </div>
  );
}
