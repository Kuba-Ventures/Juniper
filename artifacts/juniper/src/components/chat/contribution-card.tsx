import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function ContributionCard({ 
  housePrice, 
  p1Contrib, 
  p2Contrib 
}: { 
  housePrice: number; 
  p1Contrib: number; 
  p2Contrib: number; 
}) {
  const formatCurrency = (num: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);

  const totalContrib = p1Contrib + p2Contrib;
  const p1Percent = totalContrib > 0 ? (p1Contrib / totalContrib) * 100 : 50;
  const p2Percent = totalContrib > 0 ? (p2Contrib / totalContrib) * 100 : 50;

  // Approximate equity split of the entire house based on initial down payment ratio
  const p1Equity = (housePrice * (p1Percent / 100));
  const p2Equity = (housePrice * (p2Percent / 100));

  return (
    <Card className="w-full shadow-sm" data-testid="contribution-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-serif">Down Payment Split</CardTitle>
        <CardDescription>
          How your initial contributions break down the upfront equity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium text-primary">Partner 1: {p1Percent.toFixed(0)}%</span>
            <span className="font-medium text-chart-2">Partner 2: {p2Percent.toFixed(0)}%</span>
          </div>
          
          <div className="flex h-4 w-full rounded-full overflow-hidden bg-muted">
            <div 
              className="bg-primary h-full transition-all duration-500 ease-in-out" 
              style={{ width: `${p1Percent}%` }}
              data-testid="contrib-p1-bar"
            />
            <div 
              className="bg-chart-2 h-full transition-all duration-500 ease-in-out" 
              style={{ width: `${p2Percent}%` }}
              data-testid="contrib-p2-bar"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="bg-primary/5 p-4 rounded-xl space-y-1 border border-primary/10">
            <p className="text-sm text-muted-foreground">Partner 1 Total</p>
            <p className="text-2xl font-serif font-medium text-primary" data-testid="contrib-p1-amount">
              {formatCurrency(p1Contrib)}
            </p>
            <p className="text-xs text-muted-foreground pt-1">Est. {p1Percent.toFixed(0)}% Initial Equity</p>
          </div>
          
          <div className="bg-chart-2/5 p-4 rounded-xl space-y-1 border border-chart-2/10">
            <p className="text-sm text-muted-foreground">Partner 2 Total</p>
            <p className="text-2xl font-serif font-medium text-chart-2" data-testid="contrib-p2-amount">
              {formatCurrency(p2Contrib)}
            </p>
            <p className="text-xs text-muted-foreground pt-1">Est. {p2Percent.toFixed(0)}% Initial Equity</p>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
