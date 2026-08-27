import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n.ts");

// ─────────────────────────────────────────────────────────────
// Security headers.
//
// There were none. These are the cheap, high-value ones — none of them change
// what the site renders, and all of them close off a class of attack that
// needs no bug on our side to work.
//
// The CSP is the one with teeth, and the one that can break the site, so it is
// written against what this app actually loads rather than copied from a
// template:
//
//   script-src   Razorpay's checkout.js, loaded by a <script> tag on
//                /booking — *and* cdn.razorpay.com, which checkout.js then
//                pulls its risk-detection bundle from. That second host is not
//                in Razorpay's snippet and only shows up when the page is
//                loaded with a CSP in place; allowing only checkout.razorpay.com
//                blocks it and the console fills with violations mid-checkout.
//                `unsafe-inline` and `unsafe-eval` are required by Next's own
//                runtime — it inlines the bootstrap and the RSC payload — and
//                removing them needs per-request nonces, which middleware
//                cannot add to a statically rendered page.
//   frame-src    Razorpay opens checkout in an iframe — without this, paying
//                is impossible — and the home page embeds a Google Map.
//   connect-src  the API routes (same origin) and Razorpay's own telemetry.
//   img-src      data: for the inline SVG placeholders, blob: for next/image.
//   font-src     self only — the Google Fonts import in globals.css is
//                @import'ed CSS, so the stylesheet needs style-src and the
//                files need fonts.gstatic.com.
//
// `frame-ancestors 'none'` is the modern X-Frame-Options; both are sent
// because older browsers ignore the CSP directive.
// ─────────────────────────────────────────────────────────────
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://cdn.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://cdn.razorpay.com",
  "connect-src 'self' https://api.razorpay.com https://cdn.razorpay.com https://lumberjack.razorpay.com https://lumberjack-cx.razorpay.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com https://www.google.com",
  // Razorpay's checkout iframe is what actually takes the payment, and it
  // needs to post back to its own origin. `child-src` is the older name that
  // some browsers still consult.
  "child-src https://api.razorpay.com https://checkout.razorpay.com https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  // Nothing on this site posts anywhere but itself — Razorpay's checkout runs
  // in its own iframe and posts from there.
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Belt and braces with frame-ancestors above, for browsers that predate it.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the full URL same-origin, only the origin cross-origin: a booking
  // confirmation URL carries a booking id, and it should not leak in a
  // Referer header to anywhere else.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This site asks for none of these. Denying them means an injected script
  // cannot either.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Two years, subdomains included. Vercel serves HTTPS only, so this costs
  // nothing and closes the first-visit downgrade window.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // CI runs `npm run lint` as its own step (see .github/workflows/ci.yml).
    // Leaving it out of the build keeps a lint warning from failing a deploy,
    // but it does mean the build will never catch one — which is how lint
    // silently rotted for months (B-46). The CI step is what replaces it.
    ignoreDuringBuilds: true,
  },
  images: {
    // No remote hosts. This used to allow Cloudinary, Unsplash and Sanity,
    // none of which the site ever loaded from — every image is a local file
    // under public/images. An allowlist entry is a host permitted to serve
    // arbitrary content through our own image optimiser, so an unused one is
    // not free.
    remotePatterns: [],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default withNextIntl(nextConfig);
