import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalculationResults } from "@/lib/calculator";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";

export function ResultsCard({ results }: { results: CalculationResults }) {
  const dtiLabel = {
    comfortable: "Comfortable",
    tight: "Tight",
    not_advisable: "Not Advisable",
  }[results.dtiCategory];

  const dtiColor = {
    comfortable: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 border-green-200",
    tight: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100 border-yellow-200",
    not_advisable: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100 border-red-200",
  }[results.dtiCategory];

  const dtiDesc = {
    comfortable: "Your debt-to-income ratio is in a healthy range.",
    tight: "Your budget will be tight. You may need to cut back on other expenses.",
    not_advisable: "This stretches your budget too far. Lenders may not approve this.",
  }[results.dtiCategory];

  const formatCurrency = (num: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);

  return (
    <Card className="w-full shadow-sm" data-testid="results-card">
      <CardHeader className="pb-3 border-b bg-muted/50">
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl font-serif">The Verdict</CardTitle>
          <Badge variant="outline" className={`${dtiColor} font-medium px-3 py-1 text-sm`}>
            {dtiLabel}
          </Badge>
        </div>
        <CardDescription className="text-base mt-2">
          {dtiDesc}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Est. Monthly Cost</p>
            <p className="text-3xl font-serif font-medium text-foreground" data-testid="result-monthly-cost">
              {formatCurrency(results.monthlyHousingCost)}
            </p>
            <p className="text-xs text-muted-foreground">Mortgage, Tax, Ins, HOA</p>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Monthly Buffer</p>
            <p className="text-3xl font-serif font-medium text-foreground" data-testid="result-buffer">
              {formatCurrency(results.monthlyBuffer)}
            </p>
            <p className="text-xs text-muted-foreground">Leftover after housing & debt</p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Debt-to-Income</p>
            <p className="text-3xl font-serif font-medium text-foreground" data-testid="result-dti">
              {results.dti.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">Target is under 36%</p>
          </div>
        </div>

        <Separator />

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="details" className="border-none">
            <AccordionTrigger className="text-sm hover:no-underline py-2 data-[state=open]:pb-4">
              <span className="font-medium text-primary">What's driving this result?</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pt-2 text-sm">
                <div className="grid grid-cols-2 gap-y-2">
                  <div className="text-muted-foreground">Monthly Income</div>
                  <div className="text-right font-medium">{formatCurrency(results.grossMonthlyIncome)}</div>
                  
                  <div className="text-muted-foreground">Total Debt Payments</div>
                  <div className="text-right font-medium">{formatCurrency(results.totalMonthlyDebt - results.monthlyHousingCost)}</div>
                  
                  <div className="col-span-2 pt-2 pb-1"><Separator /></div>
                  
                  <div className="text-muted-foreground font-medium">Monthly Housing</div>
                  <div className="text-right font-medium">{formatCurrency(results.monthlyHousingCost)}</div>
                  
                  <div className="text-muted-foreground pl-4">Mortgage P&I</div>
                  <div className="text-right">{formatCurrency(results.monthlyMortgage)}</div>
                  
                  <div className="text-muted-foreground pl-4">Property Tax</div>
                  <div className="text-right">{formatCurrency(results.monthlyPropertyTax)}</div>
                  
                  <div className="text-muted-foreground pl-4">Insurance</div>
                  <div className="text-right">{formatCurrency(results.monthlyInsurance)}</div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
