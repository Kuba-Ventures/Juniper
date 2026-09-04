import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
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
  itemNeedsRelink,
  institutionNet,
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

/* The compact institution strip in the page header. This is where the app
   bar's old "N linked" pill moved to (see the comment left in app-frame.tsx):
   it counted accounts and told a member nothing they could act on from
   wherever they happened to be. Here the same figure sits beside the button
   that actually adds or fixes a connection, and it is said honestly rather
   than as one ambiguous number: institutions and accounts are different
   facts (linkedCount's own old comment warned against conflating them), so
   both are stated. One mark per TILE, not per account, is what keeps Marcus's
   six accounts from drawing its logo six times: `tiles` is already one entry
   per institution or manual account, never per account within it. */
function LinkedSummary({ tiles, brands }: { tiles: Tile[]; brands: InstitutionBrandMap }) {
  if (tiles.length === 0) return null;
  const accounts = tiles.reduce((sum, t) => sum + tileCount(t), 0);
  return (
    <div
      className="linked-summary"
      title={`${tiles.length} institution${tiles.length === 1 ? "" : "s"}, ${accounts} account${accounts === 1 ? "" : "s"}`}
    >
      <div className="linked-marks">
        {tiles.map((t) => (
          <span className="linked-mark" key={t.key}>
            <InstitutionMark
              name={t.name}
              brand={t.kind === "plaid" && t.item.institution_id ? brands[t.item.institution_id] : undefined}
              glyph={t.kind === "plaid" ? <Building2 size={11} /> : <PencilLine size={10} />}
            />
          </span>
        ))}
      </div>
      <div className="linked-counts">
        <b>{tiles.length} institution{tiles.length === 1 ? "" : "s"}</b>
        <span>{accounts} account{accounts === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
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

// "4 minutes ago", and so on. Rounded down at every step, because a connection
// refreshed 119 seconds ago is better described as a minute old than as two.
function agoLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// The line under an institution's name. A healthy connection says only when it
// last updated, which is the common case and should be quiet. Anything else is
// something the member may need to act on, so it is stated plainly and first.
function connectionStatus(item: PlaidItem): { text: string; tone: "ok" | "warn" | "bad" } | null {
  const ago = agoLabel(item.last_synced_at);
  if (itemNeedsRelink(item)) {
    return { text: ago ? `Needs reconnecting \u00b7 last updated ${ago}` : "Needs reconnecting", tone: "bad" };
  }
  if (item.balances_from_cache) {
    // Worth saying out loud: this bank is slow enough that a live balance check
    // times out, so the figure comes from Plaid's own copy. It is Plaid's
    // number and usually hours old at most, but it is not a live read.
    return { text: ago ? `Balance from Plaid's cache \u00b7 updated ${ago}` : "Balance from Plaid's cache", tone: "warn" };
  }
  if (!ago) return null;
  return { text: `Updated ${ago}`, tone: "ok" };
}

/* One entry in the gallery: a Plaid connection or a hand-entered account.
   #265 chose the gallery over the flat list this page used to be, where every row
   looked like every other row and two institutions carrying six accounts each ran
   the page past the fold. Both kinds draw the same tile, so the page reads as a
   set of institutions rather than as two stacked lists of different shapes, and
   the detail surface below switches on `kind` only for the parts that genuinely
   differ: Reconnect goes to Plaid, Edit goes to the member's own figures. */
type Tile =
  | { key: string; kind: "plaid"; name: string; item: PlaidItem }
  | { key: string; kind: "manual"; name: string; manual: ManualAccount };

// A minus sign (U+2212) rather than a hyphen, and applied outside the currency
// format, so a negative figure lines up with the one on a manual liability row.
function signedMoney(n: number, currency: string): string {
  return `${n < 0 ? "−" : ""}${money(Math.abs(n), currency)}`;
}

/* The figure a tile states. A connection is summed by institutionNet, which signs
   it the way net worth is signed; a hand-entered account is one balance the member
   typed, and its own `kind` says which way it points. Null either way when there is
   nothing to state, so the tile renders no figure instead of "$0". */
function tileFigure(t: Tile): { total: number; currency: string } | null {
  if (t.kind === "plaid") return institutionNet(t.item);
  if (t.manual.balance == null) return null;
  return {
    total: t.manual.kind === "liability" ? -t.manual.balance : t.manual.balance,
    currency: t.manual.currency || "USD",
  };
}

const tileCount = (t: Tile) => (t.kind === "plaid" ? t.item.accounts.length : 1);

export function ConnectionsView() {
  const [, navigate] = useLocation();
  const search = useSearch();
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
  // The manual account currently being edited, or null for "adding a new one".
  // Held as the ACCOUNT rather than its id, so the form seeds from a value that
  // cannot go stale mid-edit: a refresh landing underneath would otherwise swap
  // the fields out from under the member's cursor.
  const [editingManual, setEditingManual] = useState<ManualAccount | null>(null);
  // Whether the add-an-account panel is open. The search used to sit in a card
  // below every linked institution, which put it past the fold for anyone with
  // more than three connections and gave it the same visual weight as the rows
  // it followed, so the one action this page exists for read as a footer. It is
  // now behind "Add account" in the page header, where every other page action
  // on this app lives.
  const [addOpen, setAddOpen] = useState(false);
  // Which tile's accounts are open, or null for "whichever is first". Held as the
  // key rather than the index, since a removal reorders the grid, and resolved
  // below by lookup rather than kept in sync by an effect: disconnecting the open
  // institution falls back to the first remaining one on its own.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

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

  // Deep link from the household page's "Add an account to share" row:
  // `?add=1` opens this page's own add-account panel, the same one the header
  // button opens, rather than building a second add flow over there. Replaced
  // out of the URL so a reload does not reopen it.
  useEffect(() => {
    if (new URLSearchParams(search).get("add") !== "1") return;
    setAddOpen(true);
    navigate("/app/connections", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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

  // Plaid connections first, then the hand-entered accounts, which is the order
  // the page has always listed them in. Keys are prefixed because an item_id and a
  // manual account id come from different tables and must never collide.
  const tiles = useMemo<Tile[]>(
    () => [
      ...items.map((item) => ({
        key: `p:${item.item_id}`,
        kind: "plaid" as const,
        name: item.institution_name || "Linked institution",
        item,
      })),
      ...manualAccts.map((m) => ({
        key: `m:${m.id}`,
        kind: "manual" as const,
        name: m.institution || m.name,
        manual: m,
      })),
    ],
    [items, manualAccts],
  );

  // Falling back to the first tile is what keeps the detail surface from ever
  // being empty while the member has connections, on first load and after a
  // removal alike.
  const selected = useMemo(
    () => tiles.find((t) => t.key === openKey) ?? tiles[0] ?? null,
    [tiles, openKey],
  );

  const openTile = useCallback((key: string) => {
    setOpenKey(key);
    // The accounts open on a second surface below a grid that is three rows tall
    // on a phone, so the thing the member just asked for can land off-screen.
    // Nudged into view only when it actually is off-screen: scrolling a pane that
    // is already visible moves the page for no reason.
    requestAnimationFrame(() => {
      const el = detailRef.current;
      if (!el) return;
      if (el.getBoundingClientRect().bottom <= window.innerHeight) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
    });
  }, []);

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
          // Keyed on the account, so switching from adding to editing (or between
          // two accounts) REMOUNTS the form. Its fields seed from initial state,
          // which a re-render would not revisit, and a stale field on a form that
          // writes a credit limit is the wrong thing to be clever about.
          key={editingManual?.id ?? "new"}
          account={editingManual ?? undefined}
          onSaved={async () => {
            setShowManual(false);
            setEditingManual(null);
            setAddOpen(false);
            await refresh();
          }}
          // Cancelling an EDIT closes the whole panel, cancelling an ADD only
          // steps back to the picker. The two arrive from different places and
          // have different backs: somebody adding an account came through "Add an
          // account" and the search is where they were, but somebody editing came
          // from a row on the page behind, and dropping them into a bank search
          // they never asked for is a non-sequitur. Found by clicking it, not by
          // reading it.
          onCancel={() => {
            setShowManual(false);
            if (editingManual) setAddOpen(false);
            setEditingManual(null);
          }}
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
        actionsClassName="conn-actions"
        actions={
          <>
            <LinkedSummary tiles={tiles} brands={brands} />
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
            {/* The gallery. A tile per institution states its mark, how many
                accounts it holds and what they come to, which is what a page whose
                subject is brands should read as at a glance. Everything the list
                said before is still said: the freshness line, the reconnect prompt
                and the cached-balance note sit on the tile that owns them, and the
                accounts themselves are one tap away rather than all on screen at
                once. */}
            <div className="conn-grid">
              {tiles.map((t) => {
                const st = t.kind === "plaid" ? connectionStatus(t.item) : null;
                const fig = tileFigure(t);
                return (
                  <button
                    type="button"
                    className="conn-tile"
                    key={t.key}
                    // aria-pressed rather than aria-selected: these are toggles in a
                    // plain grid, not a tablist, and calling them tabs would promise
                    // arrow-key navigation this does not implement.
                    aria-pressed={selected?.key === t.key}
                    aria-controls="conn-detail"
                    onClick={() => openTile(t.key)}
                  >
                    <InstitutionMark
                      name={t.name}
                      brand={
                        t.kind === "plaid" && t.item.institution_id
                          ? brands[t.item.institution_id]
                          : undefined
                      }
                      glyph={t.kind === "plaid" ? <Building2 size={19} /> : <PencilLine size={17} />}
                    />
                    <span className="ct-body">
                      <span className="ct-name">
                        {t.name}
                        {t.kind === "manual" && <span className="conn-tag">Manual</span>}
                      </span>
                      <span className="ct-count">
                        {tileCount(t)} account{tileCount(t) === 1 ? "" : "s"}
                      </span>
                      {st && <span className={`ci-status ${st.tone}`}>{st.text}</span>}
                    </span>
                    {fig && (
                      // `zero` is what lets the stylesheet quieten a figure that
                      // came to nothing (#270): a card owing nothing, or a balance
                      // the member typed as zero. It cannot be a CSS rule on its
                      // own, since CSS cannot see the value, and the class has to
                      // be the ONLY thing that changes: a grey "$0" still means
                      // counted and zero, while no figure at all still means there
                      // was nothing institutionNet could state. Those two must not
                      // come to look alike.
                      <span
                        className={`ct-bal tnum${fig.total < 0 ? " neg" : ""}${
                          fig.total === 0 ? " zero" : ""
                        }`}
                      >
                        {signedMoney(fig.total, fig.currency)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* The accounts inside the open institution, plus the actions that act
                on it. Sits after the grid in the DOM as well as on the page, so it
                is the next thing in the tab order after the tile that opened it. */}
            {selected && (
              <div className="conn-item conn-detail" id="conn-detail" ref={detailRef}>
                {selected.kind === "plaid" ? (
                  <>
                    <div className="conn-inst">
                      <InstitutionMark
                        name={selected.name}
                        brand={
                          selected.item.institution_id
                            ? brands[selected.item.institution_id]
                            : undefined
                        }
                        glyph={<Building2 size={19} />}
                      />
                      <span className="ci-name">
                        {selected.name}
                        {(() => {
                          const st = connectionStatus(selected.item);
                          return st ? <span className={`ci-status ${st.tone}`}>{st.text}</span> : null;
                        })()}
                      </span>
                      {itemNeedsRelink(selected.item) && (
                        // Repairs this item rather than adding a second one for the
                        // same bank: passing item_id puts Plaid Link into update
                        // mode against the existing access_token.
                        <button
                          className="btn sm"
                          onClick={() => void start([{
                            institution_id: selected.item.institution_id ?? undefined,
                            name: selected.item.institution_name ?? undefined,
                            item_id: selected.item.item_id,
                          }])}
                          disabled={connecting}
                          aria-label={`Reconnect ${selected.name}`}
                        >
                          <RefreshCw size={13} /> {connecting ? "Opening…" : "Reconnect"}
                        </button>
                      )}
                      <button
                        className="btn ghost sm"
                        onClick={() => handleRemove(selected.item.item_id)}
                        disabled={removingId === selected.item.item_id}
                        aria-label={`Disconnect ${selected.name}`}
                      >
                        <Trash2 size={13} />{" "}
                        {removingId === selected.item.item_id ? "Removing…" : "Remove"}
                      </button>
                    </div>
                    {selected.item.accounts.map((a) => (
                      <div className="conn-acct" key={a.account_id}>
                        <span className="ca-name">{accountLine(a)}</span>
                        {a.balance != null && (
                          <span className="ca-bal tnum">{money(a.balance, a.currency)}</span>
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="conn-inst">
                      {/* No Plaid id on a hand-added account, so this only ever
                          reaches the local brand map or the pencil glyph. The
                          "Manual" tag beside it still carries that meaning when a
                          logo resolves. */}
                      <InstitutionMark name={selected.name} glyph={<PencilLine size={17} />} />
                      <span className="ci-name">
                        {selected.name} <span className="conn-tag">Manual</span>
                      </span>
                      {/* A plain text button rather than a second filled one. Edit
                          is the safe action and Remove is the destructive one, so
                          they must not look alike. */}
                      <button
                        className="man-edit"
                        onClick={() => {
                          setEditingManual(selected.manual);
                          setShowManual(true);
                          setAddOpen(true);
                        }}
                        aria-label={`Edit ${selected.manual.name}`}
                      >
                        Edit
                      </button>
                      <button
                        className="btn ghost sm"
                        onClick={() => handleRemoveManual(selected.manual.id)}
                        disabled={removingManualId === selected.manual.id}
                        aria-label="Remove manual account"
                      >
                        <Trash2 size={13} />{" "}
                        {removingManualId === selected.manual.id ? "Removing…" : "Remove"}
                      </button>
                    </div>
                    <div className="conn-acct">
                      <span className="ca-name">
                        {selected.manual.name} · {catLabel(selected.manual.category)}
                      </span>
                      {selected.manual.balance != null && (
                        <span
                          className="ca-bal tnum"
                          style={
                            selected.manual.kind === "liability"
                              ? { color: "var(--jnpr-bad)" }
                              : undefined
                          }
                        >
                          {selected.manual.kind === "liability" ? "−" : ""}
                          {money(selected.manual.balance, selected.manual.currency)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

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
        <ModalBackdrop
          wide
          onClose={() => { setAddOpen(false); setShowManual(false); setEditingManual(null); }}
        >
          <div className="conn-add-head">
            {/* The row being edited sits behind the backdrop, so the heading is
                the only thing that can say WHICH account this is. Naming it is
                what stops somebody typing the Chase limit into the Discover
                account, which is the same reason #211's limit editor sits on the
                row it describes. */}
            <h3>
              {editingManual
                ? `Edit ${editingManual.name}`
                : showManual ? "Enter an account by hand" : "Add an account"}
            </h3>
            {/* Clears the edit target too. Without it the next tap on "Add an
                account" would open prefilled with the account last edited, and
                saving would silently overwrite it instead of adding anything. */}
            <button
              className="conn-add-x"
              onClick={() => { setAddOpen(false); setShowManual(false); setEditingManual(null); }}
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>
          <p>
            {editingManual
              ? "Your own figures, so they stay exactly as you type them until you change them again. Juniper never overwrites them."
              : showManual
                ? "For accounts Plaid can't reach. The balance is yours to maintain: it stays exactly as you type it until you edit it again."
                : "Search for your bank and tap it to connect. Plaid links one institution per session, so reopen this for the next one."}
          </p>
          {addFlow}
        </ModalBackdrop>
      )}
    </div>
  );
}
