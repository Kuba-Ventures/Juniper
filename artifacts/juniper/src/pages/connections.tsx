import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, Trash2, ShieldCheck, RefreshCw, PencilLine } from "lucide-react";
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
  const [syncing, setSyncing] = useState(false);
  const [showManual, setShowManual] = useState(false);

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

  return (
    <div className="frame">
      <PageHeader
        title="Connections"
        sub="Link your banks, cards, and investment accounts through Plaid to keep your net worth, spending, and score up to date automatically. Add anything Plaid can't reach by hand."
        actions={
          items.length > 0 ? (
            <button className="btn ghost" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={15} /> {syncing ? "Refreshing…" : "Refresh data"}
            </button>
          ) : undefined
        }
      />

      <div className="conn-wrap">
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

            <div className="card" style={{ marginTop: hasItems ? 16 : 0 }}>
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>{hasItems ? "Add another account" : "Connect your accounts"}</h3>
              <p style={{ fontSize: 13, color: "var(--jnpr-ink-2)", margin: "0 0 16px", lineHeight: 1.55 }}>
                Search for your bank and tap it to connect. Plaid links one institution per session, so come back to
                the box and search again for the next one. Use <b>enter it by hand</b> for accounts Plaid can't link.
              </p>
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
                    await refresh();
                  }}
                  onCancel={() => setShowManual(false)}
                />
              ) : (
                // showConnected={false}: the linked-items list above already
                // names every connection, so the picker's own Connected section
                // would repeat it a few pixels lower.
                <InstitutionPicker
                  onConnect={handleConnect}
                  onManual={() => setShowManual(true)}
                  busy={connecting}
                  connected={connected}
                  showConnected={false}
                />
              )}
            </div>
          </>
        )}

        <p className="ob-secure" style={{ marginTop: 24 }}>
          <ShieldCheck />
          Juniper connects through Plaid with bank-grade encryption and read-only access. Your bank
          credentials are entered with Plaid and never touch Juniper's servers.
        </p>
      </div>
    </div>
  );
}
