import { useCallback, useEffect, useState } from "react";
import { Smartphone, Sparkles } from "lucide-react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { createLayerSession, exchangePublicToken, syncFinances, type LinkInstitution } from "@/lib/plaid";
import { trackEngagement } from "@/lib/analytics";

// Account discovery, tier 1 (Plaid Layer): the phone-first "instant" path. The
// user enters their phone number, Plaid recognizes them as a returning
// network user and surfaces the accounts they've already connected elsewhere for
// one-tap selection, no per-institution login.
//
// GATED: the parent mounts this only when layerEnabled() (VITE_PLAID_LAYER=1),
// which should be flipped alongside Plaid Production + a Layer template. Until
// then the gallery (tier 2) is the entire connect experience. Because Layer's
// multi-item return + exchange semantics can only be exercised against Plaid
// Production, the exchange below reuses the standard public-token exchange and
// MUST be verified end-to-end when Layer is turned on.
export function LayerDiscovery({ onLinked }: { onLinked: () => void }) {
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
        onLinked();
        void syncFinances();
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
    <div className="layer-card">
      <div className="layer-head">
        <span className="layer-ic"><Sparkles size={16} /></span>
        <div>
          <div className="layer-title">Find your accounts instantly</div>
          <div className="layer-sub">Enter your phone number and we'll surface accounts you've already connected, ready to pick.</div>
        </div>
      </div>
      <div className="layer-row">
        <div className="layer-phone">
          <Smartphone size={15} />
          <input
            inputMode="tel"
            value={phone}
            placeholder="(555) 123-4567"
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            aria-label="Phone number"
          />
        </div>
        <button className="btn" onClick={go} disabled={busy}>
          {busy ? "Looking…" : "Find accounts"}
        </button>
      </div>
      {notice && <div className="form-error" style={{ marginTop: 8 }}>{notice}</div>}
    </div>
  );
}
