import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, MessageSquare, Clock } from "lucide-react";

// ── Design tokens ──────────────────────────────────────────────────────────
const sage = "#5C7A65";
const cream = "#D0E8D2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#B8D4BA";
const sagePale = "#E4F4E6";
const offWhite = "#F2FAF3";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

// ── Animation variants ─────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" as const } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

// ── Shared input style ─────────────────────────────────────────────────────
const fieldBase: React.CSSProperties = {
  height: 52,
  padding: "0 16px",
  border: `1px solid #9DBFA0`,
  borderRadius: 8,
  background: "#fff",
  fontFamily: sans,
  fontSize: 16,
  color: ink,
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
  display: "block",
};

// ── WaitlistForm ───────────────────────────────────────────────────────────
function WaitlistForm({ id }: { id: string }) {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !stage) {
      setError("Please fill in both fields.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, journey_stage: stage }),
      });
    } catch {
      // Endpoint not yet wired — show success state anyway
    }
    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div
        style={{
          background: sagePale,
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: "24px 28px",
          width: "100%",
          maxWidth: 440,
        }}
      >
        <p style={{ fontFamily: serif, fontSize: 20, color: sage, fontWeight: 500, marginBottom: 4, margin: "0 0 4px" }}>
          Thanks. We'll be in touch.
        </p>
        <p style={{ color: muted, fontSize: 14, margin: 0 }}>You're on the early-access list.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 10 }}
      aria-label={`Waitlist signup form ${id}`}
    >
      <label htmlFor={`email-${id}`} className="sr-only">Email address</label>
      <input
        id={`email-${id}`}
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={fieldBase}
      />
      <label htmlFor={`stage-${id}`} className="sr-only">Where are you in your journey?</label>
      <select
        id={`stage-${id}`}
        value={stage}
        onChange={e => setStage(e.target.value)}
        style={{ ...fieldBase, cursor: "pointer", color: stage ? ink : muted }}
      >
        <option value="" disabled>Where are you in your journey?</option>
        <option value="dating_seriously">Dating seriously</option>
        <option value="engaged">Engaged</option>
        <option value="newly_married">Newly married</option>
        <option value="planning_ahead">Planning ahead</option>
      </select>
      {error && (
        <p role="alert" style={{ fontSize: 13, color: "#c0392b", margin: 0 }}>{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        style={{
          height: 52,
          padding: "0 32px",
          background: sage,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontFamily: sans,
          fontSize: 16,
          fontWeight: 500,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.75 : 1,
          transition: "opacity 0.15s",
          width: "100%",
          letterSpacing: "0.01em",
        }}
      >
        {loading ? "Sending…" : "Get early access"}
      </button>
    </form>
  );
}

// ── Section eyebrow ────────────────────────────────────────────────────────
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: sans,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.12em",
        color: muted,
        textTransform: "uppercase",
        margin: "0 0 16px 0",
      }}
    >
      {children}
    </p>
  );
}

// ── Photo placeholder (used for hero + founders) ───────────────────────────
function Photo({
  src,
  alt,
  eager = false,
}: {
  src: string;
  alt: string;
  eager?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 20,
        overflow: "hidden",
        background: sagePale,
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "sepia(8%) saturate(88%) brightness(1.02)",
          display: "block",
        }}
        onError={e => {
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

// ── Landing page ───────────────────────────────────────────────────────────
export default function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    {
      q: "Is Juniper a financial advisor?",
      a: "No. Juniper helps you understand your options and have better conversations with your partner. For regulated advice, we can connect you with a vetted human advisor when it makes sense.",
    },
    {
      q: "What does it cost?",
      a: "Juniper is free during our early access period. We'll share pricing details with waitlist members before launch.",
    },
    {
      q: "Is my financial data private?",
      a: "Yes. Your data is encrypted, never sold, and never shared with your partner without your consent. Privacy is foundational, not a feature.",
    },
    {
      q: "How is this different from a budgeting app?",
      a: "Budgeting apps track what you've spent. Juniper helps you decide what to do next: model scenarios, weigh tradeoffs, and align with your partner on what matters.",
    },
    {
      q: "Do both partners need to use it?",
      a: "No. You can start solo and invite your partner when you're ready. Many of our users begin alone and bring their partner in once they've mapped out their thinking.",
    },
  ];

  return (
    <div style={{ background: cream, color: ink, fontFamily: sans, overflowX: "hidden" }}>

      {/* ── 1. NAV ─────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-12"
        style={{
          height: 68,
          background: "#FAF7F2",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: `1px solid ${border}`,
        }}
      >
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Juniper" style={{ width: 34, height: 34, objectFit: "contain", flexShrink: 0 }} />
          <span style={{ fontFamily: serif, fontSize: 20, color: sage, letterSpacing: "-0.01em", fontWeight: 500 }}>
            Juniper
          </span>
        </div>
        <a href="/app" style={{ fontSize: 14, color: muted, textDecoration: "none" }}>
          Log in
        </a>
      </header>

      {/* ── 2. HERO ────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", minHeight: "92vh", overflow: "hidden", display: "flex", alignItems: "center" }}>
        {/* Full-bleed background illustration */}
        <img
          src="/hero-house.png"
          alt=""
          aria-hidden="true"
          loading="eager"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            display: "block",
          }}
        />
        {/* Left gradient overlay for text legibility */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(100deg, rgba(208,232,210,0.97) 0%, rgba(208,232,210,0.92) 30%, rgba(208,232,210,0.65) 55%, rgba(208,232,210,0.0) 80%)",
          }}
        />
        {/* Content */}
        <div className="relative px-6 md:px-16 py-24 md:py-40" style={{ width: "100%", zIndex: 1 }}>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="flex flex-col"
            style={{ maxWidth: 540 }}
          >
            <motion.h1
              variants={fadeUp}
              style={{
                fontFamily: serif,
                fontSize: "clamp(40px, 5vw, 66px)",
                fontWeight: 400,
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
                color: ink,
                margin: "0 0 24px 0",
              }}
            >
              Build your financial future, together.
            </motion.h1>
            <motion.p
              variants={fadeUp}
              style={{ fontSize: 18, color: muted, lineHeight: 1.65, maxWidth: 480, margin: "0 0 40px 0" }}
            >
              Juniper is the financial planning partner for engaged and newly married couples. Helping you tackle debt, save for a home, and make big decisions without the awkward money talks.
            </motion.p>
            <motion.div variants={fadeUp}>
              <WaitlistForm id="hero" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── 3. EMPATHY ─────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-20 md:py-32" style={{ background: offWhite }}>
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp}
          >
            <Eyebrow>Why Juniper</Eyebrow>
            <h2
              style={{
                fontFamily: serif,
                fontSize: "clamp(28px, 3vw, 48px)",
                fontWeight: 400,
                lineHeight: 1.1,
                color: ink,
                margin: "0 0 64px 0",
                maxWidth: 560,
              }}
            >
              Merging finances is harder than anyone tells you.
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16"
          >
            {[
              {
                icon: <Compass size={26} strokeWidth={1.5} />,
                title: "You don't know where to start",
                body: "Student loans, savings, a future home. The decisions pile up fast, and no one teaches you the order.",
              },
              {
                icon: <MessageSquare size={26} strokeWidth={1.5} />,
                title: "Money conversations get tense",
                body: "Talking about debt, prenups, or budgeting with your partner can feel loaded, even when you agree.",
              },
              {
                icon: <Clock size={26} strokeWidth={1.5} />,
                title: "Advisors feel out of reach",
                body: "Most financial advisors target people 45 and older. You need help now, not in twenty years.",
              },
            ].map(({ icon, title, body }) => (
              <motion.div key={title} variants={fadeUp}>
                <div style={{ color: sage, marginBottom: 18 }} aria-hidden="true">{icon}</div>
                <h3
                  style={{ fontFamily: serif, fontSize: 20, fontWeight: 500, color: ink, margin: "0 0 10px 0", lineHeight: 1.2 }}
                >
                  {title}
                </h3>
                <p style={{ color: muted, fontSize: 16, lineHeight: 1.7, margin: 0 }}>{body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── 4. HOW IT WORKS ────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-20 md:py-32" style={{ background: cream }}>
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp}
          >
            <Eyebrow>How It Works</Eyebrow>
            <h2
              style={{
                fontFamily: serif,
                fontSize: "clamp(28px, 3vw, 48px)",
                fontWeight: 400,
                lineHeight: 1.1,
                color: ink,
                margin: "0 0 64px 0",
              }}
            >
              A calmer way to plan, together.
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16"
          >
            {[
              { num: "01", title: "Tell us your goals", body: "Share where you are and where you're headed. Juniper meets you both there." },
              { num: "02", title: "Model your options", body: "Run scenarios on debt, savings, and home buying, all in plain language." },
              { num: "03", title: "Decide with confidence", body: "Walk into big choices aligned, informed, and on the same page." },
            ].map(({ num, title, body }) => (
              <motion.div key={num} variants={fadeUp} className="flex flex-col gap-4">
                <span
                  style={{ fontFamily: serif, fontSize: 52, fontWeight: 300, color: sage, lineHeight: 1 }}
                  aria-hidden="true"
                >
                  {num}
                </span>
                <h3 style={{ fontFamily: serif, fontSize: 20, fontWeight: 500, color: ink, margin: 0 }}>{title}</h3>
                <p style={{ color: muted, fontSize: 16, lineHeight: 1.7, margin: 0 }}>{body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── 5. STATS ───────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-20 md:py-32" style={{ background: offWhite }}>
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp}
          >
            <Eyebrow>The Numbers</Eyebrow>
            <h2
              style={{
                fontFamily: serif,
                fontSize: "clamp(28px, 3vw, 48px)",
                fontWeight: 400,
                lineHeight: 1.1,
                color: ink,
                margin: "0 0 64px 0",
              }}
            >
              You're not alone in this.
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16"
          >
            {[
              { stat: "70%", caption: "of couples enter marriage with debt" },
              { stat: "40%", caption: "of marriages now include a prenup" },
              { stat: "36%", caption: "of Gen Z would marry someone just to afford a home" },
            ].map(({ stat, caption }) => (
              <motion.div
                key={stat}
                variants={fadeUp}
                className="flex flex-col gap-4"
                style={{
                  background: cream,
                  border: `1px solid ${border}`,
                  borderRadius: 20,
                  padding: "40px 36px",
                }}
              >
                <span
                  style={{
                    fontFamily: serif,
                    fontSize: "clamp(64px, 7vw, 96px)",
                    fontWeight: 300,
                    color: sage,
                    lineHeight: 1,
                    display: "block",
                  }}
                >
                  {stat}
                </span>
                <p style={{ color: muted, fontSize: 16, lineHeight: 1.55, maxWidth: 220, margin: 0 }}>{caption}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── 6. EXAMPLE PROMPTS ─────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-20 md:py-32" style={{ background: cream }}>
        <div className="max-w-[800px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp}
          >
            <Eyebrow>What You Can Ask</Eyebrow>
            <h2
              style={{
                fontFamily: serif,
                fontSize: "clamp(28px, 3vw, 48px)",
                fontWeight: 400,
                lineHeight: 1.1,
                color: ink,
                margin: "0 0 48px 0",
              }}
            >
              Real questions. Real answers.
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            variants={stagger}
            className="flex flex-col gap-5"
          >
            {[
              {
                label: "HOME BUYING",
                text: "We have $63k in student debt and want to afford a $425k house. Between the two of us, we make about $140k a year. How much do we need to save for a down payment, and can we handle the monthly mortgage?",
              },
              {
                label: "MERGING FINANCES",
                text: "We're getting married next year and want to combine our savings. I have $18k in credit card debt and my partner has $40k in student loans. What's the smartest way to tackle this together?",
              },
              {
                label: "PLANNING AHEAD",
                text: "We want to start trying for a baby in two years and also save for a down payment. Can we realistically do both on a $165k combined income, or do we need to choose?",
              },
            ].map(({ label, text }) => (
              <motion.div
                key={label}
                variants={fadeUp}
                style={{
                  background: offWhite,
                  border: `1.5px solid ${border}`,
                  borderRadius: 16,
                  padding: "28px 32px",
                }}
              >
                <p style={{ fontSize: 16, color: ink, lineHeight: 1.75, margin: "0 0 14px 0" }}>{text}</p>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    color: sage,
                    textTransform: "uppercase",
                    margin: 0,
                  }}
                >
                  {label}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── 8. FAQ ─────────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-20 md:py-32" style={{ background: cream }}>
        <div className="max-w-[720px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp}
          >
            <Eyebrow>Questions</Eyebrow>
            <h2
              style={{
                fontFamily: serif,
                fontSize: "clamp(28px, 3vw, 48px)",
                fontWeight: 400,
                lineHeight: 1.1,
                color: ink,
                margin: "0 0 48px 0",
              }}
            >
              Things you might be wondering.
            </h2>
          </motion.div>

          <div style={{ borderTop: `1px solid ${border}` }}>
            {faqs.map(({ q, a }, i) => (
              <div key={q} style={{ borderBottom: `1px solid ${border}` }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "22px 0",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontFamily: serif, fontSize: 18, color: ink, fontWeight: 400 }}>{q}</span>
                  <span
                    style={{ color: sage, fontSize: 22, lineHeight: 1, flexShrink: 0, userSelect: "none", fontWeight: 300 }}
                    aria-hidden="true"
                  >
                    {openFaq === i ? "−" : "+"}
                  </span>
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      key="answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      style={{ overflow: "hidden" }}
                    >
                      <p style={{ color: muted, fontSize: 16, lineHeight: 1.75, paddingBottom: 24, margin: 0 }}>{a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. FINAL CTA ───────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-24 md:py-40 text-center" style={{ background: offWhite }}>
        <div className="max-w-[600px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={stagger}
            className="flex flex-col items-center gap-5"
          >
            <motion.h2
              variants={fadeUp}
              style={{
                fontFamily: serif,
                fontSize: "clamp(30px, 4vw, 54px)",
                fontWeight: 400,
                lineHeight: 1.1,
                color: ink,
                margin: 0,
              }}
            >
              Plan your next chapter with Juniper.
            </motion.h2>
            <motion.p variants={fadeUp} style={{ fontSize: 17, color: muted, lineHeight: 1.65, margin: 0 }}>
              Join the early-access list. We'll be in touch as we open the door.
            </motion.p>
            <motion.div variants={fadeUp} className="w-full flex justify-center">
              <WaitlistForm id="cta" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── 10. FOOTER ─────────────────────────────────────────────────── */}
      <footer
        className="px-6 md:px-12 py-8"
        style={{ background: "#1E3A2A" }}
      >
        <div className="max-w-[1100px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Juniper" style={{ width: 28, height: 28, objectFit: "contain" }} />
            <span style={{ fontFamily: serif, fontSize: 16, color: "#fff", fontWeight: 500 }}>Juniper</span>
          </div>
          <div className="flex flex-wrap items-center gap-6 md:gap-8">
            <a href="/privacy" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>Privacy</a>
            <a href="/terms" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>Terms</a>
            <a href="mailto:hello@juniper.app" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>hello@juniper.app</a>
          </div>
        </div>
        <div className="max-w-[1100px] mx-auto" style={{ marginTop: 20 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>© 2026* Juniper. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
