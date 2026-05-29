import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { getAccessToken } from "@/lib/supabase";
import {
  getClientScript,
  visibleProgress,
  nextVisibleStepIndex,
  type ClientDialogueContext,
} from "@/lib/dialogue-scripts";
import {
  savePlan,
  type DialogueTurn,
  type Plan,
  type PlanGoal,
  type PlanKpi,
  type PlanMilestone,
  type PlanNextAction,
} from "@/lib/plans";
import { UserProfile } from "@/lib/profile";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

type ApiMessage = { role: "user" | "assistant"; content: string };

const STEP_TAG_RE = /<STEP_COMPLETE>([\s\S]*?)<\/STEP_COMPLETE>/;
const PLAN_TAG_RE = /<PLAN_COMPLETE>([\s\S]*?)<\/PLAN_COMPLETE>/;

function stripTags(text: string): string {
  return text.replace(STEP_TAG_RE, "").replace(PLAN_TAG_RE, "").trim();
}

function tryParseStepData(text: string): Record<string, unknown> | null {
  const match = text.match(STEP_TAG_RE);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function tryParsePlanData(text: string): Record<string, unknown> | null {
  const match = text.match(PLAN_TAG_RE);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

type Props = {
  domain: string;
  profile: UserProfile | null;
  initialPlan: Plan | null;
  onPlanCompleted: (plan: Plan) => void;
};

export function DialogueInterface({ domain, profile, initialPlan, onPlanCompleted }: Props) {
  const script = getClientScript(domain);

  // ── State (for rendering) ─────────────────────────────────────────────
  const [messages, setMessages] = useState<ApiMessage[]>(() => {
    if (initialPlan?.dialogue_history?.length) {
      return initialPlan.dialogue_history.map((t) => ({ role: t.role, content: t.content }));
    }
    return [];
  });
  const [stepIndex, setStepIndex] = useState<number>(initialPlan?.current_step_index ?? 0);
  const [hasPartner, setHasPartner] = useState<boolean | null>(initialPlan?.has_partner ?? null);
  const [partnerName, setPartnerName] = useState<string | null>(initialPlan?.partner_first_name ?? null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [errored, setErrored] = useState(false);
  const [completedPlan, setCompletedPlan] = useState<Plan | null>(
    initialPlan?.status === "completed" ? initialPlan : null,
  );
  const [autoStartPending, setAutoStartPending] = useState(false);

  // ── Refs (for closure-stable reads inside async sendTurn) ─────────────
  const messagesRef = useRef<ApiMessage[]>(messages);
  messagesRef.current = messages;

  const stepIndexRef = useRef<number>(stepIndex);
  stepIndexRef.current = stepIndex;

  const hasPartnerRef = useRef<boolean | null>(hasPartner);
  hasPartnerRef.current = hasPartner;

  const partnerNameRef = useRef<string | null>(partnerName);
  partnerNameRef.current = partnerName;

  const collectedRef = useRef<Record<string, unknown>>(
    (() => {
      if (!initialPlan?.dialogue_history) return {};
      const acc: Record<string, unknown> = {};
      for (const turn of initialPlan.dialogue_history) {
        if (turn.step_complete_data) Object.assign(acc, turn.step_complete_data);
      }
      return acc;
    })(),
  );

  const historyRef = useRef<DialogueTurn[]>(
    (initialPlan?.dialogue_history ?? []) as DialogueTurn[],
  );

  const streamingRef = useRef<boolean>(false);
  const completedRef = useRef<boolean>(initialPlan?.status === "completed");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // ── Initial cold start ─────────────────────────────────────────────────
  useEffect(() => {
    if (!script || completedRef.current) return;
    if (messagesRef.current.length === 0 && !streamingRef.current) {
      setAutoStartPending(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-advance driver ────────────────────────────────────────────────
  useEffect(() => {
    if (!autoStartPending) return;
    if (streaming || completedPlan) return;
    setAutoStartPending(false);
    void sendTurn("", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartPending, streaming, completedPlan]);

  const ctx: ClientDialogueContext = useMemo(
    () => ({ has_partner: hasPartner }),
    [hasPartner],
  );

  const progress = script ? visibleProgress(script, stepIndex, ctx) : { position: 0, total: 0 };
  const currentStepName = script?.steps[stepIndex]?.name ?? "";

  async function sendTurn(rawText: string, asAutoStart = false) {
    if (!script) return;
    if (streamingRef.current || completedRef.current) return;
    streamingRef.current = true;
    setStreaming(true);
    setErrored(false);

    const currentMessages = messagesRef.current;
    const currentStep = stepIndexRef.current;
    const currentHasPartner = hasPartnerRef.current;
    const currentPartnerName = partnerNameRef.current;
    const currentCollected = collectedRef.current;

    // Build the LLM payload.
    let newApi: ApiMessage[];
    if (asAutoStart) {
      newApi =
        currentMessages.length === 0
          ? [{ role: "user", content: "Hi, I'm ready to start." }]
          : [...currentMessages, { role: "user", content: "Continue." }];
    } else {
      newApi = [...currentMessages, { role: "user", content: rawText }];
    }

    // Build display messages. Never wipe prior turns.
    const assistantStart: ApiMessage = { role: "assistant", content: "" };
    if (asAutoStart) {
      setMessages((prev) => [...prev, assistantStart]);
    } else {
      setMessages((prev) => [...prev, { role: "user", content: rawText }, assistantStart]);
      setInput("");
    }

    let fullText = "";
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/dialogue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          domain,
          step_index: currentStep,
          messages: newApi,
          context: {
            has_partner: currentHasPartner,
            partner_first_name: currentPartnerName,
            collected: currentCollected,
            profile: profile
              ? {
                  monthly_income: profile.monthlyIncome ?? null,
                  monthly_expenses: profile.monthlyExpenses ?? null,
                  total_savings: profile.totalSavings ?? null,
                  total_debt: profile.totalDebt ?? null,
                }
              : undefined,
          },
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as { text?: string; error?: string };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              fullText += parsed.text;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: stripTags(fullText) };
                return next;
              });
            }
          } catch {
            /* skip malformed SSE line */
          }
        }
      }
    } catch {
      setErrored(true);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: "Sorry, something went wrong. Please check your connection and try again.",
        };
        return next;
      });
      streamingRef.current = false;
      setStreaming(false);
      return;
    }

    const strippedAssistant = stripTags(fullText);
    const stepData = tryParseStepData(fullText);
    const planData = tryParsePlanData(fullText);

    // Append to history (for persistence).
    if (!asAutoStart) {
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: rawText, step_index: currentStep },
      ];
    }
    historyRef.current = [
      ...historyRef.current,
      {
        role: "assistant",
        content: strippedAssistant,
        step_index: currentStep,
        step_complete_data: stepData ?? undefined,
      },
    ];

    streamingRef.current = false;
    setStreaming(false);

    if (planData) {
      completedRef.current = true;
      const goal = planData.goal as PlanGoal | undefined;
      const kpis = (planData.kpis ?? []) as PlanKpi[];
      const milestones = (planData.milestones ?? []) as PlanMilestone[];
      const nextActions = (planData.next_actions ?? []) as PlanNextAction[];
      const currentState = (planData.current_state ?? null) as Record<string, unknown> | null;

      const saved = await savePlan({
        domain,
        status: "completed",
        has_partner: currentHasPartner,
        partner_first_name: currentPartnerName,
        goal: goal ?? null,
        current_state: currentState,
        kpis,
        milestones,
        next_actions: nextActions,
        dialogue_history: historyRef.current as unknown as Plan["dialogue_history"],
        current_step_index: currentStep,
      });

      if (saved) {
        setCompletedPlan(saved);
        onPlanCompleted(saved);
      }
      return;
    }

    if (stepData) {
      // Merge extracted fields into collected; pull partner info if present.
      const nextCollected = { ...currentCollected, ...stepData };
      collectedRef.current = nextCollected;

      let nextHasPartner = currentHasPartner;
      let nextPartnerName = currentPartnerName;
      if (typeof stepData.has_partner === "boolean") {
        nextHasPartner = stepData.has_partner;
        hasPartnerRef.current = nextHasPartner;
        setHasPartner(nextHasPartner);
      }
      if (typeof stepData.partner_first_name === "string") {
        nextPartnerName = stepData.partner_first_name;
        partnerNameRef.current = nextPartnerName;
        setPartnerName(nextPartnerName);
      }

      const next = nextVisibleStepIndex(script, currentStep, { has_partner: nextHasPartner });
      const newStepIndex = next ?? currentStep;
      stepIndexRef.current = newStepIndex;
      setStepIndex(newStepIndex);

      await savePlan({
        domain,
        status: "in_progress",
        has_partner: nextHasPartner,
        partner_first_name: nextPartnerName,
        dialogue_history: historyRef.current as unknown as Plan["dialogue_history"],
        current_step_index: newStepIndex,
        current_state: { collected: nextCollected },
      });

      if (next !== null) {
        // Trigger the next-step auto-call via state, so the useEffect handles it
        // with up-to-date closure.
        setAutoStartPending(true);
      }
    } else {
      await savePlan({
        domain,
        status: "in_progress",
        has_partner: currentHasPartner,
        partner_first_name: currentPartnerName,
        dialogue_history: historyRef.current as unknown as Plan["dialogue_history"],
        current_step_index: currentStep,
      });
    }
  }

  if (!script) {
    return (
      <div style={{ padding: 40, fontFamily: sans, color: muted }}>
        Unknown dialogue domain: {domain}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: cream, fontFamily: sans }}>
      <div
        style={{
          padding: "18px 28px 14px",
          borderBottom: `1px solid ${border}`,
          background: cream,
          flexShrink: 0,
        }}
      >
        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: sage, margin: "0 0 6px" }}>
          {script.title} · Step {progress.position} of {progress.total}
        </p>
        <p style={{ fontFamily: serif, fontSize: 19, color: ink, margin: 0, fontWeight: 400 }}>
          {currentStepName}
        </p>
        <div
          style={{
            marginTop: 12,
            height: 3,
            borderRadius: 2,
            background: "rgba(92,122,101,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress.total > 0 ? (progress.position / progress.total) * 100 : 0}%`,
              background: sage,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
          {messages.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} />
          ))}
          {streaming &&
            messages[messages.length - 1]?.role === "assistant" &&
            messages[messages.length - 1]?.content === "" && (
              <MessageBubble role="assistant" content="…" />
            )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {!completedPlan && (
        <div style={{ borderTop: `1px solid ${border}`, background: cream, flexShrink: 0, padding: "16px 28px 22px" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim() && !streaming) void sendTurn(input.trim());
            }}
            style={{
              maxWidth: 720,
              margin: "0 auto",
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              background: "#fff",
              border: `1px solid ${border}`,
              borderRadius: 14,
              padding: "10px 12px",
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !streaming) void sendTurn(input.trim());
                }
              }}
              placeholder={streaming ? "Juniper is thinking…" : "Reply to Juniper…"}
              disabled={streaming}
              rows={1}
              style={{
                flex: 1,
                resize: "none",
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: sans,
                fontSize: 15,
                color: ink,
                padding: "8px 6px",
                lineHeight: 1.5,
                minHeight: 24,
                maxHeight: 200,
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              aria-label="Send"
              style={{
                background: sage,
                color: "#fff",
                border: "none",
                borderRadius: 999,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: input.trim() && !streaming ? "pointer" : "default",
                opacity: input.trim() && !streaming ? 1 : 0.4,
                transition: "opacity 0.15s",
                flexShrink: 0,
              }}
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          </form>
          {errored && (
            <p style={{ textAlign: "center", color: "#b94040", fontSize: 12, marginTop: 8 }}>
              Connection error. Try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  if (role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            background: "rgba(92,122,101,0.10)",
            border: `1px solid ${border}`,
            borderRadius: 14,
            padding: "10px 14px",
            maxWidth: "75%",
            fontSize: 15,
            color: ink,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}
        >
          {content}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: "rgba(92,122,101,0.10)",
          color: sage,
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: serif,
          fontStyle: "italic",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        J
      </div>
      <div
        style={{
          fontSize: 15,
          color: ink,
          lineHeight: 1.65,
          whiteSpace: "pre-wrap",
          paddingTop: 2,
          flex: 1,
        }}
      >
        {content}
      </div>
    </div>
  );
}
