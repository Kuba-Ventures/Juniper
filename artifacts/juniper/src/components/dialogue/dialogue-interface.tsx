import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowRight, ArrowLeft, Check, User, Users } from "lucide-react";
import { getAccessToken } from "@/lib/supabase";
import {
  getClientScript,
  visibleProgress,
  remainingQuestions,
  nextVisibleStepIndex,
  scriptIsStructured,
  isStructuredStep,
  isLlmStep,
  type ClientDialogueContext,
  type ClientScript,
  type ClientStep,
  type ChoiceOption,
  type MoneyInput,
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
const sageFill = "rgba(92,122,101,0.08)"; // light sage chip fill
const sageTrack = "rgba(92,122,101,0.12)"; // progress track
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
  const structuredFlow = script ? scriptIsStructured(script) : false;

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
      const stored = initialPlan?.partner_current_step_index ?? 0;
      // Step 0 is the partner-check step (skipped for the partner role). If the
      // partner hasn't started (stored 0), jump to the first non-skipped step.
      if (stored > 0) return stored;
      return script ? (nextVisibleStepIndex(script, -1, { is_partner: true }) ?? 0) : 0;
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
      // Seed from the persisted structured answers first, then overlay any
      // per-turn step data captured during legacy chat steps.
      Object.assign(
        init,
        ((initialPlan?.current_state?.collected as Record<string, unknown>) ?? {}),
      );
      for (const turn of initialPlan?.dialogue_history ?? []) {
        if (turn.step_complete_data) Object.assign(init, turn.step_complete_data);
      }
      return init;
    })(),
  );

  // Mirror of collectedRef used for rendering the live preview + question text.
  const [collected, setCollected] = useState<Record<string, unknown>>(() => ({ ...collectedRef.current }));

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

  const ctx: ClientDialogueContext = useMemo(
    () => ({ has_partner: hasPartner, is_partner: isPartner }),
    [hasPartner, isPartner],
  );

  const currentStep: ClientStep | undefined = script?.steps[stepIndex];

  // ── Initial cold start (LLM steps only) ────────────────────────────────
  // Structured flows open on a tap control, so they must NOT fire an LLM turn.
  useEffect(() => {
    if (!script || completedRef.current) return;
    const step = script.steps[stepIndexRef.current];
    if (!isLlmStep(step)) return;
    if (messagesRef.current.length === 0 && !streamingRef.current) {
      setAutoStartPending(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-advance driver (fires an LLM turn: synthesis or a text step) ───
  useEffect(() => {
    if (!autoStartPending) return;
    if (streaming || completedPlan) return;
    setAutoStartPending(false);
    void sendTurn("", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartPending, streaming, completedPlan]);

  const progress = script ? visibleProgress(script, stepIndex, ctx) : { position: 0, total: 0 };
  const questionsLeft = script ? remainingQuestions(script, stepIndex, ctx) : 0;
  const currentStepName = currentStep?.name ?? "";

  // ── Record a structured (tap-first) answer locally, no LLM call ─────────
  function recordAnswer(patch: Record<string, unknown>) {
    if (!script || streamingRef.current || completedRef.current) return;

    const nextCollected = { ...collectedRef.current, ...patch };
    collectedRef.current = nextCollected;
    setCollected(nextCollected);

    // has_partner drives framing + which steps are visible.
    let nextHasPartner = hasPartnerRef.current;
    if (typeof patch.has_partner === "boolean") {
      nextHasPartner = patch.has_partner;
      hasPartnerRef.current = nextHasPartner;
      setHasPartner(nextHasPartner);
    }

    const currentIdx = stepIndexRef.current;
    const next = nextVisibleStepIndex(script, currentIdx, {
      has_partner: nextHasPartner,
      is_partner: isPartner,
    });

    const partnerHasFinished = isPartner && next === null;
    if (partnerHasFinished) completedRef.current = true;

    const newStepIndex = next ?? currentIdx;
    stepIndexRef.current = newStepIndex;
    setStepIndex(newStepIndex);

    // Persist progress. Inviter writes current_state.collected; partner writes
    // partner_collected — the identical key set that PlanAlignment compares.
    if (isPartner) {
      void savePlan({
        domain,
        partner_collected: nextCollected,
        partner_current_step_index: newStepIndex,
        partner_dialogue_status: partnerHasFinished ? "completed" : "in_progress",
      });
      if (partnerHasFinished && initialPlan) {
        const localUpdated: Plan = {
          ...initialPlan,
          partner_collected: nextCollected,
          partner_current_step_index: newStepIndex,
          partner_dialogue_status: "completed",
        };
        setCompletedPlan(localUpdated);
        onPlanCompleted(localUpdated);
      }
      return;
    }

    void savePlan({
      domain,
      status: "in_progress",
      has_partner: nextHasPartner,
      partner_first_name: partnerNameRef.current,
      current_step_index: newStepIndex,
      current_state: { collected: nextCollected },
    });

    // Entering the synthesis (LLM) step: kick the plan generation.
    if (next !== null && !isStructuredStep(script.steps[next])) {
      setAutoStartPending(true);
    }
  }

  // Update collected live (e.g. dragging the money slider) without persisting
  // or advancing — keeps the preview in lockstep with the control.
  function setLiveValue(key: string, value: unknown) {
    const nextCollected = { ...collectedRef.current, [key]: value };
    collectedRef.current = nextCollected;
    setCollected(nextCollected);
  }

  function goBack() {
    if (!script) return;
    for (let i = stepIndexRef.current - 1; i >= 0; i--) {
      if (script.steps[i].skipWhen?.(ctx)) continue;
      stepIndexRef.current = i;
      setStepIndex(i);
      return;
    }
  }

  async function sendTurn(rawText: string, asAutoStart = false) {
    if (!script) return;
    if (streamingRef.current || completedRef.current) return;
    streamingRef.current = true;
    setStreaming(true);
    setErrored(false);

    const currentMessages = messagesRef.current;
    const currentStepIdx = stepIndexRef.current;
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
          step_index: currentStepIdx,
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

    if (!asAutoStart) {
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: rawText, step_index: currentStepIdx },
      ];
    }
    historyRef.current = [
      ...historyRef.current,
      {
        role: "assistant",
        content: strippedAssistant,
        step_index: currentStepIdx,
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
      const synthesisState = (planData.current_state ?? null) as Record<string, unknown> | null;
      const mergedCurrentState: Record<string, unknown> | null = synthesisState
        ? { ...synthesisState, collected: currentCollected }
        : { collected: currentCollected };

      const nowIso = new Date().toISOString();
      const localCompleted: Plan = {
        id: initialPlan?.id ?? "",
        user_id: initialPlan?.user_id ?? "",
        domain,
        status: "completed",
        has_partner: currentHasPartner,
        partner_first_name: currentPartnerName,
        goal: goal ?? null,
        current_state: mergedCurrentState,
        kpis,
        milestones,
        next_actions: nextActions,
        dialogue_history: historyRef.current,
        plan_chat_history: initialPlan?.plan_chat_history ?? [],
        current_step_index: currentStepIdx,
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

      void savePlan({
        domain,
        status: "completed",
        has_partner: currentHasPartner,
        partner_first_name: currentPartnerName,
        goal: goal ?? null,
        current_state: mergedCurrentState,
        kpis,
        milestones,
        next_actions: nextActions,
        dialogue_history: historyRef.current as unknown as Plan["dialogue_history"],
        current_step_index: currentStepIdx,
      });

      return;
    }

    if (stepData) {
      const nextCollected = { ...currentCollected, ...stepData };
      collectedRef.current = nextCollected;
      setCollected(nextCollected);

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

      let next = nextVisibleStepIndex(script, currentStepIdx, {
        has_partner: nextHasPartner,
        is_partner: isPartner,
      });

      const partnerHasFinished = isPartner && next === null;
      if (partnerHasFinished) {
        completedRef.current = true;
      }

      const newStepIndex = next ?? currentStepIdx;
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

      if (next !== null && isLlmStep(script.steps[next])) {
        setAutoStartPending(true);
      }
    } else {
      if (isPartner) {
        await savePlan({
          domain,
          partner_dialogue_history: historyRef.current as unknown as Plan["partner_dialogue_history"],
          partner_current_step_index: currentStepIdx,
          partner_dialogue_status: "in_progress",
        });
      } else {
        await savePlan({
          domain,
          status: "in_progress",
          has_partner: currentHasPartner,
          partner_first_name: currentPartnerName,
          dialogue_history: historyRef.current as unknown as Plan["dialogue_history"],
          current_step_index: currentStepIdx,
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

  // ── Structured (tap-first) flow with live plan preview ──────────────────
  if (structuredFlow) {
    return (
      <StructuredFlow
        script={script}
        currentStep={currentStep}
        stepIndex={stepIndex}
        questionsLeft={questionsLeft}
        collected={collected}
        completedPlan={completedPlan}
        streaming={streaming}
        errored={errored}
        onChoose={recordAnswer}
        onLiveMoney={setLiveValue}
        onCommitMoney={recordAnswer}
        onBack={goBack}
        canGoBack={hasPrevVisibleStep(script, stepIndex, ctx)}
        messages={messages}
        inputValue={input}
        onInputChange={setInput}
        onSend={(t) => void sendTurn(t)}
      />
    );
  }

  // ── Legacy open-ended chat flow (unchanged) ─────────────────────────────
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
            background: sageTrack,
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

// ══════════════════════════════════════════════════════════════════════════
// Structured (tap-first) flow
// ══════════════════════════════════════════════════════════════════════════

type StructuredFlowProps = {
  script: ClientScript;
  currentStep: ClientStep | undefined;
  stepIndex: number;
  questionsLeft: number;
  collected: Record<string, unknown>;
  completedPlan: Plan | null;
  streaming: boolean;
  errored: boolean;
  onChoose: (patch: Record<string, unknown>) => void;
  onLiveMoney: (key: string, value: number) => void;
  onCommitMoney: (patch: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  messages: ApiMessage[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onSend: (text: string) => void;
};

// Does any earlier, non-skipped step exist before the current one?
function hasPrevVisibleStep(
  script: ClientScript,
  stepIndex: number,
  ctx: ClientDialogueContext,
): boolean {
  for (let i = stepIndex - 1; i >= 0; i--) {
    if (!script.steps[i].skipWhen?.(ctx)) return true;
  }
  return false;
}

function StructuredFlow({
  script,
  currentStep,
  stepIndex,
  questionsLeft,
  collected,
  completedPlan,
  streaming,
  errored,
  onChoose,
  onLiveMoney,
  onCommitMoney,
  onBack,
  canGoBack,
  messages,
  inputValue,
  onInputChange,
  onSend,
}: StructuredFlowProps) {
  const done = !!completedPlan;
  const isTextStep = !!currentStep && currentStep.input?.type === "text";
  const total = script.steps.length;
  const pct = Math.min(100, Math.round((stepIndex / Math.max(1, total - 1)) * 100));

  return (
    <div
      style={{
        background: cream,
        fontFamily: sans,
        minHeight: "100%",
        padding: "28px clamp(16px, 5vw, 48px)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          display: "grid",
          gap: "clamp(20px, 4vw, 40px)",
          gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)",
          alignItems: "start",
        }}
        className="jun-onboard-grid"
      >
        {/* left: question / control */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 420 }}>
          {done ? (
            <ReadyState />
          ) : isTextStep && currentStep ? (
            <TextStepPanel
              title={script.title}
              questionsLeft={questionsLeft}
              pct={pct}
              question={questionText(currentStep, collected)}
              helper={
                currentStep.input && "helper" in currentStep.input ? currentStep.input.helper : undefined
              }
              messages={messages}
              streaming={streaming}
              errored={errored}
              inputValue={inputValue}
              onInputChange={onInputChange}
              onSend={onSend}
              canGoBack={canGoBack}
              onBack={onBack}
            />
          ) : streaming || !currentStep || isLlmStep(currentStep) ? (
            <BuildingState errored={errored} />
          ) : (
            <>
              <ProgressHeader title={script.title} questionsLeft={questionsLeft} pct={pct} />
              <h2
                style={{
                  fontFamily: serif,
                  fontSize: "clamp(24px, 4vw, 30px)",
                  fontWeight: 400,
                  color: ink,
                  lineHeight: 1.15,
                  margin: "0 0 28px",
                }}
              >
                {questionText(currentStep, collected)}
              </h2>

              <StepControl
                step={currentStep}
                collected={collected}
                onChoose={onChoose}
                onLiveMoney={onLiveMoney}
                onCommitMoney={onCommitMoney}
              />

              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 12, paddingTop: 32 }}>
                {canGoBack && (
                  <button
                    onClick={onBack}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: sans,
                      fontSize: 14,
                      fontWeight: 500,
                      color: muted,
                      padding: "10px 4px",
                    }}
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                )}
                {currentStep.input?.type === "money" && (
                  <MoneyContinue
                    step={currentStep}
                    collected={collected}
                    lastQuestion={questionsLeft <= 1}
                    onCommitMoney={onCommitMoney}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* right: live plan preview */}
        <LivePreview domain={script.domain} collected={collected} done={done} />
      </div>

      <style>{`
        @media (max-width: 720px) {
          .jun-onboard-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function ProgressHeader({ title, questionsLeft, pct }: { title: string; questionsLeft: number; pct: number }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span
          style={{
            fontFamily: sans,
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: muted,
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <span style={{ fontFamily: sans, fontSize: 12, color: sage, fontWeight: 600 }}>
          {questionsLeft} {questionsLeft === 1 ? "question" : "questions"} left
        </span>
      </div>
      <div style={{ height: 4, width: "100%", borderRadius: 999, background: sageTrack, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: sage, borderRadius: 999, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

function questionText(step: ClientStep, collected: Record<string, unknown>): string {
  const raw = step.input && "question" in step.input ? step.input.question : undefined;
  const q = raw ?? step.name;
  return typeof q === "function" ? q(collected) : q;
}

function StepControl({
  step,
  collected,
  onChoose,
  onLiveMoney,
  onCommitMoney,
}: {
  step: ClientStep;
  collected: Record<string, unknown>;
  onChoose: (patch: Record<string, unknown>) => void;
  onLiveMoney: (key: string, value: number) => void;
  onCommitMoney: (patch: Record<string, unknown>) => void;
}) {
  const inp = step.input;
  if (!inp) return null;

  if (inp.type === "choice" || inp.type === "timeline") {
    const key = inp.key;
    const options = inp.options;
    const selected = collected[key];
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {options.map((o) => (
          <Chip
            key={String(o.value)}
            option={o}
            active={selected === o.value}
            onClick={() => {
              const patch: Record<string, unknown> = { [key]: o.value };
              if (inp.also) Object.assign(patch, inp.also(o.value as never));
              // auto-advance after a short beat, the Felix Pago way
              window.setTimeout(() => onChoose(patch), 180);
            }}
          />
        ))}
      </div>
    );
  }

  if (inp.type === "money") {
    return (
      <MoneyControl
        key={inp.key}
        step={inp}
        value={typeof collected[inp.key] === "number" ? (collected[inp.key] as number) : inp.default}
        onChange={(v) => onLiveMoney(inp.key, v)}
      />
    );
  }

  return null;
}

function Chip({
  option,
  active,
  onClick,
}: {
  option: ChoiceOption;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = option.icon === "user" ? User : option.icon === "users" ? Users : null;
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        padding: "12px 20px",
        cursor: "pointer",
        fontFamily: sans,
        fontSize: 15,
        fontWeight: 500,
        textAlign: "left",
        color: active ? "#fff" : ink,
        background: active ? sage : sageFill,
        border: `1px solid ${active ? sage : border}`,
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {Icon && <Icon size={17} strokeWidth={2} style={{ opacity: 0.85 }} />}
      {option.label}
    </button>
  );
}

function MoneyControl({
  step,
  value,
  onChange,
}: {
  step: MoneyInput;
  value: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value ?? step.default));

  const commas = (n: string) => (n === "" ? "" : Number(n).toLocaleString("en-US"));
  const display = editing ? commas(text) : fmtMoney(value).replace("$", "");

  const onType = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, "");
    setText(digits);
    onChange(digits === "" ? 0 : parseInt(digits, 10));
  };
  const commit = () => {
    setEditing(false);
    const clamped = Math.min(step.max, Math.max(step.min, value || 0));
    onChange(clamped);
    setText(String(clamped));
  };
  const setFromControl = (v: number) => {
    onChange(v);
    setText(String(v));
  };

  return (
    <div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          paddingBottom: 4,
          borderBottom: `2px solid ${editing ? sage : border}`,
        }}
      >
        <span style={{ fontFamily: serif, fontSize: 44, fontWeight: 500, color: ink, lineHeight: 1 }}>$</span>
        <input
          type="text"
          inputMode="numeric"
          value={display}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => {
            setEditing(true);
            setText(String(value ?? step.default));
          }}
          onBlur={commit}
          aria-label="Amount"
          style={{
            fontFamily: serif,
            fontSize: 44,
            fontWeight: 500,
            color: ink,
            lineHeight: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            width: `${Math.max(2, display.length)}ch`,
          }}
        />
      </div>
      <p style={{ marginTop: 6, fontFamily: sans, fontSize: 12, color: muted }}>
        Type it, drag the slider, or tap an amount.
      </p>

      <input
        type="range"
        min={step.min}
        max={step.max}
        step={step.step}
        value={Math.min(step.max, Math.max(step.min, value || 0))}
        onChange={(e) => setFromControl(Number(e.target.value))}
        style={{ marginTop: 20, width: "100%", accentColor: sage }}
      />
      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {step.chips.map((c) => (
          <Chip
            key={c}
            option={{ value: c, label: fmtMoney(c) }}
            active={value === c}
            onClick={() => setFromControl(c)}
          />
        ))}
      </div>
    </div>
  );
}

function MoneyContinue({
  step,
  collected,
  lastQuestion,
  onCommitMoney,
}: {
  step: ClientStep;
  collected: Record<string, unknown>;
  lastQuestion: boolean;
  onCommitMoney: (patch: Record<string, unknown>) => void;
}) {
  const inp = step.input as MoneyInput;
  const value = typeof collected[inp.key] === "number" ? (collected[inp.key] as number) : inp.default;
  return (
    <button
      onClick={() => {
        const clamped = Math.min(inp.max, Math.max(inp.min, value));
        const patch: Record<string, unknown> = { [inp.key]: clamped };
        if (inp.also) Object.assign(patch, inp.also(clamped));
        onCommitMoney(patch);
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        padding: "12px 24px",
        cursor: "pointer",
        fontFamily: sans,
        fontSize: 15,
        fontWeight: 600,
        color: "#fff",
        background: sage,
        border: "none",
      }}
    >
      {lastQuestion ? "See my plan" : "Continue"} <ArrowRight size={17} />
    </button>
  );
}

// Open-ended (text) step rendered inside the structured layout: the question,
// Juniper's streamed reply, and a reply box. Advances on <STEP_COMPLETE>.
function TextStepPanel({
  title,
  questionsLeft,
  pct,
  question,
  helper,
  messages,
  streaming,
  errored,
  inputValue,
  onInputChange,
  onSend,
  canGoBack,
  onBack,
}: {
  title: string;
  questionsLeft: number;
  pct: number;
  question: string;
  helper?: string;
  messages: ApiMessage[];
  streaming: boolean;
  errored: boolean;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSend: (text: string) => void;
  canGoBack: boolean;
  onBack: () => void;
}) {
  const submit = () => {
    if (inputValue.trim() && !streaming) onSend(inputValue.trim());
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 420 }}>
      <ProgressHeader title={title} questionsLeft={questionsLeft} pct={pct} />
      <h2
        style={{
          fontFamily: serif,
          fontSize: "clamp(24px, 4vw, 30px)",
          fontWeight: 400,
          color: ink,
          lineHeight: 1.15,
          margin: "0 0 8px",
        }}
      >
        {question}
      </h2>
      {helper && <p style={{ fontFamily: sans, fontSize: 14, color: muted, margin: "0 0 20px" }}>{helper}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
        {messages.map((m, i) => {
          const isLastAndStreaming = streaming && i === messages.length - 1 && m.role === "assistant";
          if (m.role === "assistant" && m.content.trim() === "" && !isLastAndStreaming) return null;
          return (
            <MessageBubble
              key={i}
              role={m.role}
              content={isLastAndStreaming && m.content === "" ? "…" : m.content}
            />
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{
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
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={streaming ? "Juniper is thinking…" : "Type your answer…"}
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
          disabled={!inputValue.trim() || streaming}
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
            cursor: inputValue.trim() && !streaming ? "pointer" : "default",
            opacity: inputValue.trim() && !streaming ? 1 : 0.4,
            flexShrink: 0,
          }}
        >
          <ArrowUp size={16} strokeWidth={2.5} />
        </button>
      </form>
      {errored && <p style={{ color: "#b94040", fontSize: 12, marginTop: 8 }}>Connection error. Try again.</p>}

      {canGoBack && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={onBack}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: sans,
              fontSize: 14,
              fontWeight: 500,
              color: muted,
              padding: "8px 4px",
            }}
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      )}
    </div>
  );
}

function ReadyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          background: sage,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Check size={24} color="#fff" strokeWidth={2.5} />
      </div>
      <h2 style={{ fontFamily: serif, fontSize: 30, fontWeight: 400, color: ink, lineHeight: 1.15, margin: "0 0 12px" }}>
        Your plan's ready.
      </h2>
      <p style={{ fontFamily: sans, fontSize: 15, color: muted, lineHeight: 1.6, maxWidth: 380, margin: 0 }}>
        A few taps, no essays. Opening your plan now, where you can tweak any number and invite your partner to align.
      </p>
    </div>
  );
}

function BuildingState({ errored }: { errored: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
      <div style={{ width: 26, height: 26, marginBottom: 16 }}>
        <JuniperBerry size={26} />
      </div>
      <h2 style={{ fontFamily: serif, fontSize: 28, fontWeight: 400, color: ink, lineHeight: 1.15, margin: "0 0 10px" }}>
        Building your plan…
      </h2>
      <p style={{ fontFamily: sans, fontSize: 14, color: muted, lineHeight: 1.6, maxWidth: 380, margin: "0 0 16px" }}>
        Turning your answers into a plan with KPIs, milestones, and next actions. Just a moment.
      </p>
      <div style={{ height: 3, width: 220, borderRadius: 2, background: sageTrack, overflow: "hidden", position: "relative" }}>
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
      {errored && (
        <p style={{ color: "#b94040", fontSize: 12, marginTop: 12 }}>
          Connection error. Please refresh and try again.
        </p>
      )}
      <style>{`@keyframes junSynthesisBar {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(250%); }
      }`}</style>
    </div>
  );
}

// ── Live plan preview ──────────────────────────────────────────────────
type PreviewRow = { label: string; value: string; sub: string | null; pct: number };
type PreviewData = { title: string; headline: string; rows: PreviewRow[]; next: string | null };

function num(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

const PREVIEW_BUILDERS: Record<string, (a: Record<string, unknown>) => PreviewData> = {
  "home-buying": (a) => {
    const price = num(a.target_home_price);
    const months = num(a.target_months);
    const saved = num(a.total_savings);
    const downTarget = price != null ? Math.round(price * 0.2) : null;
    const gap = downTarget != null && saved != null ? Math.max(0, downTarget - saved) : null;
    const monthly = gap != null && months ? Math.round(gap / months / 100) * 100 : null;
    const pct = downTarget && saved != null ? Math.min(100, Math.round((saved / downTarget) * 100)) : 0;
    return {
      title: "Home Buying",
      headline:
        price != null && months != null
          ? `Buy a ${fmtMoney(price)} home by ${fmtDate(months)}`
          : "Your plan builds as you answer",
      rows: [
        {
          label: "Down payment saved",
          value: fmtMoney(saved ?? 0),
          sub: downTarget != null ? fmtMoney(downTarget) : null,
          pct,
        },
        {
          label: "Monthly savings needed",
          value: monthly != null ? fmtMoney(monthly) : "—",
          sub: gap != null ? `${fmtMoney(gap)} to go` : null,
          pct: monthly != null ? 100 : 0,
        },
      ],
      next:
        monthly != null
          ? `Open a high-yield savings account and automate ${fmtMoney(monthly)}/mo toward the down payment.`
          : null,
    };
  },

  "combining-finances": (a) => {
    const accounts = pickLabel(a.accounts_approach, {
      joint: "Fully joint",
      separate: "Fully separate",
      hybrid: "Yours, mine & ours",
    });
    const months = num(a.emergency_fund_months);
    const monthly = num(a.monthly_savings);
    return {
      title: "Combining Finances",
      headline: accounts ? `${accounts} accounts` : "Your plan builds as you answer",
      rows: [
        {
          label: "Emergency fund target",
          value: months != null ? `${months} months` : "—",
          sub: null,
          pct: months != null ? Math.min(100, Math.round((months / 12) * 100)) : 0,
        },
        {
          label: "Saving together",
          value: monthly != null ? `${fmtMoney(monthly)}/mo` : "—",
          sub: null,
          pct: monthly ? 100 : 0,
        },
      ],
      next:
        monthly != null
          ? `Automate ${fmtMoney(monthly)}/mo into a shared high-yield account for the emergency fund.`
          : null,
    };
  },

  "debt-paydown": (a) => {
    const total = num(a.total_debt);
    const monthly = num(a.monthly_target);
    const method = pickLabel(a.payoff_method, { avalanche: "avalanche", snowball: "snowball" });
    const months = total != null && monthly ? Math.ceil(total / monthly) : null;
    return {
      title: "Debt Paydown",
      headline:
        total != null
          ? `Pay off ${fmtMoney(total)}${method ? ` with the ${method} method` : ""}`
          : "Your plan builds as you answer",
      rows: [
        { label: "Total debt", value: total != null ? fmtMoney(total) : "—", sub: null, pct: total ? 100 : 0 },
        {
          label: "Months to debt-free",
          value: months != null ? `${months} mo` : "—",
          sub: monthly ? `${fmtMoney(monthly)}/mo` : null,
          pct: months != null ? 100 : 0,
        },
      ],
      next:
        monthly != null
          ? `Set up an automatic ${fmtMoney(monthly)}/mo payment toward your target balance.`
          : null,
    };
  },

  "baby-planning": (a) => {
    const year = num(a.target_year);
    const goal = num(a.savings_goal);
    const monthly = num(a.monthly_cost_estimate);
    return {
      title: "Baby Planning",
      headline: year != null ? `Ready for a baby by ${year}` : "Your plan builds as you answer",
      rows: [
        { label: "Baby fund goal", value: goal != null ? fmtMoney(goal) : "—", sub: null, pct: goal ? 100 : 0 },
        {
          label: "Monthly childcare",
          value: monthly != null ? `${fmtMoney(monthly)}/mo` : "—",
          sub: null,
          pct: monthly ? 100 : 0,
        },
      ],
      next:
        goal != null
          ? `Open a dedicated baby-fund savings account and start building toward ${fmtMoney(goal)}.`
          : null,
    };
  },

  prenup: (a) => {
    const property = pickLabel(a.property_treatment, {
      community: "Shared (community)",
      separate: "Kept separate",
      hybrid: "A mix",
    });
    const inheritance = pickLabel(a.inheritance_treatment, {
      separate: "Stay separate",
      shared: "Become shared",
      depends: "Depends",
    });
    const support = pickLabel(a.support_stance, {
      waive: "Waived",
      keep: "Kept",
      formula: "Formula-based",
    });
    return {
      title: "Prenup & Legal",
      headline: "Your prenup framework",
      rows: [
        { label: "Property", value: property ?? "—", sub: null, pct: property ? 100 : 0 },
        { label: "Inheritances", value: inheritance ?? "—", sub: null, pct: inheritance ? 100 : 0 },
        { label: "Spousal support", value: support ?? "—", sub: null, pct: support ? 100 : 0 },
      ],
      next: property ? "Bring this framework to a family law attorney to formalize it." : null,
    };
  },
};

// Map a stored choice value to a display label; null when unanswered.
function pickLabel(v: unknown, labels: Record<string, string>): string | null {
  return typeof v === "string" && v in labels ? labels[v] : null;
}

function LivePreview({
  domain,
  collected,
  done,
}: {
  domain: string;
  collected: Record<string, unknown>;
  done: boolean;
}) {
  const builder = PREVIEW_BUILDERS[domain];
  if (!builder) return <div />;
  const p = builder(collected);

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${border}`,
        borderRadius: 18,
        padding: 24,
        position: "sticky",
        top: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: sageFill,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <JuniperBerry size={22} />
        </div>
        <span
          style={{
            fontFamily: sans,
            fontSize: 10,
            letterSpacing: "0.12em",
            fontWeight: 600,
            color: done ? sage : muted,
          }}
        >
          {done ? "READY" : "BUILDING…"}
        </span>
      </div>

      <h3 style={{ fontFamily: serif, fontSize: 24, fontWeight: 400, color: ink, margin: 0 }}>{p.title}</h3>
      <p style={{ fontFamily: sans, fontSize: 14, color: muted, margin: "4px 0 24px" }}>{p.headline}</p>

      {p.rows.map((row) => (
        <PreviewRowView key={row.label} row={row} />
      ))}

      {done && p.next && (
        <div style={{ marginTop: 20, borderRadius: 12, padding: 16, background: cream }}>
          <span style={{ fontFamily: sans, fontSize: 10, letterSpacing: "0.12em", color: muted, fontWeight: 600 }}>
            NEXT
          </span>
          <p style={{ fontFamily: sans, fontSize: 14, color: ink, margin: "4px 0 0", lineHeight: 1.5 }}>{p.next}</p>
        </div>
      )}
    </div>
  );
}

function PreviewRowView({ row }: { row: PreviewRow }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontFamily: sans, fontSize: 13, color: muted }}>{row.label}</span>
        <span style={{ fontFamily: sans, fontSize: 13, color: ink, fontWeight: 600 }}>
          {row.value}
          {row.sub && <span style={{ color: muted, fontWeight: 400 }}> / {row.sub}</span>}
        </span>
      </div>
      <div style={{ marginTop: 8, height: 6, width: "100%", borderRadius: 999, background: sageFill, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${row.pct}%`, background: sage, borderRadius: 999, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// ── Money formatting (shared with preview) ──────────────────────────────
function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

function fmtDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
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
      <p style={{ fontFamily: serif, fontSize: 16, color: ink, margin: 0, fontWeight: 400 }}>
        Building your plan…
      </p>
      <p style={{ fontSize: 13, color: muted, margin: 0, lineHeight: 1.55 }}>
        Pulling everything you've shared into a structured plan with KPIs, milestones, and next actions. Takes about 30 seconds.
      </p>
      <div
        style={{
          height: 3,
          borderRadius: 2,
          background: sageTrack,
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
