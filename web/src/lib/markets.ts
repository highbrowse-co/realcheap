export interface Market {
  country: string;
  label: string;
  currency: string;
  language: string;
}

/** The seven markets RealCheap ships to, per CLAUDE.md. Currency/language are
 * RealCheap's own store config, not an XCover concern — XCover just receives
 * whichever ISO codes we send in `customer`. */
export const MARKETS: Market[] = [
  { country: "US", label: "United States", currency: "USD", language: "en" },
  { country: "CA", label: "Canada", currency: "CAD", language: "en" },
  { country: "GB", label: "United Kingdom", currency: "GBP", language: "en" },
  { country: "IT", label: "Italy", currency: "EUR", language: "it" },
  { country: "FR", label: "France", currency: "EUR", language: "fr" },
  { country: "ES", label: "Spain", currency: "EUR", language: "es" },
  { country: "DE", label: "Germany", currency: "EUR", language: "de" },
];
