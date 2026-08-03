import { useState } from "react";
import { PageHeader } from "@/components/juniper/app-frame";
import { listings, listingCategories, type Listing } from "@/lib/mock-data";
import { BrandTile } from "@/components/juniper/primitives";

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
);

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
  const picked = listings.filter((m) => m.match);
  const library = listings
    .filter((m) => !m.match)
    .filter((m) => cat === "All" || m.cat === cat)
    .slice()
    .sort((a, b) => (a.use ? 1 : 0) - (b.use ? 1 : 0));

  return (
    <div className="frame">
      <PageHeader
        title="Recommended for you"
        sub="Money moves picked for your situation — plus a library of vetted options to explore."
        actions={
          <>
            <span className="search"><SearchIcon /><input placeholder="Search options" /></span>
            <button className="btn ghost sm">List your service</button>
          </>
        }
      />

      <div className="sec-title">Picked for you</div>
      <div className="grid mkt-grid" style={{ marginBottom: 28 }}>
        {picked.map((m) => <ListingCard key={m.n} m={m} rec />)}
      </div>

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
