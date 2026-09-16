// The mark beside a merchant on the transactions list and the recurring panel.
//
// FOUR SOURCES, IN ORDER, AND EACH ONE IS A FALLBACK FOR THE LAST:
//
//   1. Plaid's own `logo_url` for that merchant (or the `merchant_logos` cache
//      it backfilled into, api/transactions.ts), which arrives with Transactions
//      at no extra product and no extra call. This is the only source that
//      keeps up with where people actually shop.
//   2. A live favicon lookup (lib/merchant-domains.ts) for ~300 common US
//      brands, through the same favicon service partners.ts already trusts for
//      affiliate cards. No image to host: a name resolves to a domain and the
//      domain resolves to a logo at request time.
//   3. Bundled brand art (lib/mock-logos.ts) via BrandTile, for the couple
//      dozen brands shipped as hosted images (mostly institutions and demo
//      listings, not real merchant strings).
//   4. A monogram tinted with the category's colour.
//
// Bundled art (3) is not where new merchant coverage should grow: it is a
// curated, hosted-image list, and on a real feed it covers almost nothing (of
// the merchants on one live account only Shell resolved). Growing THAT list
// by hand is exactly the maintenance debt the institution gallery was deleted
// for in #139, and it is the same "knowingly unlicensed" exposure this app
// already carries for card art. Tier 2 exists so growing merchant coverage
// costs a domain, not a hosted asset.
//
// A remote image can 404, or be blocked, or simply be slow, and a broken image
// icon in a money list looks like a bug in the money. Each tier's `onError`
// drops to the next one, so the worst case is the monogram, same as before
// this tier existed.
import { useState } from "react";
import { BrandTile } from "@/components/juniper/primitives";
import { merchantMark, initial } from "@/lib/txn-format";
import { merchantDomain } from "@/lib/merchant-domains";
import type { SeriesKey } from "@/lib/mock-data";

export function MerchantMark({ logo, merchant, name, k, paint, className }: {
  logo: string | null;
  merchant: string | null;
  name: string;
  k: SeriesKey;
  /** A finished colour, for a group the member created, which has no token. */
  paint?: string;
  className?: string;
}) {
  const domain = merchantDomain(merchant, name);
  const [stage, setStage] = useState<"plaid" | "favicon" | "fallback">(
    logo ? "plaid" : domain ? "favicon" : "fallback",
  );
  const cls = className ?? "blogo";
  // Decorative in every tier: the merchant name is right beside it in text,
  // so announcing the image would just repeat it.
  const imgProps = { className: cls, alt: "", loading: "lazy" as const, "aria-hidden": true };

  if (stage === "plaid" && logo) {
    return <img {...imgProps} src={logo} onError={() => setStage(domain ? "favicon" : "fallback")} />;
  }
  if (stage === "favicon" && domain) {
    return (
      <img
        {...imgProps}
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        onError={() => setStage("fallback")}
      />
    );
  }
  return <BrandTile name={merchantMark(merchant, name)} letter={initial(name)} k={k} paint={paint} />;
}
