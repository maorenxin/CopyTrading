import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, DollarSign, Target, Activity, Bell } from 'lucide-react';

// Mock data for charts
const portfolioData = [
  { month: 'Jan', value: 25000, growth: 5.2 },
  { month: 'Feb', value: 27500, growth: 10.0 },
  { month: 'Mar', value: 26800, growth: 7.2 },
  { month: 'Apr', value: 31200, growth: 24.8 },
  { month: 'May', value: 34600, growth: 38.4 },
  { month: 'Jun', value: 36900, growth: 47.6 },
];

const recentActivity = [
  {
    id: 1,
    action: 'Investment Return',
    event: 'Jazz Festival 2023',
    amount: '+$1,240',
    time: '2 hours ago',
    type: 'return'
  },
  {
    id: 2,
    action: 'New Investment',
    event: 'Rock Arena Tour',
    amount: '-$500',
    time: '1 day ago',
    type: 'investment'
  },
  {
    id: 3,
    action: 'Investment Return',
    event: 'Electronic Night',
    amount: '+$890',
    time: '3 days ago',
    type: 'return'
  },
  {
    id: 4,
    action: 'New Investment',
    event: 'Classical Symphony',
    amount: '-$1,000',
    time: '5 days ago',
    type: 'investment'
  }
];

export function PortfolioSidebar() {
  return (
    <div
      className="w-80 p-6 border-l border-white/10"
      style={{
        background: 'linear-gradient(180deg, rgba(45, 27, 78, 0.8) 0%, rgba(26, 11, 46, 0.9) 100%)',
        backdropFilter: 'blur(10px)'
      }}
    >
      {/* Portfolio Overview */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-white mb-4">Your Portfolio</h2>

        <Card
          className="p-4 mb-4 bg-white/10 backdrop-blur-md border-white/20"
          style={{ backdropFilter: 'blur(10px)' }}
        >
          <div className="text-center">
            <p className="text-gray-300 text-sm mb-1">Total Portfolio Value</p>
            <p className="text-3xl font-bold text-white mb-2">$36,900</p>
            <div className="flex items-center justify-center text-green-400 text-sm">
              <TrendingUp className="w-4 h-4 mr-1" />
              +47.6% ($11,900)
            </div>
          </div>
        </Card>

        {/* Portfolio Metrics */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Card
            className="p-3 bg-white/10 backdrop-blur-md border-white/20"
            style={{ backdropFilter: 'blur(10px)' }}
          >
            <div className="text-center">
              <DollarSign className="w-6 h-6 text-blue-400 mx-auto mb-1" />
              <p className="text-xs text-gray-300">Active</p>
              <p className="text-lg font-bold text-white">8</p>
            </div>
          </Card>

          <Card
            className="p-3 bg-white/10 backdrop-blur-md border-white/20"
            style={{ backdropFilter: 'blur(10px)' }}
          >
            <div className="text-center">
              <Target className="w-6 h-6 text-green-400 mx-auto mb-1" />
              <p className="text-xs text-gray-300">Returns</p>
              <p className="text-lg font-bold text-white">22.4%</p>
            </div>
          </Card>
        </div>

        {/* Portfolio Chart */}
        <Card
          className="p-4 bg-white/10 backdrop-blur-md border-white/20"
          style={{ backdropFilter: 'blur(10px)' }}
        >
          <h3 className="text-sm font-semibold text-white mb-3">Portfolio Growth</h3>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={portfolioData}>
                <defs>
                  <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#portfolioGradient)"
                />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#9CA3AF' }}
                />
                <YAxis hide />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Recent Activity</h3>
          <Bell className="w-4 h-4 text-gray-400" />
        </div>

        <div className="space-y-3">
          {recentActivity.map((activity) => (
            <Card
              key={activity.id}
              className="p-3 bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/15 transition-colors"
              style={{ backdropFilter: 'blur(10px)' }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{activity.action}</p>
                  <p className="text-xs text-gray-300 mb-1">{activity.event}</p>
                  <p className="text-xs text-gray-400">{activity.time}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${activity.type === 'return' ? 'text-green-400' : 'text-blue-400'
                    }`}>
                    {activity.amount}
                  </p>
                  <Badge
                    variant="outline"
                    className={`text-xs ${activity.type === 'return'
                        ? 'border-green-500/30 text-green-400'
                        : 'border-blue-500/30 text-blue-400'
                      }`}
                  >
                    {activity.type}
                  </Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <Card
        className="p-4 bg-white/10 backdrop-blur-md border-white/20"
        style={{ backdropFilter: 'blur(10px)' }}
      >
        <h3 className="font-semibold text-white mb-3">Performance Metrics</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-gray-300">Total Invested</span>
            <span className="text-sm font-semibold text-white">$25,000</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-300">Total Returns</span>
            <span className="text-sm font-semibold text-green-400">$11,900</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-300">Success Rate</span>
            <span className="text-sm font-semibold text-blue-400">87.5%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-300">Avg. Return</span>
            <span className="text-sm font-semibold text-purple-400">22.4%</span>
          </div>
        </div>
      </Card>
    </div>
  );
}