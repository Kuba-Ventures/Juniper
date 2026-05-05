import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowUp, Check } from "lucide-react";
import { CalculatorFormValues, calculatorSchema } from "@/lib/schema";
import { calculateResults, CalculationResults } from "@/lib/calculator";
import { Artifact } from "@/components/app-sidebar";
import { ResultsCard } from "./results-card";
import { ScenarioCard } from "./scenario-card";
import { ContributionCard } from "./contribution-card";

// ── Design tokens ──────────────────────────────────────────────────────────
const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

// ── Types ──────────────────────────────────────────────────────────────────
type MessageRole = "juniper" | "user";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content?: string;
  type?: "text" | "results" | "scenario" | "contribution";
  isError?: boolean;
  savedLabel?: string;
};

type Step =
  | "welcome" | "p1Income" | "p2Income" | "p1StudentDebt" | "p1StudentDebtPayment"
  | "p2StudentDebt" | "p2StudentDebtPayment" | "otherMonthlyDebt" | "housePrice"
  | "downPayment" | "interestRate" | "loanTermYears" | "annualPropertyTax"
  | "annualInsurance" | "monthlyHoa" | "calculating" | "showResults" | "askScenario"
  | "scenarioBExtraPaydown" | "showScenario" | "askContributions" | "p1Contribution"
  | "p2Contribution" | "showContributions" | "finished";

const questions: Record<Step, { text: string; placeholder?: string; isYesNo?: boolean }> = {
  welcome: { text: "" },
  p1Income: { text: "Hi there. I'm Juniper. Let's figure out if buying a home makes sense for you right now. First, tell me about your income. What's Partner 1's annual gross income?", placeholder: "$75,000" },
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

// ── Starter chips ──────────────────────────────────────────────────────────
const CHIPS = [
  {
    heading: "Help us understand our finances together",
    sub: "A guided conversation to map out where you both stand today.",
  },
  {
    heading: "We're thinking about buying a home",
    sub: "Model what's affordable based on your income, debt, and savings.",
  },
  {
    heading: "We want to tackle our debt",
    sub: "Build a payoff plan that works for both of you.",
  },
  {
    heading: "We're planning our next chapter",
    sub: "Think through marriage, a baby, or a big move with confidence.",
  },
];

// ── J logo mark ────────────────────────────────────────────────────────────
function JLogo({ size = 24 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: sage, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ fontFamily: serif, fontSize: size * 0.54, color: "#fff", fontStyle: "italic", lineHeight: 1 }}>J</span>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────
type Props = {
  userName: string;
  onConversationStart: (title: string) => void;
  onArtifactSaved: (artifact: Artifact) => void;
};

// ── ChatInterface ──────────────────────────────────────────────────────────
export function ChatInterface({ userName, onConversationStart, onArtifactSaved }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [inputValue, setInputValue] = useState("");
  const [answers, setAnswers] = useState<Partial<CalculatorFormValues>>({});
  const [isTyping, setIsTyping] = useState(false);
  const [results, setResults] = useState<CalculationResults | null>(null);
  const [conversationStarted, setConversationStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isTyping, scrollToBottom]);

  const addJuniperMessage = useCallback((
    content: string,
    type: ChatMessage["type"] = "text",
    isError = false,
    savedLabel?: string,
  ) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, role: "juniper", content, type, isError, savedLabel },
    ]);
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

  const handleStart = useCallback((firstMessage?: string) => {
    setMessages([]);
    setAnswers({});
    setResults(null);
    setCurrentStep("p1Income");
    if (!conversationStarted) {
      const title = firstMessage
        ? firstMessage.slice(0, 52) + (firstMessage.length > 52 ? "..." : "")
        : "Home buying conversation";
      onConversationStart(title);
      setConversationStarted(true);
    }
    advanceStep("p1Income");
  }, [advanceStep, conversationStarted, onConversationStart]);

  const handleCalculating = useCallback((latestAnswers: Partial<CalculatorFormValues>) => {
    setCurrentStep("calculating");
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      addJuniperMessage("Let me crunch the numbers...");
      setTimeout(() => {
        const formValues = calculatorSchema.parse({ ...calculatorSchema.parse({}), ...latestAnswers });
        const res = calculateResults(formValues);
        setResults(res);
        setCurrentStep("showResults");
        const artifactId = `results-${Date.now()}`;
        const monthlyLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(res.monthlyHousingCost);
        onArtifactSaved({
          id: artifactId,
          type: "calculation",
          title: "Home Affordability",
          subtitle: `${monthlyLabel}/mo`,
          savedAt: new Date(),
        });
        setMessages((prev) => [
          ...prev,
          { id: artifactId, role: "juniper", type: "results", savedLabel: "Saved to your plan." },
        ]);
        setTimeout(() => advanceStep("askScenario"), 1500);
      }, 1500);
    }, 600);
  }, [addJuniperMessage, advanceStep, onArtifactSaved]);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (
      currentStep === "askScenario" || currentStep === "welcome" ||
      currentStep === "showResults" || currentStep === "showScenario" ||
      currentStep === "showContributions" || currentStep === "finished"
    ) return;
    if (!inputValue.trim()) return;

    const val = inputValue.trim();
    setInputValue("");

    if (currentStep === "p1Income" && !conversationStarted) {
      onConversationStart(val.slice(0, 52) + (val.length > 52 ? "..." : ""));
      setConversationStarted(true);
    }

    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-user`, role: "user", content: val, type: "text" },
    ]);

    const numValue = parseNumber(val);
    if (numValue === null) {
      setTimeout(() => addJuniperMessage("I didn't catch that. Can you enter a number?", "text", true), 500);
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
        const formVals = calculatorSchema.parse({ ...calculatorSchema.parse({}), ...nextAnswers });
        const updatedRes = calculateResults(formVals);
        setResults(updatedRes);
        const scenarioId = `scenario-${Date.now()}`;
        onArtifactSaved({ id: scenarioId, type: "scenario", title: "Debt Paydown Scenario", savedAt: new Date() });
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            { id: scenarioId, role: "juniper", type: "scenario", savedLabel: "Saved to your plan." },
          ]);
          setTimeout(() => advanceStep("askContributions"), 2000);
        }, 1000);
        break;
      }
      case "p1Contribution": advanceStep("p2Contribution"); break;
      case "p2Contribution": {
        setCurrentStep("showContributions");
        setAnswers(nextAnswers);
        const contribId = `contrib-${Date.now()}`;
        onArtifactSaved({ id: contribId, type: "chart", title: "Down Payment Split", savedAt: new Date() });
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            { id: contribId, role: "juniper", type: "contribution", savedLabel: "Saved to your plan." },
          ]);
          setTimeout(() => advanceStep("finished"), 2000);
        }, 1000);
        break;
      }
    }
  }, [currentStep, inputValue, answers, conversationStarted, advanceStep, handleCalculating, addJuniperMessage, onConversationStart]);

  const handleScenarioChoice = (want: boolean) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-user`, role: "user", content: want ? "Yes" : "No", type: "text" },
    ]);
    advanceStep(want ? "scenarioBExtraPaydown" : "askContributions");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const showInput = !["welcome", "calculating", "showResults", "askScenario", "showScenario", "askContributions", "showContributions", "finished"].includes(currentStep);

  // ── STATE 1: Welcome ─────────────────────────────────────────────────────
  if (currentStep === "welcome") {
    return (
      <div style={{ height: "100%", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "48px 24px 32px", maxWidth: 760,
          margin: "0 auto", width: "100%",
        }}>
          {/* Logo + greeting */}
          <JLogo size={64} />
          <h1 style={{
            fontFamily: serif, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 400,
            color: ink, margin: "24px 0 14px", letterSpacing: "-0.02em", textAlign: "center",
          }}>
            Welcome, {userName}.
          </h1>
          <p style={{
            fontSize: 17, color: muted, lineHeight: 1.65, maxWidth: 480,
            textAlign: "center", margin: "0 0 44px",
          }}>
            I'm here to help you and your partner plan with clarity. Ask me anything, or pick a place to start.
          </p>

          {/* Starter chips */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12, width: "100%", marginBottom: 44,
          }}>
            {CHIPS.map((chip) => (
              <button
                key={chip.heading}
                onClick={() => handleStart(chip.heading)}
                style={{
                  background: cream, border: `1.5px solid rgba(92,122,101,0.3)`,
                  borderRadius: 12, padding: "22px 20px", textAlign: "left",
                  cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s",
                  fontFamily: sans,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = sage;
                  e.currentTarget.style.boxShadow = "0 2px 10px rgba(92,122,101,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(92,122,101,0.3)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <p style={{ fontFamily: serif, fontSize: 15, color: ink, margin: "0 0 6px", lineHeight: 1.3, fontWeight: 400 }}>
                  {chip.heading}
                </p>
                <p style={{ fontSize: 13, color: muted, margin: 0, lineHeight: 1.5 }}>
                  {chip.sub}
                </p>
              </button>
            ))}
          </div>

          {/* Chat input */}
          <div style={{ width: "100%", maxWidth: 680 }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (inputValue.trim()) {
                  setMessages([{ id: "user-0", role: "user", content: inputValue.trim(), type: "text" }]);
                  handleStart(inputValue.trim());
                  setInputValue("");
                }
              }}
            >
              <div style={{
                position: "relative", background: cream,
                border: `1.5px solid ${sage}`, borderRadius: 16, overflow: "hidden",
              }}>
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (inputValue.trim()) {
                        setMessages([{ id: "user-0", role: "user", content: inputValue.trim(), type: "text" }]);
                        handleStart(inputValue.trim());
                        setInputValue("");
                      }
                    }
                  }}
                  placeholder="Ask Juniper anything about your financial life..."
                  rows={3}
                  style={{
                    width: "100%", border: "none", background: "transparent",
                    padding: "16px 56px 16px 18px", fontFamily: sans, fontSize: 16,
                    color: ink, resize: "none", outline: "none", lineHeight: 1.55,
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  aria-label="Send message"
                  style={{
                    position: "absolute", right: 12, bottom: 12,
                    width: 36, height: 36, borderRadius: "50%",
                    background: inputValue.trim() ? sage : "rgba(92,122,101,0.25)",
                    border: "none", cursor: inputValue.trim() ? "pointer" : "default",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s",
                  }}
                >
                  <ArrowUp size={18} color="#fff" strokeWidth={2.5} />
                </button>
              </div>
            </form>
            <p style={{ fontSize: 12, color: muted, textAlign: "center", margin: "10px 0 0" }}>
              Juniper is a thinking partner, not a financial advisor.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── STATE 2: Active chat ─────────────────────────────────────────────────
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      {/* Messages */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", padding: "32px 24px 160px" }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              {msg.role === "juniper" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <JLogo size={24} />
                  <span style={{ fontSize: 12, color: muted, fontWeight: 500, letterSpacing: "0.01em" }}>Juniper</span>
                </div>
              )}

              {/* Message body */}
              {msg.type === "text" && (
                <div style={{
                  maxWidth: msg.role === "user" ? "80%" : "100%",
                  background: msg.role === "user" ? "rgba(92,122,101,0.13)" : "transparent",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : 0,
                  padding: msg.role === "user" ? "12px 16px" : 0,
                  color: msg.isError ? "#b94040" : ink,
                  fontSize: 16, lineHeight: 1.65, fontFamily: sans,
                }}>
                  {msg.content}
                </div>
              )}

              {msg.type === "results" && results && (
                <div style={{ width: "100%" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, margin: "0 0 8px" }}>
                    Calculation
                  </p>
                  <div style={{ background: cream, border: `1px solid ${border}`, borderRadius: 12, overflow: "hidden" }}>
                    <ResultsCard results={results} />
                  </div>
                </div>
              )}

              {msg.type === "scenario" && results && (
                <div style={{ width: "100%" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, margin: "0 0 8px" }}>
                    Scenario
                  </p>
                  <div style={{ background: cream, border: `1px solid ${border}`, borderRadius: 12, overflow: "hidden" }}>
                    <ScenarioCard results={results} />
                  </div>
                </div>
              )}

              {msg.type === "contribution" && (
                <div style={{ width: "100%" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, margin: "0 0 8px" }}>
                    Chart
                  </p>
                  <div style={{ background: cream, border: `1px solid ${border}`, borderRadius: 12, overflow: "hidden" }}>
                    <ContributionCard
                      housePrice={answers.housePrice || 0}
                      p1Contrib={answers.p1Contribution || 0}
                      p2Contrib={answers.p2Contribution || 0}
                    />
                  </div>
                </div>
              )}

              {/* Saved confirmation */}
              {msg.savedLabel && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
                  <Check size={12} color={sage} strokeWidth={2.5} />
                  <span style={{ fontSize: 12, color: muted }}>{msg.savedLabel}</span>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <JLogo size={24} />
                <span style={{ fontSize: 12, color: muted, fontWeight: 500 }}>Juniper</span>
              </div>
              <div style={{ display: "flex", gap: 5, padding: "4px 0" }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 7, height: 7, borderRadius: "50%", background: sage,
                      animation: "bounce 1.2s ease-in-out infinite",
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: `linear-gradient(to top, ${cream} 72%, transparent)`,
        padding: "32px 24px 24px",
      }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          {/* Yes/No buttons */}
          {currentStep === "askScenario" && !isTyping && (
            <div style={{ display: "flex", gap: 12, marginBottom: 0 }}>
              <button
                onClick={() => handleScenarioChoice(false)}
                style={{
                  flex: 1, height: 46, background: "#fff", border: `1.5px solid ${border}`,
                  borderRadius: 10, fontFamily: sans, fontSize: 14, color: ink,
                  cursor: "pointer", fontWeight: 500, transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = sage)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = border)}
              >
                No, skip this
              </button>
              <button
                onClick={() => handleScenarioChoice(true)}
                style={{
                  flex: 1, height: 46, background: sage, border: "none",
                  borderRadius: 10, fontFamily: sans, fontSize: 14, color: "#fff",
                  cursor: "pointer", fontWeight: 500, transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Yes, show me
              </button>
            </div>
          )}

          {/* Text input */}
          {showInput && !isTyping && (
            <div style={{
              position: "relative", background: cream,
              border: `1.5px solid ${sage}`, borderRadius: 14,
            }}>
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={questions[currentStep]?.placeholder || "Type your answer..."}
                rows={1}
                autoFocus
                style={{
                  width: "100%", border: "none", background: "transparent",
                  padding: "14px 52px 14px 18px", fontFamily: sans, fontSize: 16,
                  color: ink, resize: "none", outline: "none", lineHeight: 1.5,
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={() => handleSubmit()}
                disabled={!inputValue.trim()}
                aria-label="Send"
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  width: 34, height: 34, borderRadius: "50%",
                  background: inputValue.trim() ? sage : "rgba(92,122,101,0.25)",
                  border: "none", cursor: inputValue.trim() ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.15s",
                }}
              >
                <ArrowUp size={16} color="#fff" strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
