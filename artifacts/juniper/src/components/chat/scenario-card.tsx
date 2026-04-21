import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalculationResults } from "@/lib/calculator";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export function ScenarioCard({ results }: { results: CalculationResults }) {
  const formatCurrency = (num: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);

  const totalDebtNow = results.totalMonthlyDebt - results.monthlyHousingCost;
  const totalDebtFuture = results.bTotalMonthlyDebt - results.bMonthlyHousingCost;
  const debtDiff = totalDebtNow - totalDebtFuture;
  
  const housePriceDiff = results.bHousePrice - (results.bHousePrice / Math.pow(1.03, 2)); // Approximate based on 3% appreciation
  const monthlyCostDiff = results.bMonthlyHousingCost - results.monthlyHousingCost;

  return (
    <Card className="w-full shadow-sm" data-testid="scenario-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-serif">Wait 2 Years Scenario</CardTitle>
        <CardDescription>
          If you wait 2 years and aggressively pay down debt, here is how things might look.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* The Good */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center text-green-700 dark:text-green-400 gap-2">
              <TrendingDown className="w-4 h-4" />
              The Good: Lower Debt
            </h4>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Student Debt (P1)</span>
                <span className="font-medium" data-testid="scenario-p1-debt">{formatCurrency(results.bP1StudentDebt)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Student Debt (P2)</span>
                <span className="font-medium" data-testid="scenario-p2-debt">{formatCurrency(results.bP2StudentDebt)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center font-medium">
                <span>New DTI Ratio</span>
                <span className="text-primary text-base" data-testid="scenario-dti">{results.bDti.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* The Trade-off */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center text-orange-700 dark:text-orange-400 gap-2">
              <TrendingUp className="w-4 h-4" />
              The Trade-off: Higher Costs
            </h4>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Est. Home Price</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground line-through text-xs">Now</span>
                  <span className="font-medium" data-testid="scenario-house-price">{formatCurrency(results.bHousePrice)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Down Payment Growth</span>
                <span className="font-medium text-green-600">+{formatCurrency(results.bTotalSavings - (results.bTotalSavings / Math.pow(1.02, 2)))}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center font-medium">
                <span>New Monthly Housing</span>
                <span className="text-orange-600 text-base" data-testid="scenario-monthly-cost">{formatCurrency(results.bMonthlyHousingCost)}</span>
              </div>
            </div>
          </div>

        </div>

      </CardContent>
    </Card>
  );
}
