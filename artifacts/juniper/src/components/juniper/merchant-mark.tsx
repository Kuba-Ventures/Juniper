// The mark beside a merchant on the transactions list and the recurring panel.
//
// THREE SOURCES, IN ORDER, AND EACH ONE IS A FALLBACK FOR THE LAST:
//
//   1. Plaid's own `logo_url` for that merchant, which arrives with Transactions
//      at no extra product and no extra call. This is the only source that
//      keeps up with where people actually shop.
//   2. Bundled brand art (lib/mock-logos.ts) via BrandTile, for the two dozen
//      brands we ship images for.
//   3. A monogram tinted with the category's colour.
//
// Bundled art is second rather than first on purpose. It is a curated list, and
// on a real feed it covers almost nothing: of the merchants on one live account
// only Shell resolved. Growing that list by hand is exactly the maintenance debt
// the institution gallery was deleted for in #139.
//
// A remote image can 404, or be blocked, or simply be slow, and a broken image
// icon in a money list looks like a bug in the money. `onError` drops back to
// the same tile the row would have had with no logo at all, so the worst case is
// the previous behaviour rather than a hole.
import { useState } from "react";
import { BrandTile } from "@/components/juniper/primitives";
import { merchantMark, initial } from "@/lib/txn-format";
import type { SeriesKey } from "@/lib/mock-data";

export function MerchantMark({ logo, merchant, name, k, className }: {
  logo: string | null;
  merchant: string | null;
  name: string;
  k: SeriesKey;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const fallback = <BrandTile name={merchantMark(merchant, name)} letter={initial(name)} k={k} />;
  if (!logo || failed) return fallback;
  return (
    <img
      className={className ?? "blogo"}
      src={logo}
      alt=""
      loading="lazy"
      // Decorative: the merchant name is right beside it in text, so announcing
      // the image would just repeat it.
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  );
}
