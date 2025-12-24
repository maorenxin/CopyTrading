import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Calendar, Users, TrendingUp } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface Investment {
  id: number;
  title: string;
  artist: string;
  image: string;
  fundingGoal: number;
  currentFunding: number;
  daysLeft: number;
  minInvestment: number;
  expectedReturn: string;
  riskLevel: string;
  backers: number;
}

interface InvestmentCardProps {
  investment: Investment;
  onClick: () => void;
}

export function InvestmentCard({ investment, onClick }: InvestmentCardProps) {
  const fundingPercentage = (investment.currentFunding / investment.fundingGoal) * 100;
  
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Low': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'Medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'High': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <Card 
      className="group relative overflow-hidden bg-gradient-to-br from-purple-900/50 to-purple-800/30 border-purple-700/50 hover:border-purple-600/70 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/25 cursor-pointer backdrop-blur-sm"
      onClick={onClick}
      style={{ 
        background: 'linear-gradient(135deg, #2D1B4E 0%, #1A0B2E 100%)',
        backdropFilter: 'blur(10px)'
      }}
    >
      {/* Background Image with Overlay */}
      <div className="relative h-48 overflow-hidden">
        <ImageWithFallback
          src={investment.image}
          alt={investment.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        
        {/* Risk Badge */}
        <Badge 
          className={`absolute top-3 left-3 ${getRiskColor(investment.riskLevel)} border`}
        >
          {investment.riskLevel} Risk
        </Badge>
        
        {/* Days Left Badge */}
        <Badge className="absolute top-3 right-3 bg-blue-500/80 text-white border-blue-400/50">
          {investment.daysLeft} days left
        </Badge>
      </div>

      <div className="p-6">
        {/* Title and Artist */}
        <div className="mb-4">
          <h3 className="text-xl font-bold text-white mb-1 group-hover:text-blue-300 transition-colors">
            {investment.title}
          </h3>
          <p className="text-gray-300">by {investment.artist}</p>
        </div>

        {/* Funding Progress */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-300">Funding Progress</span>
            <span className="text-sm font-semibold text-blue-400">
              {Math.round(fundingPercentage)}%
            </span>
          </div>
          
          {/* Custom Circular Progress */}
          <div className="relative w-20 h-20 mx-auto mb-3">
            <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 100 100">
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-purple-800/50"
              />
              {/* Progress circle */}
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - fundingPercentage / 100)}`}
                className="text-blue-400 transition-all duration-500"
                strokeLinecap="round"
                style={{
                  filter: 'drop-shadow(0 0 6px rgb(59 130 246 / 0.5))'
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-white">
                {Math.round(fundingPercentage)}%
              </span>
            </div>
          </div>

          <div className="text-center text-sm text-gray-300">
            <span className="text-blue-400 font-semibold">
              ${investment.currentFunding.toLocaleString()}
            </span>
            {' '} of ${investment.fundingGoal.toLocaleString()}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div className="flex items-center text-gray-300">
            <Users className="w-4 h-4 mr-2 text-purple-400" />
            {investment.backers} backers
          </div>
          <div className="flex items-center text-gray-300">
            <TrendingUp className="w-4 h-4 mr-2 text-green-400" />
            {investment.expectedReturn}
          </div>
        </div>

        {/* Investment Info */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">Min. Investment:</span>
            <span className="text-blue-400 font-semibold">${investment.minInvestment}</span>
          </div>
        </div>

        {/* CTA Button */}
        <Button 
          className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/25"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          View Details
        </Button>
      </div>
    </Card>
  );
}