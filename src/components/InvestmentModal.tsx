import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { 
  X, 
  Users, 
  Calendar, 
  TrendingUp, 
  DollarSign, 
  Shield, 
  Info,
  ChevronRight,
  Check
} from 'lucide-react';
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

interface InvestmentModalProps {
  investment: Investment | null;
  isOpen: boolean;
  onClose: () => void;
}

export function InvestmentModal({ investment, isOpen, onClose }: InvestmentModalProps) {
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);

  if (!investment) return null;

  const fundingPercentage = (investment.currentFunding / investment.fundingGoal) * 100;

  const investmentTiers = [
    { amount: investment.minInvestment, returns: '12-15%', shares: '0.1%' },
    { amount: investment.minInvestment * 5, returns: '15-18%', shares: '0.5%' },
    { amount: investment.minInvestment * 10, returns: '18-22%', shares: '1.0%' },
    { amount: investment.minInvestment * 20, returns: '22-25%', shares: '2.0%' }
  ];

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Low': return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'Medium': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'High': return 'text-red-400 bg-red-500/20 border-red-500/30';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const handleInvest = () => {
    // Mock investment logic
    alert(`Investment of $${investmentAmount} submitted successfully!`);
    setCurrentStep(4);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Choose Investment Amount</h3>
              
              {/* Quick Select Buttons */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {investmentTiers.map((tier, index) => (
                  <Card
                    key={index}
                    className={`p-4 cursor-pointer transition-all bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/15 ${
                      selectedTier === index ? 'ring-2 ring-blue-500 bg-blue-500/10' : ''
                    }`}
                    onClick={() => {
                      setSelectedTier(index);
                      setInvestmentAmount(tier.amount.toString());
                    }}
                  >
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">${tier.amount.toLocaleString()}</p>
                      <p className="text-sm text-gray-300">{tier.returns} returns</p>
                      <p className="text-xs text-gray-400">{tier.shares} equity</p>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Custom Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Custom Amount (Min: ${investment.minInvestment})
                </label>
                <Input
                  type="number"
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(e.target.value)}
                  placeholder={`$${investment.minInvestment}`}
                  className="bg-white/10 border-white/20 text-white placeholder-gray-400"
                />
              </div>
            </div>

            <Button 
              onClick={() => setCurrentStep(2)}
              disabled={!investmentAmount || parseInt(investmentAmount) < investment.minInvestment}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
            >
              Continue to Payment
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Payment Method</h3>
              
              <div className="space-y-4">
                <Card className="p-4 bg-white/10 backdrop-blur-md border-white/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">Credit Card</p>
                      <p className="text-sm text-gray-300">Instant processing</p>
                    </div>
                    <input type="radio" name="payment" defaultChecked className="text-blue-500" />
                  </div>
                </Card>

                <Card className="p-4 bg-white/10 backdrop-blur-md border-white/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">Bank Transfer</p>
                      <p className="text-sm text-gray-300">1-3 business days</p>
                    </div>
                    <input type="radio" name="payment" className="text-blue-500" />
                  </div>
                </Card>
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setCurrentStep(1)}
                className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                Back
              </Button>
              <Button 
                onClick={() => setCurrentStep(3)}
                className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Confirm Investment</h3>
              
              <Card className="p-4 bg-white/10 backdrop-blur-md border-white/20 mb-4">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Investment Amount:</span>
                    <span className="text-white font-semibold">${parseInt(investmentAmount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Processing Fee (2.5%):</span>
                    <span className="text-white">${Math.round(parseInt(investmentAmount) * 0.025).toLocaleString()}</span>
                  </div>
                  <hr className="border-white/20" />
                  <div className="flex justify-between">
                    <span className="text-white font-semibold">Total Amount:</span>
                    <span className="text-white font-bold">${Math.round(parseInt(investmentAmount) * 1.025).toLocaleString()}</span>
                  </div>
                </div>
              </Card>

              <Card className="p-4 bg-amber-500/10 border-amber-500/30">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-amber-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-400">Risk Disclaimer</p>
                    <p className="text-xs text-amber-300/80 mt-1">
                      Investments involve risk and may result in partial or total loss of capital. 
                      Past performance does not guarantee future results.
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setCurrentStep(2)}
                className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                Back
              </Button>
              <Button 
                onClick={handleInvest}
                className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
              >
                Confirm Investment
              </Button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">Investment Successful!</h3>
              <p className="text-gray-300">
                Your investment of ${parseInt(investmentAmount).toLocaleString()} has been processed successfully.
              </p>
            </div>
            <Button 
              onClick={onClose}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
            >
              View Portfolio
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-4xl bg-transparent border-0 p-0"
        style={{ backgroundColor: 'transparent' }}
        aria-describedby="investment-modal-description"
      >
        <DialogDescription id="investment-modal-description" className="sr-only">
          Investment details and funding options for {investment.title}
        </DialogDescription>
        <div 
          className="bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-6"
          style={{ 
            background: 'linear-gradient(135deg, rgba(45, 27, 78, 0.9) 0%, rgba(26, 11, 46, 0.95) 100%)',
            backdropFilter: 'blur(20px)'
          }}
        >
          {/* Progress Indicator */}
          {currentStep < 4 && (
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-300 mb-2">
                <span>Step {currentStep} of 3</span>
                <span>{Math.round((currentStep / 3) * 100)}% Complete</span>
              </div>
              <Progress value={(currentStep / 3) * 100} className="h-2" />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Side - Investment Details */}
            <div>
              <div className="relative h-48 rounded-lg overflow-hidden mb-4">
                <ImageWithFallback
                  src={investment.image}
                  alt={investment.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <h2 className="text-xl font-bold text-white">{investment.title}</h2>
                  <p className="text-gray-200">by {investment.artist}</p>
                </div>
              </div>

              {/* Investment Stats */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Funding Progress</span>
                  <div className="text-right">
                    <span className="text-blue-400 font-semibold">{Math.round(fundingPercentage)}%</span>
                    <div className="text-sm text-gray-400">
                      ${investment.currentFunding.toLocaleString()} / ${investment.fundingGoal.toLocaleString()}
                    </div>
                  </div>
                </div>

                <Progress value={fundingPercentage} className="h-2" />

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-400" />
                    <span className="text-gray-300">{investment.daysLeft} days left</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-300">{investment.backers} backers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-gray-300">{investment.expectedReturn} returns</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-yellow-400" />
                    <Badge className={`text-xs ${getRiskColor(investment.riskLevel)} border`}>
                      {investment.riskLevel} Risk
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Investment Flow */}
            <div>
              {renderStep()}
            </div>
          </div>

          {/* Close Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}