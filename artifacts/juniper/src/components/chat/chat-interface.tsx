import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SendHorizontal, RotateCcw, AlertCircle, ArrowUp } from "lucide-react";
import { CalculatorFormValues, calculatorSchema } from "@/lib/schema";
import { calculateResults, CalculationResults } from "@/lib/calculator";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Import result card components
import { ResultsCard } from "./results-card";
import { ScenarioCard } from "./scenario-card";
import { ContributionCard } from "./contribution-card";

type MessageRole = "juniper" | "user" | "system";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content?: string;
  type?: "text" | "typing" | "results" | "scenario" | "contribution";
  isError?: boolean;
};

type Step = 
  | "welcome"
  | "p1Income"
  | "p2Income"
  | "p1StudentDebt"
  | "p1StudentDebtPayment"
  | "p2StudentDebt"
  | "p2StudentDebtPayment"
  | "otherMonthlyDebt"
  | "housePrice"
  | "downPayment"
  | "interestRate"
  | "loanTermYears"
  | "annualPropertyTax"
  | "annualInsurance"
  | "monthlyHoa"
  | "calculating"
  | "showResults"
  | "askScenario"
  | "scenarioBExtraPaydown"
  | "showScenario"
  | "askContributions"
  | "p1Contribution"
  | "p2Contribution"
  | "showContributions"
  | "finished";

const questions: Record<Step, { text: string; placeholder?: string; isYesNo?: boolean }> = {
  welcome: { text: "" },
  p1Income: { text: "Hi there! I'm Juniper. Let's figure out if buying a home makes sense for you right now. First, tell me about your income. What's Partner 1's annual gross income?", placeholder: "$75,000" },
  p2Income: { text: "And Partner 2's annual gross income?", placeholder: "$65,000" },
  p1StudentDebt: { text: "Now let's talk about student debt. What's Partner 1's total student loan balance?", placeholder: "$35,000" },
  p1StudentDebtPayment: { text: "What's Partner 1's monthly student loan payment?", placeholder: "$350" },
  p2StudentDebt: { text: "What about Partner 2: total student loan balance?", placeholder: "$28,000" },
  p2StudentDebtPayment: { text: "And Partner 2's monthly payment?", placeholder: "$280" },
  otherMonthlyDebt: { text: "Any other monthly debt payments? (car loans, credit cards, personal loans)", placeholder: "$0" },
  housePrice: { text: "Great. Now the fun part: the house. What's the target home price you're looking at?", placeholder: "$425,000" },
  downPayment: { text: "How much do you have for a down payment?", placeholder: "$60,000" },
  interestRate: { text: "What interest rate are you expecting? (current average is around 6.5%)", placeholder: "6.5" },
  loanTermYears: { text: "How many years for the loan term?", placeholder: "30" },
  annualPropertyTax: { text: "Estimated annual property tax?", placeholder: "$5,100" },
  annualInsurance: { text: "Estimated annual homeowners insurance?", placeholder: "$1,200" },
  monthlyHoa: { text: "Any monthly HOA fees?", placeholder: "$0" },
  calculating: { text: "Let me crunch the numbers..." },
  showResults: { text: "" },
  askScenario: { text: "Want to see what happens if you wait 2 years to pay down debt?", isYesNo: true },
  scenarioBExtraPaydown: { text: "How much extra could you put toward debt each month beyond minimums?", placeholder: "$500" },
  showScenario: { text: "" },
  askContributions: { text: "One more thing: let's look at how the down payment splits between you two." },
  p1Contribution: { text: "How much is Partner 1 contributing to the down payment?", placeholder: "$30,000" },
  p2Contribution: { text: "And Partner 2?", placeholder: "$30,000" },
  showContributions: { text: "" },
  finished: { text: "That's the full picture. You can scroll up to review everything, or start fresh if you want to try different numbers." },
};

function parseNumber(input: string): number | null {
  const cleaned = input.replace(/[^\d.-]/g, "");
  if (cleaned === "") return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [inputValue, setInputValue] = useState("");
  const [answers, setAnswers] = useState<Partial<CalculatorFormValues>>({});
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<CalculationResults | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const addJuniperMessage = useCallback((content: string, type: ChatMessage["type"] = "text", isError = false) => {
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "juniper", content, type, isError }]);
  }, []);

  const advanceStep = useCallback((nextStep: Step) => {
    setCurrentStep(nextStep);
    
    if (nextStep === "finished") {
      addJuniperMessage(questions[nextStep].text);
      return;
    }
    
    if (questions[nextStep].text && nextStep !== "calculating") {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        addJuniperMessage(questions[nextStep].text);
        
        if (nextStep === "askContributions") {
          setTimeout(() => advanceStep("p1Contribution"), 1500);
        }
      }, 800);
    }
  }, [addJuniperMessage]);

  const handleStart = useCallback(() => {
    setMessages([]);
    setAnswers({});
    setResults(null);
    setCurrentStep("p1Income");
    advanceStep("p1Income");
  }, [advanceStep]);

  useEffect(() => {
    if (currentStep === "welcome") {
      // Intentionally empty waiting for user to start
    }
  }, [currentStep]);

  const handleCalculating = useCallback((latestAnswers: Partial<CalculatorFormValues>) => {
    setCurrentStep("calculating");
    setIsTyping(true);
    
    setTimeout(() => {
      setIsTyping(false);
      addJuniperMessage("Let me crunch the numbers...");
      
      setTimeout(() => {
        const formValues = calculatorSchema.parse({
          ...calculatorSchema.parse({}),
          ...latestAnswers
        });
        
        const res = calculateResults(formValues);
        setResults(res);
        
        setCurrentStep("showResults");
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: "juniper", type: "results" }]);
        
        setTimeout(() => {
          advanceStep("askScenario");
        }, 1500);
        
      }, 1500);
    }, 600);
  }, [addJuniperMessage, advanceStep]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (currentStep === "askScenario") return; // Handled by buttons
    if (currentStep === "welcome" || currentStep === "showResults" || currentStep === "showScenario" || currentStep === "showContributions" || currentStep === "finished") return;

    if (!inputValue.trim()) return;

    const val = inputValue.trim();
    setInputValue("");
    
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", content: val }]);

    const numValue = parseNumber(val);
    
    if (numValue === null) {
      setTimeout(() => {
        addJuniperMessage("Hmm, I didn't catch that. Can you enter a number?", "text", true);
      }, 500);
      return;
    }

    const nextAnswers = { ...answers, [currentStep]: numValue };
    setAnswers(nextAnswers);

    switch (currentStep) {
      case "p1Income": advanceStep("p2Income"); break;
      case "p2Income": advanceStep("p1StudentDebt"); break;
      case "p1StudentDebt": advanceStep("p1StudentDebtPayment"); break;
      case "p1StudentDebtPayment": advanceStep("p2StudentDebt"); break;
      case "p2StudentDebt": advanceStep("p2StudentDebtPayment"); break;
      case "p2StudentDebtPayment": advanceStep("otherMonthlyDebt"); break;
      case "otherMonthlyDebt": advanceStep("housePrice"); break;
      case "housePrice": advanceStep("downPayment"); break;
      case "downPayment": advanceStep("interestRate"); break;
      case "interestRate": advanceStep("loanTermYears"); break;
      case "loanTermYears": advanceStep("annualPropertyTax"); break;
      case "annualPropertyTax": advanceStep("annualInsurance"); break;
      case "annualInsurance": advanceStep("monthlyHoa"); break;
      case "monthlyHoa": handleCalculating(nextAnswers); break;
      case "scenarioBExtraPaydown": {
        setCurrentStep("showScenario");
        const updatedFormVals = calculatorSchema.parse({
          ...calculatorSchema.parse({}),
          ...nextAnswers
        });
        const updatedRes = calculateResults(updatedFormVals);
        setResults(updatedRes);
        setTimeout(() => {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "juniper", type: "scenario" }]);
           setTimeout(() => advanceStep("askContributions"), 2000);
        }, 1000);
        break;
      }
      case "p1Contribution": advanceStep("p2Contribution"); break;
      case "p2Contribution": {
        setCurrentStep("showContributions");
        setAnswers(nextAnswers);
        setTimeout(() => {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "juniper", type: "contribution" }]);
           setTimeout(() => advanceStep("finished"), 2000);
        }, 1000);
        break;
      }
    }
  };

  const handleScenarioChoice = (wantScenario: boolean) => {
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", content: wantScenario ? "Yes" : "No" }]);
    if (wantScenario) {
      advanceStep("scenarioBExtraPaydown");
    } else {
      advanceStep("askContributions");
    }
  };

  const showInput = currentStep !== "welcome" && 
                    currentStep !== "calculating" && 
                    currentStep !== "showResults" && 
                    currentStep !== "askScenario" && 
                    currentStep !== "showScenario" && 
                    currentStep !== "askContributions" && 
                    currentStep !== "showContributions" && 
                    currentStep !== "finished";

  if (currentStep === "welcome") {
    return (
      <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-center animate-in fade-in duration-700">
        <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mb-8 shadow-sm">
          <span className="text-primary-foreground font-serif font-bold text-3xl italic">J</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight text-foreground leading-[1.1] mb-6">
          Helping you reach life's milestones, at your own pace
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mb-10">
          An intelligent chatbot that walks you through the financial decisions of early marriage, from student debt to home buying, one question at a time.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); handleStart(); }}
          className="w-full max-w-xl"
        >
          <div className="relative">
            <textarea
              placeholder="We have $63k in student debt and want to afford a $425k house. Between the two of us, we make about $140k a year. How much do we need to save for a down payment, and can we handle the monthly mortgage?"
              className="w-full rounded-2xl border border-border bg-background px-6 py-4 pr-14 text-base text-foreground placeholder:text-muted-foreground/60 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
              rows={4}
              onFocus={handleStart}
              data-testid="button-start-chat"
              readOnly
            />
            <button
              type="submit"
              className="absolute right-3 bottom-3 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity"
              aria-label="Start conversation"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto flex flex-col h-full relative" data-testid="chat-interface">
      <div className="flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground font-serif font-bold italic">J</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-serif font-medium leading-none">Juniper</h2>
            <p className="text-xs text-muted-foreground mt-1">Financial Advisor</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleStart} className="text-muted-foreground" data-testid="button-start-over">
          <RotateCcw className="h-4 w-4 mr-2" />
          Start over
        </Button>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 pb-32 scroll-smooth"
      >
        {messages.map((msg, index) => (
          <div 
            key={msg.id} 
            className={cn(
              "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {msg.role === "juniper" && (
              <Avatar className="h-8 w-8 mr-3 mt-1 shrink-0">
                <AvatarFallback className="bg-primary text-primary-foreground font-serif font-bold italic text-xs">J</AvatarFallback>
              </Avatar>
            )}
            
            <div className={cn(
              "max-w-[85%] rounded-2xl px-5 py-3",
              msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm",
              msg.isError && "bg-destructive/10 text-destructive border border-destructive/20"
            )}>
              {msg.type === "text" && (
                <div className="whitespace-pre-wrap flex items-start gap-2">
                  {msg.isError && <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
                  <span>{msg.content}</span>
                </div>
              )}
              {msg.type === "results" && results && (
                <div className="-mx-2 sm:-mx-4 -my-1">
                  <ResultsCard results={results} />
                </div>
              )}
              {msg.type === "scenario" && results && (
                <div className="-mx-2 sm:-mx-4 -my-1">
                  <ScenarioCard results={results} />
                </div>
              )}
              {msg.type === "contribution" && (
                <div className="-mx-2 sm:-mx-4 -my-1">
                  <ContributionCard 
                    housePrice={answers.housePrice || 0}
                    p1Contrib={answers.p1Contribution || 0}
                    p2Contrib={answers.p2Contribution || 0}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex w-full justify-start animate-in fade-in">
            <Avatar className="h-8 w-8 mr-3 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground font-serif font-bold italic text-xs">J</AvatarFallback>
            </Avatar>
            <div className="bg-muted text-foreground rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce" />
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent pt-10">
        {currentStep === "askScenario" && !isTyping && (
          <div className="flex gap-3 justify-center max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4">
            <Button 
              size="lg" 
              variant="outline" 
              className="flex-1 bg-background"
              onClick={() => handleScenarioChoice(false)}
              data-testid="button-scenario-no"
            >
              No, skip this
            </Button>
            <Button 
              size="lg" 
              className="flex-1"
              onClick={() => handleScenarioChoice(true)}
              data-testid="button-scenario-yes"
            >
              Yes, show me
            </Button>
          </div>
        )}

        {showInput && !isTyping && (
          <form 
            onSubmit={handleSubmit}
            className="flex gap-2 max-w-2xl mx-auto items-end animate-in fade-in slide-in-from-bottom-2"
          >
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={questions[currentStep]?.placeholder || "Type a number..."}
                className="h-14 rounded-full pl-6 pr-12 text-base shadow-sm bg-background"
                autoFocus
                type="text"
                inputMode="decimal"
                data-testid={`input-${currentStep}`}
              />
            </div>
            <Button 
              type="submit" 
              size="icon" 
              className="h-14 w-14 rounded-full shrink-0 shadow-sm"
              disabled={!inputValue.trim()}
              data-testid="button-send"
            >
              <SendHorizontal className="h-5 w-5" />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
