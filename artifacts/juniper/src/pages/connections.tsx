import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, Trash2, ShieldCheck, RefreshCw, PencilLine, Plus, X } from "lucide-react";
import { InstitutionPicker } from "@/components/juniper/institution-picker";
import { resolveInstitutionMark } from "@/lib/institution-brand";
import { ManualAccountForm } from "@/components/juniper/manual-account-form";
import { LayerDiscovery } from "@/components/juniper/layer-discovery";
import {
  fetchPlaidItems,
  fetchInstitutionLogos,
  removePlaidItem,
  syncFinances,
  syncFinancesUntilTransactions,
  layerEnabled,
  normInstitutionName,
  type InstitutionBrand,
  type InstitutionBrandMap,
  type PlaidItem,
} from "@/lib/plaid";
import { useLinkQueue } from "@/lib/use-link-queue";
import {
  fetchManualAccounts,
  removeManualAccount,
  MANUAL_CATEGORIES,
  type ManualAccount,
} from "@/lib/manual-accounts";
import { PageHeader } from "@/components/juniper/app-frame";
import { useFinances } from "@/lib/finances";
import { timeAgo } from "@/lib/auto-sync";
import { ModalBackdrop } from "@/components/juniper/modal-portal";

function money(n: number | null, currency: string | null): string {
  if (n == null) return "";
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n).toLocaleString("en-US")}`;
  }
}

function accountLine(a: PlaidItem["accounts"][number]): string {
  const kind = [a.subtype, a.type].find(Boolean);
  const parts = [a.name];
  if (a.mask) parts.push(`····${a.mask}`);
  if (kind) parts.push(String(kind).replace(/_/g, " "));
  return parts.join(" · ");
}

const catLabel = (key: string) => MANUAL_CATEGORIES.find((c) => c.key === key)?.label ?? key;

// One connection's mark. The fallback chain itself lives in lib/institution-brand
// so the next surface that shows an institution reuses it instead of rewriting it;
// this component is only the Connections list's markup for the three outcomes.
// Before this, every row rendered the same building glyph and a page of real banks
// read as one undifferentiated list.
function InstitutionMark({
  name,
  brand,
  glyph,
}: {
  name: string;
  brand?: InstitutionBrand;
  glyph: ReactNode;
}) {
  const mark = resolveInstitutionMark(name, brand);
  if (mark.kind === "logo") return <img className="ci-logo" src={mark.src} alt="" />;
  if (mark.kind === "monogram") {
    return (
      <span className="ci-mono" style={{ background: mark.background, color: mark.color }}>
        {mark.letter}
      </span>
    );
  }
  return <span className="ci-mark">{glyph}</span>;
}

/* The freshness line that replaced the Refresh button for everyone who is not
   on a dev build. It states, it does not offer: there is nothing to press,
   because the app is already doing the thing the button used to do. Compact by
   design ("2h ago", not "2 hours ago"), since it sits in a header beside a
   primary action and is read at a glance. */
function Freshness({ syncedAt, busy }: { syncedAt: string | null; busy: boolean }) {
  const ago = timeAgo(syncedAt);
  if (busy) return <span className="fresh busy"><span className="dot" />Updating your accounts</span>;
  // No timestamp yet means the first background sync has not landed. Saying
  // nothing beats "Updated never".
  if (!ago) return null;
  return <span className="fresh"><span className="dot" />Updated {ago}</span>;
}

export function ConnectionsView() {
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [manualAccts, setManualAccts] = useState<ManualAccount[]>([]);
  // institution_id -> Plaid brand metadata, for the marks below. Held per page
  // rather than per row because the payload is a base64 PNG per institution.
  const [brands, setBrands] = useState<InstitutionBrandMap>({});
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removingManualId, setRemovingManualId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Freshness and breakage come from /api/finances, which every app load already
  // fetches, so this page asks Plaid nothing to answer either question.
  const { sync, syncing: autoSyncing, refresh: refreshFinances } = useFinances();
  // The manual control is for a dev build or an admin only. A member is not
  // meant to think about refreshing: the app does it (see lib/auto-sync.ts), and
  // the one failure a button appeared to address, a connection whose login has
  // expired, is not something a refresh can fix. That case gets its own prompt
  // below, pointing at the action that does work.
  const canForce = import.meta.env.DEV || !!sync?.isDeveloper;
  const [syncing, setSyncing] = useState(false);
  const [showManual, setShowManual] = useState(false);
  // Whether the add-an-account panel is open. The search used to sit in a card
  // below every linked institution, which put it past the fold for anyone with
  // more than three connections and gave it the same visual weight as the rows
  // it followed, so the one action this page exists for read as a footer. It is
  // now behind "Add account" in the page header, where every other page action
  // on this app lives.
  const [addOpen, setAddOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [next, manual] = await Promise.all([fetchPlaidItems(), fetchManualAccounts()]);
    setItems(next);
    setManualAccts(manual);
    // Brand marks are decoration, so they load off the critical path: the rows
    // appear (on the local map or the monogram) the moment the items land, and
    // the real logos swap in behind them. Awaiting this would put a Plaid call
    // per institution in front of the page's own loading state. Fired once per
    // refresh (first load, a link, a removal), never per render.
    //
    // Merged rather than replaced because fetchInstitutionLogos returns {} on
    // failure: a flaky refresh should leave the logos we already have alone
    // rather than dropping the whole page back to monograms. Entries for a
    // disconnected institution are simply never read again.
    void fetchInstitutionLogos(next.map((i) => i.institution_id)).then((map) => {
      setBrands((prev) => ({ ...prev, ...map }));
    });
  }, []);

  const {
    start,
    busy: connecting,
    progress,
    notice: queueNotice,
    setNotice: setQueueNotice,
  } = useLinkQueue({
    onItemLinked: refresh,
    onDone: ({ linked }) => {
      // Plaid links one institution per session, so the panel has served its
      // purpose the moment the queue drains: closing it puts the member back on
      // their list, where the bank they just linked now appears. Someone adding
      // a second bank reopens it from the header.
      if (linked > 0) setAddOpen(false);
      // Plaid is rarely ready to hand over transactions this soon after a link,
      // so this keeps retrying in the background (bounded, backed off) until
      // they land, instead of firing once and leaving the feed empty.
      if (linked > 0) void syncFinancesUntilTransactions();
    },
  });

  // Pull fresh transactions + net worth from the server, then re-read accounts
  // (the snapshot leg refreshes the stored balances too). Manual "Refresh".
  const handleSync = useCallback(async () => {
    setNotice(null);
    setSyncing(true);
    const result = await syncFinances();
    await refresh();
    // Pull the sync state forward too, so the freshness line beside the button
    // reflects the run that just finished rather than the one before it.
    void refreshFinances();
    setSyncing(false);
    // A refresh that reached Plaid for some connections and not others used to
    // be indistinguishable from a clean one: the endpoints aborted on the first
    // bad item and the response body went unread, so the button appeared to do
    // nothing. A dead token (an item linked under a different Plaid environment,
    // or a login that has expired) can only be fixed by connecting it again.
    if (result.needsRelink.length === 1) {
      setNotice("One connection needs reconnecting. Disconnect it below, then connect it again to refresh its balances.");
    } else if (result.needsRelink.length > 1) {
      setNotice(`${result.needsRelink.length} connections need reconnecting. Disconnect them below, then connect them again to refresh their balances.`);
    }
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    refresh().then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleConnect = useCallback(
    (institutions: Parameters<typeof start>[0]) => {
      setNotice(null);
      setQueueNotice(null);
      void start(institutions);
    },
    [start, setQueueNotice],
  );

  const handleRemove = useCallback(
    async (itemId: string) => {
      setRemovingId(itemId);
      const ok = await removePlaidItem(itemId);
      setRemovingId(null);
      if (ok) await refresh();
      else setNotice("Couldn't disconnect that account. Please try again.");
    },
    [refresh],
  );

  const handleRemoveManual = useCallback(
    async (id: string) => {
      setRemovingManualId(id);
      const ok = await removeManualAccount(id);
      setRemovingManualId(null);
      if (ok) await refresh();
      else setNotice("Couldn't remove that account. Please try again.");
    },
    [refresh],
  );

  const hasItems = items.length > 0 || manualAccts.length > 0;
  const shownNotice = notice || queueNotice;

  // Institutions already on file (linked via Plaid or added by hand), so the
  // picker below can drop them out of its Plaid search results: a returning
  // member shouldn't be invited to re-link a bank they already have. Refreshes
  // with `items`/`manualAccts` as connections are added or removed.
  const connected = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) if (it.institution_name) map.set(normInstitutionName(it.institution_name), it.institution_name);
    for (const m of manualAccts) if (m.institution) map.set(normInstitutionName(m.institution), m.institution);
    return map;
  }, [items, manualAccts]);

  // One connect flow, rendered in two places: inline on first run, and inside
  // the header's panel once the member has connections. Declared here rather
  // than duplicated so the two can never drift, which is the same reason the
  // picker itself replaced the old hardcoded gallery.
  const addFlow = (
    <>
      {layerEnabled() && !showManual && (
        <LayerDiscovery
          onLinked={() => {
            void refresh();
          }}
        />
      )}
      {showManual ? (
        <ManualAccountForm
          onSaved={async () => {
            setShowManual(false);
            setAddOpen(false);
            await refresh();
          }}
          onCancel={() => setShowManual(false)}
        />
      ) : (
        // showConnected={false}: the page's own linked-items list names every
        // connection already, and in the panel it sits directly behind it, so
        // the picker's Connected section would say the same thing twice.
        <InstitutionPicker
          onConnect={handleConnect}
          onManual={() => setShowManual(true)}
          busy={connecting}
          connected={connected}
          showConnected={false}
        />
      )}
    </>
  );

  return (
    <div className="frame">
      <PageHeader
        title="Connections"
        sub="Link your banks, cards, and investment accounts through Plaid to keep your net worth, spending, and score up to date automatically. Add anything Plaid can't reach by hand."
        actions={
          <>
            {items.length > 0 && <Freshness syncedAt={sync?.syncedAt ?? null} busy={syncing || autoSyncing} />}
            {canForce && items.length > 0 && (
              <button className="btn ghost" onClick={handleSync} disabled={syncing}>
                <RefreshCw size={15} /> {syncing ? "Refreshing…" : "Refresh data"}
                <span className="dev-badge">dev</span>
              </button>
            )}
            {/* The page's primary action, and the only one that is offered
                whether or not anything is linked yet. */}
            <button
              className="btn"
              onClick={() => {
                setShowManual(false);
                setAddOpen(true);
              }}
              disabled={connecting}
            >
              <Plus size={15} /> Add account
            </button>
          </>
        }
      />

      <div className="conn-wrap">
        {/* The only thing on this page a member has to act on. A dead Plaid
           token cannot be fixed by refreshing, which is exactly why pressing
           Refresh repeatedly was the old behaviour. Named per connection, with
           the date its balances stopped, so it is clear what is stale and what
           is not. */}
        {(sync?.needsRelink?.length ?? 0) > 0 && (
          <div className="relink-note" style={{ marginBottom: 16 }}>
            <div className="rt">
              <div className="rn">
                {sync!.needsRelink.length === 1
                  ? `${sync!.needsRelink[0].institution} needs reconnecting`
                  : `${sync!.needsRelink.length} connections need reconnecting`}
              </div>
              <div className="rs">
                {sync!.needsRelink.length === 1 && sync!.needsRelink[0].since
                  ? `Its login expired, so its balances stopped updating on ${new Date(sync!.needsRelink[0].since!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Everything else is current.`
                  : "Their logins expired, so their balances stopped updating. Everything else is current."}
                {" "}Disconnect below, then connect again.
              </div>
            </div>
          </div>
        )}
        {shownNotice && <div className="form-error" style={{ marginBottom: 16 }}>{shownNotice}</div>}
        {connecting && (
          <div className="ob-connected" style={{ color: "var(--jnpr-accent)", background: "var(--jnpr-accent-soft)" }}>
            <Building2 size={16} />{" "}
            {progress.total > 1
              ? `Connecting account ${progress.index + 1} of ${progress.total}…`
              : "Opening secure link…"}
          </div>
        )}

        {loading ? (
          <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 32 }}>Loading…</div>
        ) : (
          <>
            {items.map((item) => (
              <div className="conn-item" key={item.item_id}>
                <div className="conn-inst">
                  <InstitutionMark
                    name={item.institution_name || "Linked institution"}
                    brand={item.institution_id ? brands[item.institution_id] : undefined}
                    glyph={<Building2 size={19} />}
                  />
                  <span className="ci-name">{item.institution_name || "Linked institution"}</span>
                  <button
                    className="btn ghost sm"
                    onClick={() => handleRemove(item.item_id)}
                    disabled={removingId === item.item_id}
                    aria-label="Disconnect institution"
                  >
                    <Trash2 size={13} /> {removingId === item.item_id ? "Removing…" : "Remove"}
                  </button>
                </div>
                {item.accounts.map((a) => (
                  <div className="conn-acct" key={a.account_id}>
                    <span className="ca-name">{accountLine(a)}</span>
                    {a.balance != null && <span className="ca-bal tnum">{money(a.balance, a.currency)}</span>}
                  </div>
                ))}
              </div>
            ))}

            {manualAccts.map((m) => (
              <div className="conn-item" key={m.id}>
                <div className="conn-inst">
                  {/* No Plaid id on a hand-added account, so this only ever
                      reaches the local brand map or the pencil glyph. The
                      "Manual" tag beside it still carries that meaning when a
                      logo resolves. */}
                  <InstitutionMark name={m.institution || m.name} glyph={<PencilLine size={17} />} />
                  <span className="ci-name">
                    {m.institution || m.name} <span className="conn-tag">Manual</span>
                  </span>
                  <button
                    className="btn ghost sm"
                    onClick={() => handleRemoveManual(m.id)}
                    disabled={removingManualId === m.id}
                    aria-label="Remove manual account"
                  >
                    <Trash2 size={13} /> {removingManualId === m.id ? "Removing…" : "Remove"}
                  </button>
                </div>
                <div className="conn-acct">
                  <span className="ca-name">{m.name} · {catLabel(m.category)}</span>
                  {m.balance != null && (
                    <span
                      className="ca-bal tnum"
                      style={m.kind === "liability" ? { color: "var(--jnpr-bad)" } : undefined}
                    >
                      {m.kind === "liability" ? "−" : ""}
                      {money(m.balance, m.currency)}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* First run only. With nothing linked there is no list to push
                the search below, and a member who has just arrived needs the
                affordance in front of them rather than behind a button, so the
                connect flow stays inline here. Once anything is on file this
                collapses and the same flow lives in the header's panel. */}
            {!hasItems && (
              <div className="card">
                <h3 style={{ fontSize: 15, marginBottom: 4 }}>Connect your accounts</h3>
                <p style={{ fontSize: 13, color: "var(--jnpr-ink-2)", margin: "0 0 16px", lineHeight: 1.55 }}>
                  Search for your bank and tap it to connect. Plaid links one institution per session, so come back to
                  the box and search again for the next one. Use <b>enter it by hand</b> for accounts Plaid can't link.
                </p>
                {addFlow}
              </div>
            )}
          </>
        )}

        <p className="ob-secure" style={{ marginTop: 24 }}>
          <ShieldCheck />
          Juniper connects through Plaid with bank-grade encryption and read-only access. Your bank
          credentials are entered with Plaid and never touch Juniper's servers.
        </p>
      </div>

      {addOpen && (
        <ModalBackdrop wide onClose={() => setAddOpen(false)}>
          <div className="conn-add-head">
            <h3>{showManual ? "Enter an account by hand" : "Add an account"}</h3>
            <button className="conn-add-x" onClick={() => setAddOpen(false)} aria-label="Close">
              <X size={15} />
            </button>
          </div>
          <p>
            {showManual
              ? "For accounts Plaid can't reach. The balance is yours to maintain: it stays exactly as you type it until you edit it again."
              : "Search for your bank and tap it to connect. Plaid links one institution per session, so reopen this for the next one."}
          </p>
          {addFlow}
        </ModalBackdrop>
      )}
    </div>
  );
}
