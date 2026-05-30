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

// Display layer: hide tags during streaming so the user never sees raw JSON
// or partial tag markers. Three cases:
//   (a) Fully formed tag pair: strip it entirely.
//   (b) Open tag present, close tag not yet streamed: hide from open tag on.
//   (c) Partial tag prefix at end (e.g. "<PL"): hide from "<" on.
function displayContent(fullText: string): string {
  let s = fullText.replace(STEP_TAG_RE, "").replace(PLAN_TAG_RE, "");
  for (const openTag of ["<STEP_COMPLETE>", "<PLAN_COMPLETE>"]) {
    const idx = s.indexOf(openTag);
    if (idx >= 0) s = s.slice(0, idx).trimEnd();
  }
  const lastOpen = s.lastIndexOf("<");
  if (lastOpen >= 0 && !s.slice(lastOpen).includes(">")) {
    s = s.slice(0, lastOpen).trimEnd();
  }
  // Backstop: Claude keeps emitting em-dashes / en-dashes / "--" despite the
  // BASE rule against them. Strip them client-side so users never see them.
  s = s.replace(/\s+[—–]\s+/g, ", ");
  s = s.replace(/[—–]/g, ", ");
  s = s.replace(/\s+--\s+/g, ", ");
  return s;
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

// Tolerant plan parser: prefers the wrapped tag, but falls back to a
// brace-balanced extraction starting at "<PLAN_COMPLETE>" if the close
// tag was truncated (e.g. max_tokens hit before "</PLAN_COMPLETE>").
function tryParsePlanData(text: string): Record<string, unknown> | null {
  const wrapped = text.match(PLAN_TAG_RE);
  if (wrapped) {
    try {
      return JSON.parse(wrapped[1]);
    } catch {
      /* fall through */
    }
  }
  const openIdx = text.indexOf("<PLAN_COMPLETE>");
  if (openIdx < 0) return null;
  const bodyStart = openIdx + "<PLAN_COMPLETE>".length;
  const after = text.slice(bodyStart);
  // Find the first "{" and balance braces to find the matching closer.
  const start = after.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < after.length; i++) {
    const c = after[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === "\"") { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = after.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

type Props = {
  domain: string;
  profile: UserProfile | null;
  initialPlan: Plan | null;
  onPlanCompleted: (plan: Plan) => void;
  role?: "inviter" | "partner";
  // For partner role, the name to address the partner's "partner" (i.e. the inviter) by.
  inviterFirstName?: string | null;
};

// Partner dialogue ends before the synthesis step. The last comparable step
// for partnered scenarios is "legal_tax" (index 7 in the 0-indexed script).
// Synthesis (index 8) is inviter-only.
const PARTNER_SKIP_FIRST_STEP_INDEX = 1; // skip step 0 (partner check)
const PARTNER_LAST_STEP_INDEX = 7; // legal_tax — partner stops here

export function DialogueInterface({
  domain,
  profile,
  initialPlan,
  onPlanCompleted,
  role = "inviter",
  inviterFirstName = null,
}: Props) {
  const script = getClientScript(domain);
  const isPartner = role === "partner";

  // ── State (for rendering) ─────────────────────────────────────────────
  const [messages, setMessages] = useState<ApiMessage[]>(() => {
    const history = isPartner ? initialPlan?.partner_dialogue_history : initialPlan?.dialogue_history;
    if (history?.length) {
      return history.map((t) => ({ role: t.role, content: t.content }));
    }
    return [];
  });
  const [stepIndex, setStepIndex] = useState<number>(() => {
    if (isPartner) {
      return initialPlan?.partner_current_step_index ?? PARTNER_SKIP_FIRST_STEP_INDEX;
    }
    return initialPlan?.current_step_index ?? 0;
  });
  const [hasPartner, setHasPartner] = useState<boolean | null>(() => {
    if (isPartner) return true;
    return initialPlan?.has_partner ?? null;
  });
  const [partnerName, setPartnerName] = useState<string | null>(() => {
    if (isPartner) return inviterFirstName ?? null;
    return initialPlan?.partner_first_name ?? null;
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [errored, setErrored] = useState(false);
  const [completedPlan, setCompletedPlan] = useState<Plan | null>(() => {
    if (isPartner) {
      return initialPlan?.partner_dialogue_status === "completed" ? initialPlan : null;
    }
    return initialPlan?.status === "completed" ? initialPlan : null;
  });
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
      const init: Record<string, unknown> = {};
      if (isPartner) {
        init.has_partner = true;
        if (inviterFirstName) init.partner_first_name = inviterFirstName;
        Object.assign(init, (initialPlan?.partner_collected ?? {}) as Record<string, unknown>);
        return init;
      }
      if (!initialPlan?.dialogue_history) return init;
      for (const turn of initialPlan.dialogue_history) {
        if (turn.step_complete_data) Object.assign(init, turn.step_complete_data);
      }
      return init;
    })(),
  );

  const historyRef = useRef<DialogueTurn[]>(
    ((isPartner
      ? initialPlan?.partner_dialogue_history
      : initialPlan?.dialogue_history) ?? []) as DialogueTurn[],
  );

  const streamingRef = useRef<boolean>(false);
  const completedRef = useRef<boolean>(
    isPartner
      ? initialPlan?.partner_dialogue_status === "completed"
      : initialPlan?.status === "completed",
  );

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
                next[next.length - 1] = { role: "assistant", content: displayContent(fullText) };
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

    if (planData && !isPartner) {
      completedRef.current = true;
      const goal = planData.goal as PlanGoal | undefined;
      const kpis = (planData.kpis ?? []) as PlanKpi[];
      const milestones = (planData.milestones ?? []) as PlanMilestone[];
      const nextActions = (planData.next_actions ?? []) as PlanNextAction[];
      const currentState = (planData.current_state ?? null) as Record<string, unknown> | null;

      // Build a local completed plan from the parsed data so the UI can
      // transition immediately, without waiting for the server save.
      const nowIso = new Date().toISOString();
      const localCompleted: Plan = {
        id: initialPlan?.id ?? "",
        user_id: initialPlan?.user_id ?? "",
        domain,
        status: "completed",
        has_partner: currentHasPartner,
        partner_first_name: currentPartnerName,
        goal: goal ?? null,
        current_state: currentState,
        kpis,
        milestones,
        next_actions: nextActions,
        dialogue_history: historyRef.current,
        plan_chat_history: initialPlan?.plan_chat_history ?? [],
        current_step_index: currentStep,
        partner_invite_status: initialPlan?.partner_invite_status ?? "none",
        partner_user_id: initialPlan?.partner_user_id ?? null,
        partner_collected: initialPlan?.partner_collected ?? {},
        partner_dialogue_history: initialPlan?.partner_dialogue_history ?? [],
        partner_current_step_index: initialPlan?.partner_current_step_index ?? 0,
        partner_dialogue_status: initialPlan?.partner_dialogue_status ?? "not_started",
        invite_token: initialPlan?.invite_token ?? null,
        created_at: initialPlan?.created_at ?? nowIso,
        updated_at: nowIso,
      };

      setCompletedPlan(localCompleted);
      onPlanCompleted(localCompleted);

      // Persist in the background. If the save fails the UI still shows the
      // plan; the next refresh will surface the discrepancy and the user can
      // hit "Redo this plan".
      void savePlan({
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

      let next = nextVisibleStepIndex(script, currentStep, { has_partner: nextHasPartner });

      // Partner role exits before the synthesis step (which is inviter-only).
      const partnerHasFinished =
        isPartner && next !== null && next > PARTNER_LAST_STEP_INDEX;
      if (partnerHasFinished) {
        next = null;
        completedRef.current = true;
      }

      const newStepIndex = next ?? currentStep;
      stepIndexRef.current = newStepIndex;
      setStepIndex(newStepIndex);

      if (isPartner) {
        await savePlan({
          domain,
          partner_collected: nextCollected,
          partner_dialogue_history: historyRef.current as unknown as Plan["partner_dialogue_history"],
          partner_current_step_index: newStepIndex,
          partner_dialogue_status: partnerHasFinished ? "completed" : "in_progress",
        });

        if (partnerHasFinished && initialPlan) {
          const localUpdated: Plan = {
            ...initialPlan,
            partner_collected: nextCollected,
            partner_dialogue_history: historyRef.current,
            partner_current_step_index: newStepIndex,
            partner_dialogue_status: "completed",
          };
          setCompletedPlan(localUpdated);
          onPlanCompleted(localUpdated);
          return;
        }
      } else {
        await savePlan({
          domain,
          status: "in_progress",
          has_partner: nextHasPartner,
          partner_first_name: nextPartnerName,
          dialogue_history: historyRef.current as unknown as Plan["dialogue_history"],
          current_step_index: newStepIndex,
          current_state: { collected: nextCollected },
        });
      }

      if (next !== null) {
        setAutoStartPending(true);
      }
    } else {
      if (isPartner) {
        await savePlan({
          domain,
          partner_dialogue_history: historyRef.current as unknown as Plan["partner_dialogue_history"],
          partner_current_step_index: currentStep,
          partner_dialogue_status: "in_progress",
        });
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
          {messages.map((m, i) => {
            const isLastAndStreaming =
              streaming && i === messages.length - 1 && m.role === "assistant";
            // Skip empty assistant bubbles (tag-only responses) once streaming
            // for that slot is done.
            if (m.role === "assistant" && m.content.trim() === "" && !isLastAndStreaming) {
              return null;
            }
            return (
              <MessageBubble
                key={i}
                role={m.role}
                content={isLastAndStreaming && m.content === "" ? "…" : m.content}
              />
            );
          })}
          {streaming && stepIndex === script.steps.length - 1 && <SynthesisBanner />}
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

function SynthesisBanner() {
  return (
    <div
      style={{
        margin: "8px 0",
        padding: "18px 22px",
        background: "rgba(92,122,101,0.07)",
        border: `1px solid rgba(92,122,101,0.18)`,
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <p
        style={{
          fontFamily: serif,
          fontSize: 16,
          color: ink,
          margin: 0,
          fontWeight: 400,
        }}
      >
        Building your plan…
      </p>
      <p style={{ fontSize: 13, color: muted, margin: 0, lineHeight: 1.55 }}>
        Pulling everything you've shared into a structured plan with KPIs, milestones, and next actions. Takes about 30 seconds.
      </p>
      <div
        style={{
          height: 3,
          borderRadius: 2,
          background: "rgba(92,122,101,0.12)",
          overflow: "hidden",
          position: "relative",
          marginTop: 4,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "40%",
            background: sage,
            borderRadius: 2,
            animation: "junSynthesisBar 1.4s ease-in-out infinite",
          }}
        />
      </div>
      <style>{`@keyframes junSynthesisBar {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(250%); }
      }`}</style>
    </div>
  );
}

function JuniperBerry({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="14" r="8" fill="#4A5EC8" />
      <circle cx="10" cy="14" r="8" fill="url(#dialogueBerryShade)" />
      <ellipse cx="7" cy="11" rx="2.8" ry="1.6" fill="rgba(255,255,255,0.32)" transform="rotate(-30 7 11)" />
      <path
        d="M10 4.5 L10.9 7.2 L13.6 6.2 L11.7 8.8 L14.2 10.4 L11.2 10.1 L11 13 L10 10.8 L9 13 L8.8 10.1 L5.8 10.4 L8.3 8.8 L6.4 6.2 L9.1 7.2 Z"
        fill="#D4922A"
      />
      <defs>
        <radialGradient id="dialogueBerryShade" cx="60%" cy="65%" r="55%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="100%" stopColor="rgba(20,18,60,0.28)" />
        </radialGradient>
      </defs>
    </svg>
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <JuniperBerry size={20} />
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
