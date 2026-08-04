import { useCallback, useEffect, useState } from "react";
import {
  usePlaidLink,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";
import { Building2, Trash2, ShieldCheck, RefreshCw } from "lucide-react";
import { InstitutionPicker } from "@/components/juniper/institution-picker";
import {
  createLinkToken,
  exchangePublicToken,
  fetchPlaidItems,
  removePlaidItem,
  syncFinances,
  type PlaidItem,
} from "@/lib/plaid";
import { PageHeader } from "@/components/juniper/app-frame";
import { trackEngagement } from "@/lib/analytics";

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

export function ConnectionsView() {
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const next = await fetchPlaidItems();
    setItems(next);
  }, []);

  // Pull fresh transactions + net worth from the server, then re-read accounts
  // (the snapshot leg refreshes the stored balances too). Manual "Refresh".
  const handleSync = useCallback(async () => {
    setNotice(null);
    setSyncing(true);
    await syncFinances();
    await refresh();
    setSyncing(false);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    fetchPlaidItems().then((next) => {
      if (!cancelled) {
        setItems(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      const institution = metadata.institution
        ? { institution_id: metadata.institution.institution_id, name: metadata.institution.name }
        : undefined;
      const item = await exchangePublicToken(publicToken, institution);
      setLinkToken(null);
      setConnecting(false);
      if (item) {
        trackEngagement("connection_linked");
        await refresh();
        // Populate the data spine for the freshly linked item — transactions +
        // the first net-worth snapshot — so the dashboard flips to live data.
        void syncFinances();
      } else {
        setNotice("We couldn't finish connecting that account. Please try again.");
      }
    },
    [refresh],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess,
    onExit: () => {
      setLinkToken(null);
      setConnecting(false);
    },
  });

  // Open Link as soon as we have a token and the widget is ready.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const handleConnect = useCallback(async () => {
    setNotice(null);
    setConnecting(true);
    const token = await createLinkToken();
    if (token) {
      setLinkToken(token);
    } else {
      setConnecting(false);
      setNotice("Account linking isn't enabled yet. Add Plaid credentials to turn it on.");
    }
  }, []);

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

  const hasItems = items.length > 0;

  return (
    <div className="frame">
      <PageHeader
        title="Connections"
        sub="Link your banks, cards, and investment accounts through Plaid to keep your net worth, spending, and score up to date automatically."
        actions={
          hasItems ? (
            <button className="btn ghost" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={15} /> {syncing ? "Refreshing…" : "Refresh data"}
            </button>
          ) : undefined
        }
      />

      <div className="conn-wrap">
        {notice && <div className="form-error" style={{ marginBottom: 16 }}>{notice}</div>}
        {connecting && (
          <div className="ob-connected" style={{ color: "var(--jnpr-accent)", background: "var(--jnpr-accent-soft)" }}>
            <Building2 size={16} /> Opening secure link…
          </div>
        )}

        {loading ? (
          <div className="card" style={{ textAlign: "center", color: "var(--jnpr-ink-3)", padding: 32 }}>Loading…</div>
        ) : (
          <>
            {items.map((item) => (
              <div className="conn-item" key={item.item_id}>
                <div className="conn-inst">
                  <span className="ci-mark"><Building2 size={19} /></span>
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

            <div className="card" style={{ marginTop: hasItems ? 16 : 0 }}>
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>{hasItems ? "Add another account" : "Connect your accounts"}</h3>
              <p style={{ fontSize: 13, color: "var(--jnpr-ink-2)", margin: "0 0 16px", lineHeight: 1.55 }}>
                Pick your bank, card, or investment provider — or tap <b>Other</b> in any group to search every
                institution, including small and regional banks.
              </p>
              <InstitutionPicker onPick={handleConnect} busy={connecting} />
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
