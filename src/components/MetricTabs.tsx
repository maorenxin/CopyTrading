import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import type { TimePeriod } from '../types/trader';

interface MetricTabsProps {
  value: TimePeriod;
  onChange: (value: TimePeriod) => void;
}

const options: TimePeriod[] = ['7D', '30D', '90D', 'ALL'];

export function MetricTabs({ value, onChange }: MetricTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as TimePeriod)}>
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
