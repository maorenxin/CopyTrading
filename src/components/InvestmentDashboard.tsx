import { useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Users, 
  Plus, 
  Search,
  Filter,
  Eye,
  Target
} from 'lucide-react';
import { InvestmentCard } from './InvestmentCard';
import { PortfolioSidebar } from './PortfolioSidebar';
import { InvestmentModal } from './InvestmentModal';

// Mock data
const investments = [
  {
    id: 1,
    title: "Jazz Festival 2024",
    artist: "Blue Note Collective",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=300&fit=crop",
    fundingGoal: 50000,
    currentFunding: 35750,
    daysLeft: 15,
    minInvestment: 100,
    expectedReturn: "15-25%",
    riskLevel: "Medium",
    backers: 127
  },
  {
    id: 2,
    title: "Rock Arena Tour",
    artist: "Thunder Storm",
    image: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400&h=300&fit=crop",
    fundingGoal: 150000,
    currentFunding: 89250,
    daysLeft: 8,
    minInvestment: 250,
    expectedReturn: "20-30%",
    riskLevel: "High",
    backers: 203
  },
  {
    id: 3,
    title: "Indie Music Festival",
    artist: "Various Artists",
    image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=300&fit=crop",
    fundingGoal: 75000,
    currentFunding: 67500,
    daysLeft: 22,
    minInvestment: 50,
    expectedReturn: "12-18%",
    riskLevel: "Low",
    backers: 456
  },
  {
    id: 4,
    title: "Electronic Night",
    artist: "Digital Waves",
    image: "https://images.unsplash.com/photo-1571266028243-d220c9c67b89?w=400&h=300&fit=crop",
    fundingGoal: 25000,
    currentFunding: 23750,
    daysLeft: 3,
    minInvestment: 75,
    expectedReturn: "18-22%",
    riskLevel: "Medium",
    backers: 89
  },
  {
    id: 5,
    title: "Classical Symphony",
    artist: "Metropolitan Orchestra",
    image: "https://images.unsplash.com/photo-1460306855393-0410f61241c7?w=400&h=300&fit=crop",
    fundingGoal: 100000,
    currentFunding: 45000,
    daysLeft: 30,
    minInvestment: 500,
    expectedReturn: "10-15%",
    riskLevel: "Low",
    backers: 78
  },
  {
    id: 6,
    title: "Hip Hop Showcase",
    artist: "Urban Collective",
    image: "https://images.unsplash.com/photo-1571609770842-8cc503de5b7f?w=400&h=300&fit=crop",
    fundingGoal: 60000,
    currentFunding: 42000,
    daysLeft: 12,
    minInvestment: 150,
    expectedReturn: "16-24%",
    riskLevel: "Medium",
    backers: 156
  }
];

export function InvestmentDashboard() {
  const [selectedInvestment, setSelectedInvestment] = useState<typeof investments[0] | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleInvestmentClick = (investment: typeof investments[0]) => {
    setSelectedInvestment(investment);
    setIsModalOpen(true);
  };

  const filteredInvestments = investments.filter(investment =>
    investment.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    investment.artist.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex min-h-screen text-white">
      {/* Main Content */}
      <div className="flex-1 p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Investment Opportunities</h1>
              <p className="text-gray-300">Discover and invest in the next big music events</p>
            </div>
            
            {/* Search and Filters */}
            <div className="flex gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search events..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ backdropFilter: 'blur(10px)' }}
                />
              </div>
              <Button 
                variant="outline" 
                className="bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20"
                style={{ backdropFilter: 'blur(10px)' }}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card 
              className="p-4 bg-white/10 backdrop-blur-md border-white/20"
              style={{ backdropFilter: 'blur(10px)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-300 text-sm">Total Opportunities</p>
                  <p className="text-2xl font-bold text-white">{investments.length}</p>
                </div>
                <Target className="w-8 h-8 text-blue-400" />
              </div>
            </Card>
            
            <Card 
              className="p-4 bg-white/10 backdrop-blur-md border-white/20"
              style={{ backdropFilter: 'blur(10px)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-300 text-sm">Active Campaigns</p>
                  <p className="text-2xl font-bold text-white">{investments.filter(i => i.daysLeft > 0).length}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-400" />
              </div>
            </Card>
            
            <Card 
              className="p-4 bg-white/10 backdrop-blur-md border-white/20"
              style={{ backdropFilter: 'blur(10px)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-300 text-sm">Total Raised</p>
                  <p className="text-2xl font-bold text-white">
                    ${investments.reduce((sum, inv) => sum + inv.currentFunding, 0).toLocaleString()}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-blue-400" />
              </div>
            </Card>
            
            <Card 
              className="p-4 bg-white/10 backdrop-blur-md border-white/20"
              style={{ backdropFilter: 'blur(10px)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-300 text-sm">Total Backers</p>
                  <p className="text-2xl font-bold text-white">
                    {investments.reduce((sum, inv) => sum + inv.backers, 0).toLocaleString()}
                  </p>
                </div>
                <Users className="w-8 h-8 text-purple-400" />
              </div>
            </Card>
          </div>
        </div>

        {/* Investment Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {filteredInvestments.map((investment) => (
            <InvestmentCard
              key={investment.id}
              investment={investment}
              onClick={() => handleInvestmentClick(investment)}
            />
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <PortfolioSidebar />

      {/* Floating Investment Button */}
      <Button
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/25 transition-all duration-300 hover:scale-110"
        onClick={() => setIsModalOpen(true)}
      >
        <Plus className="w-6 h-6" />
      </Button>

      {/* Investment Modal */}
      <InvestmentModal
        investment={selectedInvestment}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedInvestment(null);
        }}
      />
    </div>
  );
}