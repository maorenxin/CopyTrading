import { useState, useEffect } from 'react';
import { TradingPlatform } from './components/TradingPlatform';
import { DebugTraderDetailModal } from './pages/DebugTraderDetailModal';
import { Toaster } from './components/ui/sonner';

export default function App() {
  const [showDebugModal, setShowDebugModal] = useState(false);

  useEffect(() => {
    // 检查URL参数是否包含debug=trader-modal
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'trader-modal') {
      setShowDebugModal(true);
    }
  }, []);

  // 如果URL参数要求显示调试模式，则只显示调试组件
  if (showDebugModal) {
    return <DebugTraderDetailModal />;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1A0B2E' }}>
      <TradingPlatform />
      <Toaster />
    </div>
  );
}