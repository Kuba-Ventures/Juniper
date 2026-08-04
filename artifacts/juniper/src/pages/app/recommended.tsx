import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/juniper/app-frame";
import { listings, listingCategories, type Listing } from "@/lib/mock-data";
import { BrandTile } from "@/components/juniper/primitives";
import { submitListing, usePartners, usePicks } from "@/lib/marketplace";

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
);

function Backdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

const SUBMIT_CATEGORIES = listingCategories.filter((c) => c !== "All");

function ListYourService({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: "", category: SUBMIT_CATEGORIES[0] ?? "", url: "", contactEmail: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setError(null);
    setBusy(true);
    const res = await submitListing(form);
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error);
  };

  if (done) {
    return (
      <Backdrop onClose={onClose}>
        <h3>Submitted for review</h3>
        <p><b>{form.name}</b> is in our moderation queue. We review listings for fit and compliance before they appear in the marketplace, and we'll email {form.contactEmail} with the decision.</p>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Done</button></div>
      </Backdrop>
    );
  }

  return (
    <Backdrop onClose={onClose}>
      <h3>List your service</h3>
      <p>Submit your offer to appear in the Juniper marketplace. Listings are reviewed before they go live; ranking always reflects fit to the member, never payment.</p>
      <div className="form-col">
        <label>Service name<input value={form.name} onChange={set("name")} placeholder="e.g. Acme High-Yield Savings" /></label>
        <label>Category
          <select value={form.category} onChange={set("category")}>
            {SUBMIT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>Link<input value={form.url} onChange={set("url")} placeholder="https://…" /></label>
        <label>Contact email<input value={form.contactEmail} onChange={set("contactEmail")} placeholder="you@company.com" /></label>
        <label>What is it?<textarea value={form.description} onChange={set("description")} rows={3} placeholder="One or two sentences on the offer and who it's for." /></label>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions">
        <button className="btn" onClick={submit} disabled={busy || !form.name || !form.category || !form.url || !form.contactEmail}>{busy ? "Submitting…" : "Submit for review"}</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </Backdrop>
  );
}

function ListingCard({ m, rec }: { m: Listing; rec?: boolean }) {
  return (
    <div className={`card mkt-card ${m.use ? "used" : ""}`}>
      <div className="mkt-top">
        <BrandTile name={m.n} letter={m.logo} k={m.k} big />
        <div style={{ flex: 1, minWidth: 0 }}><div className="mn">{m.n}</div><div className="mc">{m.cat}</div></div>
        {m.use && <span className="use-badge">You use this</span>}
      </div>
      <div className="mkt-stat">{m.stat}</div>
      <p>{m.blurb}</p>
      {rec && m.match && <div className="mkt-why">Because {m.match}.</div>}
      <div className="tags">{m.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
      <div className="mkt-foot">
        <span className={`src ${m.src}`}>{m.src === "self" ? "Self-listed" : "Curated"}</span>
        <button className="btn sm">View</button>
      </div>
    </div>
  );
}

export function Recommended() {
  const [cat, setCat] = useState("All");
  const [listOpen, setListOpen] = useState(false);
  // Library reads the DB-backed catalog; "Picked for you" is personalized from
  // the member's financial signals (usePicks). Both start on the seed/mock and
  // swap to live data once the member is linked + synced.
  const { offers } = usePartners();
  const { picks: picked } = usePicks();
  const pickedNames = new Set(picked.map((m) => m.n));
  const library = offers
    .filter((m) => !pickedNames.has(m.n))
    .filter((m) => cat === "All" || m.cat === cat);

  return (
    <div className="frame">
      <PageHeader
        title="Recommended for you"
        sub="Money moves picked for your situation, plus a library of vetted options to explore."
        actions={
          <>
            <span className="search"><SearchIcon /><input placeholder="Search options" /></span>
            <button className="btn ghost sm" onClick={() => setListOpen(true)}>List your service</button>
          </>
        }
      />

      {listOpen && <ListYourService onClose={() => setListOpen(false)} />}

      {picked.length > 0 && (
        <>
          <div className="sec-title">Picked for you</div>
          <div className="grid mkt-grid" style={{ marginBottom: 28 }}>
            {picked.map((m) => <ListingCard key={m.n} m={m} rec />)}
          </div>
        </>
      )}

      <div className="lib-head">
        <div className="sec-title">Library</div>
        <div className="pills" style={{ flexWrap: "wrap" }}>
          {listingCategories.map((c) => (
            <button key={c} className={cat === c ? "on" : undefined} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </div>
      <div className="grid mkt-grid">
        {library.length ? (
          library.map((m) => <ListingCard key={m.n} m={m} />)
        ) : (
          <div className="card" style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--jnpr-ink-3)", padding: 28 }}>No options in this category.</div>
        )}
      </div>

      <p className="disc">Juniper may earn a commission when you open an account through these links. "Picked for you" reflects your linked accounts and goals; the library is everything else. <b>Curated</b> listings are reviewed by Juniper; <b>self-listed</b> are submitted by the provider. Ranking reflects fit to your finances, never payment.</p>
    </div>
  );
}
