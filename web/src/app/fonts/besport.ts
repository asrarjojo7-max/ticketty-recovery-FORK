import localFont from "next/font/local";

/**
 * beIN Black — the display/heading font (owner-selected, beIN Sports
 * branding family). Full Arabic + Latin coverage; weight 900-ish black
 * single cut. Used for headings via --font-display.
 */
export const besport = localFont({
  src: "./besport.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "900",
  fallback: ["var(--font-sans)", "sans-serif"],
});
