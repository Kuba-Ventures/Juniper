import { useCallback, useEffect, useState } from "react";
import {
  usePlaidLink,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";
import { Building2, Plus, Trash2, ShieldCheck } from "lucide-react";
import {
  createLinkToken,
  exchangePublicToken,
  fetchPlaidItems,
  removePlaidItem,
  type PlaidItem,
} from "@/lib/plaid";
import { trackEngagement } from "@/lib/analytics";

const sage = "#5C7A65";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const sageFill = "rgba(92,122,101,0.08)";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

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

  const refresh = useCallback(async () => {
    const next = await fetchPlaidItems();
    setItems(next);
  }, []);

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
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "52px 28px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <img
            src="/logo.png"
            alt="Juniper"
            style={{ width: 56, height: 56, objectFit: "contain", margin: "0 auto 20px", display: "block" }}
          />
          <h1
            style={{
              fontFamily: serif,
              fontSize: "clamp(26px, 4vw, 36px)",
              fontWeight: 400,
              color: ink,
              margin: "0 0 10px",
              letterSpacing: "-0.02em",
            }}
          >
            Connect your accounts.
          </h1>
          <p style={{ fontSize: 15, color: muted, margin: "0 auto", lineHeight: 1.65, maxWidth: 440 }}>
            Linking your accounts gives Juniper a real-time picture of your finances, so the guidance
            you get is grounded in what's actually happening.
          </p>
        </div>

        {notice && (
          <div
            style={{
              background: "rgba(185,64,64,0.06)",
              border: "1px solid rgba(185,64,64,0.2)",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 13.5,
              color: "#b94040",
              margin: "0 0 20px",
              lineHeight: 1.5,
            }}
          >
            {notice}
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={connecting}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "14px 20px",
            background: sage,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontFamily: sans,
            fontSize: 15,
            fontWeight: 600,
            cursor: connecting ? "default" : "pointer",
            opacity: connecting ? 0.6 : 1,
            marginBottom: hasItems || loading ? 28 : 20,
          }}
        >
          <Plus size={18} strokeWidth={2.4} />
          {connecting ? "Opening secure link…" : hasItems ? "Connect another account" : "Connect an account"}
        </button>

        {loading ? (
          <p style={{ textAlign: "center", color: muted, fontFamily: sans, fontSize: 14 }}>Loading…</p>
        ) : hasItems ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {items.map((item) => (
              <div
                key={item.item_id}
                style={{ background: "#fff", border: `1px solid ${border}`, borderRadius: 14, padding: "18px 20px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: item.accounts.length ? 12 : 0 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: sageFill,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Building2 size={20} color={sage} strokeWidth={1.8} />
                  </div>
                  <span style={{ fontFamily: serif, fontSize: 17, color: ink, fontWeight: 400, flex: 1, minWidth: 0 }}>
                    {item.institution_name || "Linked institution"}
                  </span>
                  <button
                    onClick={() => handleRemove(item.item_id)}
                    disabled={removingId === item.item_id}
                    aria-label="Disconnect institution"
                    title="Disconnect"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: "transparent",
                      border: `1px solid ${border}`,
                      borderRadius: 8,
                      padding: "6px 10px",
                      fontFamily: sans,
                      fontSize: 12.5,
                      color: muted,
                      cursor: removingId === item.item_id ? "default" : "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={13} /> {removingId === item.item_id ? "Removing…" : "Remove"}
                  </button>
                </div>

                {item.accounts.length > 0 && (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {item.accounts.map((a) => (
                      <li
                        key={a.account_id}
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          justifyContent: "space-between",
                          gap: 12,
                          paddingTop: 8,
                          borderTop: `1px solid ${border}`,
                        }}
                      >
                        <span style={{ fontFamily: sans, fontSize: 13.5, color: ink, minWidth: 0 }}>
                          {accountLine(a)}
                        </span>
                        {a.balance != null && (
                          <span style={{ fontFamily: sans, fontSize: 13.5, color: muted, fontWeight: 600, flexShrink: 0 }}>
                            {money(a.balance, a.currency)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              textAlign: "center",
              background: sageFill,
              border: `1px dashed ${border}`,
              borderRadius: 14,
              padding: "28px 24px",
              color: muted,
              fontFamily: sans,
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            No accounts connected yet. Link a checking, savings, credit, or investment account to get
            started.
          </div>
        )}

        <p
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 13,
            color: muted,
            marginTop: 36,
            lineHeight: 1.6,
          }}
        >
          <ShieldCheck size={16} color={sage} style={{ flexShrink: 0, marginTop: 2 }} />
          Juniper connects through Plaid with bank-grade encryption and read-only access. Your bank
          credentials are entered with Plaid and never touch Juniper's servers.
        </p>
      </div>
    </div>
  );
}
