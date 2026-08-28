// Formatting for transaction-level figures. Pure, so a chart can import it
// without pulling in the data layer.
//
// The money helpers differ from `money()` in lib/mock-data.ts on purpose.
// That one rounds to whole dollars because it prints TOTALS, where a cent is
// noise. These print ROWS the member is reconciling against their own bank
// statement, and a $11.99 charge rendered as $12 is what makes someone stop
// trusting the list.
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const fmtDay = (isoDate: string) => {
  const [, m, d] = isoDate.split("-");
  return `${MONTH_ABBR[+m - 1]} ${+d}`;
};
export const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${MONTH_ABBR[+m - 1]} ${y.slice(2)}`;
};
export const money2 = (n: number) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (n: number) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
