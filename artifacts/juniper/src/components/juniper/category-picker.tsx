// The category picker: choose a category for a transaction, and manage the
// list while you are in it.
//
// Its options come from the server (`taxonomy` on the transactions first page),
// not from a copy of the taxonomy here, because a second stored vocabulary in
// the client is exactly what api/_categorize.ts exists to prevent. With no
// taxonomy in hand the picker does not open at all, rather than opening onto a
// guessed list.
//
// Income and Transfers are offered alongside spending on purpose. "This was a
// credit card payment, not shopping" is one of the corrections most worth
// making: a card payment counted as spending bills the member twice for
// purchases that were already counted when they happened.
//
// WHY MANAGEMENT LIVES HERE RATHER THAN IN A SETTINGS SURFACE. The moment a
// member discovers a category is missing is the moment they are looking for it,
// which is this list, with a search box they have already typed into. So a
// search matching nothing offers to create what they typed, and each row can be
// renamed in place. It costs the picker its single-purpose simplicity, which is
// the trade knowingly made.
//
// WHAT IS DELIBERATELY NOT OFFERED. Deleting a built-in. api/_categorize.ts
// maps Plaid's categories onto built-in labels, so a deleted one does not stay
// deleted: the next sync writes that label again and the charge lands on a
// category nothing resolves, dropping it into "Everything else". HIDING is the
// honest version, and it is what this list offers instead: a hidden category
// leaves the picker and keeps resolving, so nothing already filed there moves.
// The count of hidden ones is stated at the foot of the list, because a hidden
// category nothing mentions is indistinguishable from a deleted one.
//
// WHY THIS PORTALS TO <body> AND POSITIONS ITSELF FIXED. The transactions table
// sits in `.tx-tablewrap`, which is `overflow-x: auto`. Per the overflow spec a
// `visible` value on the other axis computes to `auto` when one axis is not
// visible, so that wrapper clips vertically too: an absolutely positioned panel
// inside the cell was cut off at the table's bottom edge and turned the wrapper
// into a scroller. Measured, not assumed. A portal escapes the clip, and fixed
// coordinates taken from the anchor keep the panel on the row it belongs to.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createCategory, renameCategory, deleteCategory, setCategoryHidden, setCategoryEmoji } from "@/lib/categories";
import { EmojiPicker } from "@/components/juniper/emoji-picker";
import type { CategoryGroupOption } from "@/lib/transactions";

const GAP = 6;      // between the anchor and the panel
const MARGIN = 8;   // smallest gap the panel keeps from a viewport edge
const MAX_NAME = 40;

// Only renaming needs a form. Creating is one press on the group to put it in,
// with the name already typed into the search box, which is the whole reason
// management sits in the picker rather than in a settings surface.
type Editing = { kind: "rename"; id: string; label: string } | null;

function NameForm({ initial, emoji, cta, busy, error, canDelete, onSave, onDelete, onHide, onIcon, onCancel, taken }: {
  initial: string;
  emoji: string;
  cta: string;
  busy: boolean;
  error: string | null;
  canDelete: boolean;
  onSave: (name: string) => void;
  onDelete: () => void;
  onHide: () => void;
  onIcon: () => void;
  onCancel: () => void;
  taken: Set<string>;
}) {
  const [v, setV] = useState(initial);
  const name = v.trim();
  // Checked here as well as on the server, so the member is told before they
  // press rather than after. The server is still the authority: two tabs can
  // race, and only it holds the unique index.
  const dupe = !!name && name.toLowerCase() !== initial.trim().toLowerCase() && taken.has(name.toLowerCase());
  const valid = !!name && name.length <= MAX_NAME && !dupe;
  return (
    <form className="cp-form" onSubmit={(e) => { e.preventDefault(); if (valid && !busy) onSave(name); }}>
      {/* The icon is a button, not a field: it opens the grid, which is the
          only place the full list can be searched. */}
      <button type="button" className="cp-icon" onClick={onIcon} disabled={busy}
        aria-label="Change icon" title="Change icon">{emoji}</button>
      <input
        autoFocus value={v} maxLength={MAX_NAME} placeholder="Category name" disabled={busy}
        aria-label="Category name"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}
      />
      <button type="submit" className="btn sm" disabled={!valid || busy}>{busy ? "Saving…" : cta}</button>
      <button type="button" className="btn ghost sm" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" className="cp-del" onClick={onHide} disabled={busy}>Hide</button>
      {canDelete && (
        <button type="button" className="cp-del" onClick={onDelete} disabled={busy}>Delete</button>
      )}
      {dupe && <span className="cp-err">You already have a category called “{name}”.</span>}
      {error && <span className="cp-err">{error}</span>}
    </form>
  );
}

export function CategoryPicker({ anchor, taxonomy, value, busy, onPick, onClose, onTaxonomyChanged }: {
  /** The control the panel hangs off, used for its position. */
  anchor: HTMLElement;
  taxonomy: CategoryGroupOption[];
  value?: string;
  busy?: boolean;
  onPick: (category: string) => void;
  onClose: () => void;
  /** Called after a create, rename or delete lands, so the page can re-read the
      taxonomy it handed in. The picker holds no copy of its own. */
  onTaxonomyChanged: () => void | Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const a = anchor.getBoundingClientRect();
    const h = box.current?.offsetHeight ?? 300;
    const w = box.current?.offsetWidth ?? 264;
    const below = window.innerHeight - a.bottom - GAP - MARGIN;
    const above = a.top - GAP - MARGIN;
    // Flip up only when below genuinely cannot hold the panel AND above is
    // roomier, so the common case stays predictable: the panel drops down.
    const flip = below < h && above > below;
    setPos({
      top: flip ? Math.max(MARGIN, a.top - GAP - Math.min(h, above)) : a.bottom + GAP,
      left: Math.min(Math.max(MARGIN, a.left), window.innerWidth - w - MARGIN),
      maxHeight: Math.max(160, flip ? above : below),
    });
  }, [anchor]);

  useLayoutEffect(place, [place]);
  // Re-placed when a form opens or closes too: the panel's height changes, and a
  // flipped panel that keeps its old top would drift off the anchor.
  useLayoutEffect(place, [editing, showHidden, picking, place]);

  useEffect(() => {
    // `true` on scroll: the row sits inside a scrollable wrapper, and a scroll
    // event on an inner element does not bubble, so a capture listener is the
    // only one that hears it.
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [place]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      // The anchor is excluded deliberately. Without this, pressing the tag
      // again would close the panel here and then the button's own click would
      // toggle it straight back open, so the control would look dead.
      if (box.current?.contains(t) || anchor.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      // Escape closes an open form first, and the panel only once there is no
      // form: a member mid-rename means "cancel this", not "throw it all away".
      if (e.key !== "Escape") return;
      if (picking) { setPicking(null); return; }
      if (editing) { setEditing(null); setError(null); return; }
      onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose, editing, picking]);

  const needle = q.trim().toLowerCase();
  // A group name matching keeps all of its categories, so typing "fun" finds
  // the whole of Fun & travel rather than nothing.
  const groups = useMemo(
    () =>
      taxonomy
        .map((g) => ({
          ...g,
          cats: needle && !g.g.toLowerCase().includes(needle)
            ? g.cats.filter((c) => c.label.toLowerCase().includes(needle))
            : g.cats,
        }))
        .filter((g) => g.cats.length),
    [taxonomy, needle],
  );

  const takenNames = useMemo(
    () => new Set(taxonomy.flatMap((g) => [g.g.toLowerCase(), ...g.cats.map((c) => c.label.toLowerCase())])),
    [taxonomy],
  );

  // Offered only when nothing in the list is an exact match, so a member typing
  // "Groceries" is not invited to make a second one.
  const exact = useMemo(
    () => taxonomy.some((g) => g.cats.some((c) => c.label.toLowerCase() === needle)),
    [taxonomy, needle],
  );
  const offerCreate = !!needle && !exact && !editing;

  const run = async (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>) => {
    setSaving(true); setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.error); setSaving(false); return; }
    await onTaxonomyChanged();
    setSaving(false); setEditing(null); setQ("");
  };

  // EVERY group, not just the spending ones. A new category takes its group's
  // kind, and creating one inside Transfers & payments is the supported way to
  // get a category that is not spending (api/categories.ts refuses to move an
  // existing leaf across kinds, precisely so this is the visible route). The
  // kind is labelled on the row, so choosing it is a decision rather than a
  // surprise.
  const createTargets = taxonomy;
  // Flattened across groups: a member hides individual categories, and grouping
  // the handful they hid would be more chrome than the list it sits under.
  const hidden = useMemo(() => taxonomy.flatMap((g) => g.hidden ?? []), [taxonomy]);

  return createPortal(
    // `display: contents` so the wrapper carries the `.jnpr` token scope without
    // adding a box of its own, same trick as modal-portal.tsx.
    <div className="jnpr" style={{ display: "contents" }}>
      <div
        className="cp" ref={box} role="dialog" aria-label="Choose a category"
        style={pos ? { top: pos.top, left: pos.left, visibility: "visible" } : { visibility: "hidden" }}
      >
        <input
          className="cp-q" autoFocus placeholder="Search or add a category"
          value={q} onChange={(e) => { setQ(e.target.value); setError(null); }} disabled={busy || saving}
        />
        <div className="cp-list" style={pos ? { maxHeight: pos.maxHeight - 62 } : undefined}>
          {offerCreate && (
            <div className="cp-create">
              <div className="cp-create-h">Add “{q.trim()}” to</div>
              {createTargets.map((g) => (
                <button key={g.id} type="button" className="cp-i cp-create-i"
                  onClick={() => void run(() => createCategory(q.trim(), g.id))} disabled={saving}>
                  <span className="cat-em" aria-hidden>{g.emoji}</span>
                  <span className="cp-create-n">{g.g}</span>
                  {g.kind !== "spend" && <span className="cp-kind">{g.kind === "income" ? "income" : "not spending"}</span>}
                </button>
              ))}
              {error && <span className="cp-err">{error}</span>}
            </div>
          )}

          {groups.map((g) => (
            <div key={g.id}>
              <div className="cp-g">
                <span className="cat-em" aria-hidden>{g.emoji}</span>
                {g.g}
                {g.kind !== "spend" && <span className="cp-kind">{g.kind === "income" ? "income" : "not spending"}</span>}
              </div>
              {g.cats.map((c) => (
                editing?.kind === "rename" && editing.id === c.id ? (
                  picking === c.id ? (
                    <EmojiPicker
                      key={c.id} current={c.emoji}
                      onPick={(e) => { setPicking(null); void run(() => setCategoryEmoji(c.id, e)); }}
                      onReset={() => { setPicking(null); void run(() => setCategoryEmoji(c.id, null)); }}
                      onCancel={() => setPicking(null)}
                    />
                  ) : (
                  <NameForm
                    key={c.id} initial={c.label} emoji={c.emoji} cta="Save" busy={saving} error={error}
                    canDelete={c.custom} taken={takenNames}
                    onSave={(name) => void run(() => renameCategory(c.id, name))}
                    onDelete={() => void run(() => deleteCategory(c.id))}
                    onHide={() => void run(() => setCategoryHidden(c.id, true))}
                    onIcon={() => { setPicking(c.id); setError(null); }}
                    onCancel={() => { setEditing(null); setError(null); }}
                  />
                  )
                ) : (
                  <div className="cp-row" key={c.id}>
                    <button
                      type="button" disabled={busy || saving}
                      className={`cp-i${c.label === value ? " on" : ""}`}
                      onClick={() => onPick(c.label)}
                    >
                      <span className="cat-em" aria-hidden>{c.emoji}</span>
                      {c.label}
                    </button>
                    <button
                      type="button" className="cp-edit" disabled={busy || saving}
                      aria-label={`Rename ${c.label}`} title={`Rename ${c.label}`}
                      onClick={() => { setEditing({ kind: "rename", id: c.id, label: c.label }); setError(null); }}
                    >
                      Rename
                    </button>
                  </div>
                )
              ))}
            </div>
          ))}
          {!groups.length && !offerCreate && <div className="cp-none">Nothing matches that.</div>}

          {/* Hidden categories, behind a count rather than always open: the
              whole reason to hide one is to shorten this list. */}
          {!!hidden.length && !needle && (
            <div className="cp-hidden">
              <button type="button" className="cp-hidden-t" onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? "Hide" : "Show"} {hidden.length} hidden
              </button>
              {showHidden && hidden.map((c) => (
                <div className="cp-row" key={c.id}>
                  <span className="cp-i cp-off"><span className="cat-em" aria-hidden>{c.emoji}</span>{c.label}</span>
                  <button type="button" className="cp-edit cp-always" disabled={busy || saving}
                    onClick={() => void run(() => setCategoryHidden(c.id, false))}>
                    Unhide
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
