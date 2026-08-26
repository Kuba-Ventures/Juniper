import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Smartphone, Sparkles, Check, Lock } from "lucide-react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import {
  createLayerSession,
  exchangePublicToken,
  syncFinances,
  syncFinancesUntilTransactions,
  layerDemo,
  type LinkInstitution,
} from "@/lib/plaid";
import {
  saveManualAccount,
  MANUAL_CATEGORIES,
  type ManualCategory,
  type ManualKind,
} from "@/lib/manual-accounts";
import { trackEngagement } from "@/lib/analytics";

// Account discovery, tier 1 (Plaid Layer): the phone-first "instant" path. Enter
// a phone number and see the accounts you've already connected, ready to pick.
//
// Two modes (VITE_PLAID_LAYER):
//  - "live": real Plaid Layer. Gated on Plaid Production + a Layer template
//    (PLAID_LAYER_TEMPLATE_ID); the account-selection UI is Plaid-hosted. Layer's
//    multi-item return + exchange can only be exercised against Production, so
//    the exchange here reuses the standard public-token exchange and MUST be
//    verified end-to-end when Layer is turned on.
//  - "demo": simulated discovery so the whole flow is testable on Sandbox. The
//    recognized accounts are mocked and, on connect, saved as manual accounts
//    (tier 3) so they actually land on the dashboard + net worth.
// `onLinked` optionally carries the institution names that were imported, so the
// caller can reflect them as already-connected in the gallery below.
type OnLinked = (institutions?: string[]) => void;

export function LayerDiscovery({ onLinked }: { onLinked: OnLinked }) {
  return layerDemo() ? <LayerDemo onLinked={onLinked} /> : <LayerLive onLinked={onLinked} />;
}

// ── live (real Plaid Layer) ──────────────────────────────────────────────────
function LayerLive({ onLinked }: { onLinked: OnLinked }) {
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      const institution: LinkInstitution | undefined = metadata.institution
        ? { institution_id: metadata.institution.institution_id, name: metadata.institution.name }
        : undefined;
      setToken(null);
      setBusy(false);
      const item = await exchangePublicToken(publicToken, institution);
      if (item) {
        trackEngagement("connection_linked");
        onLinked(institution?.name ? [institution.name] : undefined);
        // A real Plaid link, so the same wait applies as on the other link
        // paths: retry until the transaction feed lands. (The demo path below
        // imports manual accounts, which never produce transactions, so it
        // stays on the single pass.)
        void syncFinancesUntilTransactions();
      } else {
        setNotice("We couldn't finish importing those accounts. You can pick them below instead.");
      }
    },
    [onLinked],
  );

  const { open, ready } = usePlaidLink({
    token: token ?? "",
    onSuccess,
    onExit: () => {
      setToken(null);
      setBusy(false);
    },
  });

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  const go = useCallback(async () => {
    setNotice(null);
    setBusy(true);
    const t = await createLayerSession(phone.trim() || undefined);
    if (t) setToken(t);
    else {
      setBusy(false);
      setNotice("Instant discovery isn't available right now, pick your accounts below instead.");
    }
  }, [phone]);

  return (
    <LayerShell>
      <PhoneRow phone={phone} setPhone={setPhone} onGo={go} busy={busy} label={busy ? "Looking…" : "Find my accounts"} />
      {notice && <div className="form-error" style={{ marginTop: 8 }}>{notice}</div>}
    </LayerShell>
  );
}

// ── demo (simulated discovery, Sandbox-testable) ─────────────────────────────
type DemoAcct = {
  id: string;
  name: string;
  institution: string;
  category: ManualCategory;
  kind: ManualKind;
  balance: number;
};

// A stand-in for what Layer would surface, shaped like a real person's spread
// (a couple of banks, a brokerage, a 401k, a card, a cash app).
const DEMO_ACCOUNTS: DemoAcct[] = [
  { id: "d1", name: "Brokerage", institution: "Charles Schwab", category: "investing", kind: "asset", balance: 46200 },
  { id: "d2", name: "401(k)", institution: "Fidelity", category: "investing", kind: "asset", balance: 71800 },
  { id: "d3", name: "Online Savings", institution: "Marcus by Goldman Sachs", category: "banking", kind: "asset", balance: 21500 },
  { id: "d4", name: "Checking", institution: "Carter Bank & Trust", category: "banking", kind: "asset", balance: 3900 },
  { id: "d5", name: "Venmo balance", institution: "Venmo", category: "cash", kind: "asset", balance: 280 },
  { id: "d6", name: "Sapphire card", institution: "Chase", category: "credit", kind: "liability", balance: 1240 },
];

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const catLabel = (key: ManualCategory) => MANUAL_CATEGORIES.find((c) => c.key === key)?.label ?? key;

function LayerDemo({ onLinked }: { onLinked: OnLinked }) {
  const [phase, setPhase] = useState<"phone" | "loading" | "results" | "done">("phone");
  const [phone, setPhone] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(DEMO_ACCOUNTS.map((a) => a.id)));
  const [saving, setSaving] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const go = useCallback(() => {
    setNotice(null);
    setPhase("loading");
    // Simulate the network round-trip so the "recognizing you…" beat is visible.
    setTimeout(() => setPhase("results"), 900);
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOn = selected.size === DEMO_ACCOUNTS.length;
  const toggleAll = () =>
    setSelected(allOn ? new Set() : new Set(DEMO_ACCOUNTS.map((a) => a.id)));

  const connect = useCallback(async () => {
    const picked = DEMO_ACCOUNTS.filter((a) => selected.has(a.id));
    if (!picked.length) return;
    setSaving(true);
    setNotice(null);
    // In demo mode the "recognized" accounts are imported as manual accounts, so
    // they persist and fold into net worth exactly like a real connection would.
    const results = await Promise.all(
      picked.map((a) =>
        saveManualAccount({
          name: a.name,
          institution: a.institution,
          category: a.category,
          kind: a.kind,
          balance: a.balance,
        }),
      ),
    );
    const ok = results.filter(Boolean).length;
    setSaving(false);
    if (ok > 0) {
      setImportedCount(ok);
      trackEngagement("connection_linked");
      // Report the imported institutions so the gallery below can check them off.
      onLinked([...new Set(picked.map((a) => a.institution))]);
      void syncFinances();
      setPhase("done");
    } else {
      setNotice("Couldn't import those accounts. Make sure the manual_accounts migration is applied, then retry.");
    }
  }, [selected, onLinked]);

  if (phase === "done") {
    return (
      <LayerShell demo>
        <div className="layer-done">
          <span className="layer-done-ic"><Check size={16} strokeWidth={3} /></span>
          Imported {importedCount} {importedCount === 1 ? "account" : "accounts"} to your dashboard.
        </div>
      </LayerShell>
    );
  }

  if (phase === "phone" || phase === "loading") {
    return (
      <LayerShell demo>
        <PhoneRow
          phone={phone}
          setPhone={setPhone}
          onGo={go}
          busy={phase === "loading"}
          label={phase === "loading" ? "Recognizing you…" : "Find my accounts"}
        />
      </LayerShell>
    );
  }

  // results
  const groups = MANUAL_CATEGORIES.map((c) => ({
    label: c.label,
    key: c.key,
    items: DEMO_ACCOUNTS.filter((a) => a.category === c.key),
  })).filter((g) => g.items.length > 0);

  return (
    <LayerShell
      demo
      sub="Tap the ones you want, we'll keep them in sync."
      body={
        <div className="layer-body">
          <div className="layer-results">
            {groups.map((g) => (
              <div className="layer-cat" key={g.key}>
                <div className="inst-cat-h">{catLabel(g.key)}</div>
                {g.items.map((a) => {
                  const on = selected.has(a.id);
                  return (
                    <button key={a.id} className={`layer-acct ${on ? "on" : ""}`} onClick={() => toggle(a.id)} aria-pressed={on}>
                      <span className={`inst-check ${on ? "on" : ""}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                      <span className="layer-acct-main">
                        <span className="layer-acct-name">{a.institution}</span>
                        <span className="layer-acct-sub">{a.name}</span>
                      </span>
                      <span className="layer-acct-bal" style={a.kind === "liability" ? { color: "var(--jnpr-bad)" } : undefined}>
                        {a.kind === "liability" ? "−" : ""}{money(a.balance)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {notice && <div className="form-error" style={{ marginTop: 8 }}>{notice}</div>}
          <div className="layer-results-bar">
            <button className="btn" onClick={connect} disabled={saving || selected.size === 0}>
              {saving ? "Connecting…" : `Connect ${selected.size} ${selected.size === 1 ? "account" : "accounts"}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="layer-results-head">
        <span>We found {DEMO_ACCOUNTS.length} accounts for {phone.trim() || "your number"}</span>
        <button className="inst-selall" onClick={toggleAll}>{allOn ? "Clear all" : "Select all"}</button>
      </div>
    </LayerShell>
  );
}

// ── shared presentation ──────────────────────────────────────────────────────
// The card leads the connect step as a pine "hero": a deep-pine band carries the
// branding + whatever the current phase puts in it (phone entry, results header,
// or the done confirmation), and `body` — when present — drops into a light panel
// below the band (the account results list).
function LayerShell({
  children,
  body,
  demo,
  sub,
}: {
  children: ReactNode;
  body?: ReactNode;
  demo?: boolean;
  sub?: ReactNode;
}) {
  return (
    <div className="layer-card hero">
      <div className="layer-band">
        <div className="layer-head">
          <span className="layer-ic"><Sparkles size={16} /></span>
          <div>
            <div className="layer-title">
              Find your accounts instantly
              {demo && <span className="layer-demo-badge">Demo</span>}
            </div>
            <div className="layer-sub">
              {sub ?? "Enter your phone number and we'll surface accounts you've already connected, ready to pick."}
            </div>
          </div>
        </div>
        {children}
      </div>
      {body}
    </div>
  );
}

function PhoneRow({
  phone,
  setPhone,
  onGo,
  busy,
  label,
}: {
  phone: string;
  setPhone: (v: string) => void;
  onGo: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <>
      <div className="layer-row">
        <div className="layer-phone">
          <Smartphone size={15} />
          <input
            inputMode="tel"
            value={phone}
            placeholder="(555) 123-4567"
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && onGo()}
            aria-label="Phone number"
          />
        </div>
        <button className="btn" onClick={onGo} disabled={busy}>
          {label}
        </button>
      </div>
      <div className="layer-trust">
        <Lock size={13} /> Secured by Plaid · we never see your login
      </div>
    </>
  );
}
