import { useState } from 'react';
import { Settings } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '../ui/sheet';
import { dashboardApi, StrategyConfig } from '../../services/dashboardApi';

// Editable fields, grouped for display. `step` drives the number input granularity.
const FIELDS: {
  group: string;
  items: { key: keyof StrategyConfig; label: string; hint: string; step: number; min: number }[];
}[] = [
  {
    group: 'Position',
    items: [
      { key: 'initial_capital', label: 'Initial Capital ($)', hint: '回测/实盘起始本金', step: 1000, min: 1 },
      { key: 'leverage', label: 'Leverage', hint: '单边敞口/本金，0.21 = gross 0.42x', step: 0.01, min: 0.01 },
      { key: 'n_long', label: 'Long Positions', hint: '做多币种数（动量最低）', step: 1, min: 1 },
      { key: 'n_short', label: 'Short Positions', hint: '做空币种数（动量最高）', step: 1, min: 1 },
    ],
  },
  {
    group: 'Signal',
    items: [
      { key: 'momentum_window', label: 'Momentum Window (days)', hint: '相对 BTC 收益的回看天数', step: 1, min: 1 },
      { key: 'fee_bps', label: 'Fee (bps)', hint: '每次换仓的有效费率', step: 0.1, min: 0 },
    ],
  },
  {
    group: 'Schedule',
    items: [
      { key: 'rebalance_hour_utc', label: 'Rebalance Hour (UTC)', hint: '每日换仓时点，0 = UTC 00:05 / 北京 08:05', step: 1, min: 0 },
    ],
  },
];

export function ConfigPanel() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Partial<StrategyConfig>>({});
  const [saving, setSaving] = useState(false);

  const openPanel = async () => {
    setOpen(true);
    try {
      const cfg = await dashboardApi.getConfig();
      setValues(cfg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载配置失败');
    }
  };

  const setField = (key: keyof StrategyConfig, raw: string) => {
    setValues(prev => ({ ...prev, [key]: raw === '' ? undefined : Number(raw) }));
  };

  const save = async () => {
    const patch: Partial<StrategyConfig> = {};
    for (const grp of FIELDS) {
      for (const f of grp.items) {
        const v = values[f.key];
        if (typeof v === 'number' && Number.isFinite(v)) {
          (patch as Record<string, number>)[f.key] = v;
        }
      }
    }
    setSaving(true);
    try {
      const updated = await dashboardApi.updateConfig(patch);
      setValues(updated);
      toast.success('参数已保存，下次换仓生效');
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={openPanel}
        title="Strategy Settings"
        className="p-1.5 text-gray-400 border border-[#1a2235] rounded hover:bg-[#1a2235] hover:text-[#00d4ff] transition"
      >
        <Settings className="size-4" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="bg-[#0d1421] border-l border-[#1a2235] text-white overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="text-[#00d4ff]">Strategy Settings</SheetTitle>
            <SheetDescription className="text-gray-500">
              修改仅影响下一次 rebalance，历史与当前持仓不变。
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4">
            {FIELDS.map(grp => (
              <div key={grp.group} className="flex flex-col gap-3">
                <div className="text-xs uppercase tracking-wider text-gray-500 border-b border-[#1a2235] pb-1">
                  {grp.group}
                </div>
                {grp.items.map(f => (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="text-sm text-gray-300">{f.label}</span>
                    <input
                      type="number"
                      step={f.step}
                      min={f.min}
                      value={values[f.key] ?? ''}
                      onChange={e => setField(f.key, e.target.value)}
                      className="bg-[#0f172a] border border-[#1a2235] rounded px-3 py-1.5 text-sm font-mono text-white focus:border-[#00d4ff] focus:outline-none transition"
                    />
                    <span className="text-xs text-gray-600">{f.hint}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>

          <SheetFooter>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] rounded hover:bg-[#00ff88]/20 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
