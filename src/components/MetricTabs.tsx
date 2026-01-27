import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import type { TimePeriod } from '../types/trader';

interface MetricTabsProps {
  value: TimePeriod;
  onChange: (value: TimePeriod) => void;
}

const options: TimePeriod[] = ['7D', '30D', '90D', 'ALL'];

/**
 * 绩效窗口切换标签。
 * @param props - 标签参数。
 * @returns MetricTabs 组件。
 */
export function MetricTabs({ value, onChange }: MetricTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next: string) => onChange(next as TimePeriod)}>
      <TabsList className="bg-white/10 border border-white/20">
        {options.map((option) => (
          <TabsTrigger key={option} value={option} className="text-white/70">
            {option}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
