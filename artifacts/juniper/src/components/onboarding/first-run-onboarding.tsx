import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ShieldCheck, Building2 } from "lucide-react";
import type { UserProfile } from "@/lib/profile";
import { takePendingHousehold } from "@/lib/profile";
import { syncFinancesUntilTransactions, layerEnabled, normInstitutionName, fetchConnectionNames } from "@/lib/plaid";
import { useLinkQueue } from "@/lib/use-link-queue";
import { InstitutionPicker } from "@/components/juniper/institution-picker";
import { ManualAccountForm } from "@/components/juniper/manual-account-form";
import { LayerDiscovery } from "@/components/juniper/layer-discovery";
import "@/styles/juniper.css";

// Onboarding used to be four blocking steps (name+household, goals, connect,
// money snapshot). Issue #267 counted them on a fresh signup and cut three:
// name and household now live on the sign-up screen itself (stashed via
// stashPendingHousehold, since there is no session yet to save them through),
// and goals and the money snapshot are dismissible dashboard nudges
// (GoalsNudge / SnapshotNudge in components/juniper/) rather than a gate,
// asked once the member has a real dashboard to plan against instead of
// before they have seen a single number of their own. Connect is the one
// step every path still needs, so it is the only one left here.
type StepKind = "connect";
const STEPS: StepKind[] = ["connect"];

export function FirstRunOnboarding({
  email,
  initialName,
  onComplete,
}: {
  email: string;
  initialName: string;
  onComplete: (profile: UserProfile, name: string) => void;
}) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);

  // Read once and consumed on read, same shape as takeOnboardingReplay: a
  // second mount (a developer replay, a re-render) must not go looking for a
  // value sign-up already handed off.
  const [household] = useState(() => takePendingHousehold(email));
  const [linked, setLinked] = useState(false);
  // Institutions linked BEFORE this run. Onboarding is not only a new member's
  // first five minutes: the developer reset replays it, and that reset leaves
  // linked banks in place, so the member arriving here can already have a dozen
  // connections. Without this the connect step showed them an empty picker and
  // an "I'll do this later" button as if nothing were connected yet.
  const [already, setAlready] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    void fetchConnectionNames()
      .then((names) => {
        if (!live || names.length === 0) return;
        setAlready(names);
        setLinked(true);
      })
      .catch(() => {
        // A failed read means we simply do not know, and the flow behaves as it
        // did before: connect from scratch.
      });
    return () => { live = false; };
  }, []);

  const step = STEPS[i];
  const total = STEPS.length;

  // Accounts + balances now come from linking a bank (Plaid), so onboarding
  // itself only captures household. Net worth and the score fill in from live
  // data once an account is connected; income, expenses and goals arrive later
  // from the dashboard nudges, if the member fills them in at all.
  const buildProfile = useCallback((): UserProfile => ({ household }), [household]);

  const finish = useCallback(() => {
    setDone(true);
    const profile = buildProfile();
    // Brief "you're all set" beat, then hand off to the dashboard.
    setTimeout(() => onComplete(profile, initialName), 900);
  }, [buildProfile, initialName, onComplete]);

  const next = () => (i + 1 >= total ? finish() : setI(i + 1));

  return (
    <div className="jnpr onboard">
      <div className="ob-top">
        <div className="brand">
          <img src="/logo.png" alt="Juniper" />
          Juniper
        </div>
        {!done && (
          <button className="ob-skip" onClick={finish}>
            Skip for now
          </button>
        )}
      </div>

      <div className="ob-body">
        {done ? (
          <div className="ob-done">
            <div className="ob-check">
              <Check strokeWidth={2.5} />
            </div>
            <h2>You're all set{initialName.trim() ? `, ${initialName.trim()}` : ""}.</h2>
            <p className="ob-help">Building your dashboard from what you shared…</p>
          </div>
        ) : (
          <>
            {step === "connect" && (
              <ConnectStep already={already} onLinked={() => setLinked(true)} />
            )}

            <div className="ob-nav">
              <button className="btn" onClick={next}>
                {i + 1 >= total ? "Finish" : "Continue"} <ArrowRight />
              </button>
              {step === "connect" && !linked && (
                <button className="ob-ghostskip" onClick={next}>
                  I'll do this later
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConnectStep({ already, onLinked }: { already: string[]; onLinked: () => void }) {
  const [manual, setManual] = useState(false);
  // Institutions connected this session (via instant discovery, the Plaid link
  // queue, or manual add), normalized for matching. Passed to the picker, which
  // both drops them out of its search results and lists them as Connected. That
  // list is the only confirmation this step has: there is no linked-accounts list
  // on this screen, so a member who links two banks in a row needs to see both
  // names to know the first one took.
  const [connected, setConnected] = useState<Map<string, string>>(new Map());
  // Accounts entered by hand this session (issue #328): ManualAccountForm's
  // onSaved always succeeded, but nothing on this screen ever said so, unlike
  // a Plaid link, which gets the banner below through `connected`. A member
  // typing in a real balance had no way to tell it took.
  const [manualAdded, setManualAdded] = useState<string[]>([]);

  // Shared with the Stage 10c credit-pull consent block below: Layer and
  // Spinwheel both need a phone number, and a member should type it once per
  // screen, not once per feature that happens to want it. Lifted here rather
  // than into LayerDiscovery itself, since ConnectStep is the first ancestor
  // both consumers share. Layer is disabled in most environments today
  // (layerEnabled() needs VITE_PLAID_LAYER set), so CreditPullConsent below
  // always renders its own phone field regardless -- this state is what makes
  // that field arrive pre-filled on the sessions where Layer already asked.
  const [phone, setPhone] = useState("");
  // Stage 10c only drafts this consent (see CreditPullConsent below); nothing
  // reads `creditConsented`/`creditDob` yet. Stage 10d is where a real submit
  // path is wired to actually trigger a pull with them.
  const [creditConsented, setCreditConsented] = useState(false);
  const [creditDob, setCreditDob] = useState("");

  // What the picker sees: this session's links on top of the ones the member
  // already had. The picker lists these as Connected and drops them out of its
  // search results, so a member cannot be offered a bank they linked last month
  // and cannot be left wondering whether their existing connections survived a
  // reset.
  const known = useMemo(() => {
    const m = new Map(connected);
    for (const n of already) {
      const key = normInstitutionName(n);
      if (n && !m.has(key)) m.set(key, n);
    }
    return m;
  }, [connected, already]);

  // Linked in THIS run, which is a different question from whether anything is
  // linked at all: the confirmation below reports what just happened, so a bank
  // linked last month must not claim "Account added". A manual add counts too,
  // for the same reason.
  const linkedThisSession = connected.size > 0 || manualAdded.length > 0;

  const markConnected = useCallback(
    (institutions?: string[]) => {
      if (institutions?.length) {
        setConnected((prev) => {
          const next = new Map(prev);
          for (const n of institutions) if (n) next.set(normInstitutionName(n), n);
          return next;
        });
      }
      onLinked();
    },
    [onLinked],
  );

  const { start, busy, progress, notice, setNotice } = useLinkQueue({
    onItemLinked: (institution) => markConnected(institution ? [institution] : undefined),
    onDone: ({ linked: count }) => {
      // Bounded background retry, not a single shot: the first pull is usually
      // not ready yet, and the very next step of onboarding polls the same data
      // to pre-fill the member's income and spending.
      if (count > 0) void syncFinancesUntilTransactions();
    },
  });

  const connect = useCallback(
    (institutions: Parameters<typeof start>[0]) => {
      setNotice(null);
      void start(institutions);
    },
    [start, setNotice],
  );

  return (
    <>
      <h2>Connect your accounts for live balances.</h2>
      <p className="ob-help">
        Optional, but it's the magic: search for your bank and tap it to connect, and Juniper keeps your net
        worth, spending, and score up to date automatically. Plaid links one institution per session, so search
        again for each account you want. Use <b>enter it by hand</b> for anything Plaid can't reach. You can
        always do this later.
      </p>

      {linkedThisSession && (
        <div className="ob-connected">
          <Check size={18} strokeWidth={2.5} />{" "}
          {connected.size === 0 && manualAdded.length === 1
            ? `${manualAdded[0]} added. Add another below, or continue.`
            : "Account added. Search for another below, or continue."}
        </div>
      )}
      {!linkedThisSession && already.length > 0 && (
        <div className="ob-connected">
          <Check size={18} strokeWidth={2.5} />{" "}
          {already.length === 1
            ? "Your account is already connected. Add another below, or continue."
            : `Your ${already.length} accounts are already connected. Add another below, or continue.`}
        </div>
      )}
      {notice && <div className="form-error" style={{ marginBottom: 12 }}>{notice}</div>}
      {busy && (
        <div className="ob-connected" style={{ color: "var(--jnpr-accent)", background: "var(--jnpr-accent-soft)" }}>
          <Building2 size={16} />{" "}
          {progress.total > 1
            ? `Connecting account ${progress.index + 1} of ${progress.total}…`
            : "Opening secure link…"}
        </div>
      )}

      {layerEnabled() && !manual && (
        <LayerDiscovery onLinked={markConnected} phone={phone} onPhoneChange={setPhone} />
      )}

      {manual ? (
        <ManualAccountForm
          onSaved={(acct) => {
            setManualAdded((prev) => [...prev, acct.name]);
            setManual(false);
            onLinked();
          }}
          onCancel={() => setManual(false)}
        />
      ) : (
        <InstitutionPicker onConnect={connect} onManual={() => setManual(true)} busy={busy} connected={known} />
      )}

      <CreditPullConsent
        phone={phone}
        onPhoneChange={setPhone}
        consented={creditConsented}
        onConsentChange={setCreditConsented}
        dob={creditDob}
        onDobChange={setCreditDob}
      />

      <p className="ob-secure">
        <ShieldCheck />
        Juniper connects through Plaid with bank-grade encryption and read-only access. Your bank credentials
        are entered with Plaid and never touch Juniper's servers.
      </p>
    </>
  );
}

// Stage 10c: the credit-pull consent block. DRAFT COPY -- the disclosure text
// below is Spinwheel's own required "written instructions" language
// (developer.spinwheel.io docs), not something Juniper wrote, but the
// surrounding design and the exact wording around it still need a lawyer's
// sign-off before a real member ever sees this. See docs/CREDIT_PROVIDER.md
// section 4 and PROJECT.md's 2026-09-07 Decisions log entry for why.
//
// One checkbox, not a separate card: three treatments (a collapsed card, an
// always-visible card, a nudge-into-modal) were rendered live first
// (previews/credit-pull-consent-options.html), and Finley asked whether any
// of that visual weight was needed at all given the phone number is already
// shared with Layer above. It is not. The disclosure text still has to be
// somewhere the member affirmatively agrees to it (Spinwheel's contract
// requires their exact language, and the FTC "grant, not notification" test
// this whole design follows requires a real unchecked-by-default action, not
// a paragraph plus a "continue" button), but that "somewhere" can be the
// checkbox's own label instead of a card above it.
//
// Identity match (the other Stage 10c decision): Spinwheel's own minimum,
// phone + date of birth, nothing more. Resolved 2026-09-07, see PROJECT.md.
//
// Phone is shared with LayerDiscovery via controlled props (ConnectStep lifts
// it), pre-filling this field whenever Layer already asked, which is not most
// sessions today: layerEnabled() is off unless VITE_PLAID_LAYER is set, so
// this component always renders its own phone input rather than assuming one
// exists above it.
function CreditPullConsent({
  phone,
  onPhoneChange,
  consented,
  onConsentChange,
  dob,
  onDobChange,
}: {
  phone: string;
  onPhoneChange: (v: string) => void;
  consented: boolean;
  onConsentChange: (v: boolean) => void;
  dob: string;
  onDobChange: (v: string) => void;
}) {
  return (
    <div className="ob-credit-consent">
      <label className="ob-credit-row">
        <input type="checkbox" checked={consented} onChange={(e) => onConsentChange(e.target.checked)} />
        <span className="ob-credit-label">
          <b>Pull my credit history too.</b> By checking this, you're providing "written instructions" to
          Spinwheel Solutions, Inc. authorizing it to obtain your credit profile from Equifax on Juniper's
          behalf.{" "}
          <a href="https://spinwheel.io/legal/end-user-agreement" target="_blank" rel="noreferrer">
            End User Agreement
          </a>
          .
        </span>
      </label>
      {consented && (
        <div className="ob-credit-fields">
          <input
            className="ob-input"
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
          />
          <input
            className="ob-input"
            placeholder="Date of birth (MM/DD/YYYY)"
            value={dob}
            onChange={(e) => onDobChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
