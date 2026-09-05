import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import WhatsAppButton from "@/components/layout/WhatsAppButton";
import SkipLink from "@/components/layout/SkipLink";

const locales = ["en"];

/**
 * Lets the pages under this segment render at build time.
 *
 * Without it every public page was `ƒ` — server-rendered on each request —
 * including /about, /dining and /privacy, which have no per-request data at
 * all. The pages that genuinely do (anything reading rooms, packages, the
 * blog or the gallery) opt back out with their own `export const dynamic =
 * "force-dynamic"`.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;

  if (!locales.includes(locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      {/* Every page began with eight tab stops — seven nav links and Book
          Now — before a keyboard user reached any of its content. Visually
          hidden until focused, which is the whole point: the first Tab on
          any page now offers a way past the header. */}
      <SkipLink />
      <Navbar locale={locale} />
      {/* `tabIndex={-1}` so the skip link actually moves focus here.
          Browsers scroll to a fragment either way, but several leave focus
          in the link, so the next Tab would carry straight on through the
          nav the guest just asked to skip. */}
      <main id="main-content" tabIndex={-1} className="pt-16 focus:outline-none">
        {children}
      </main>
      <Footer locale={locale} />
      <WhatsAppButton />
    </NextIntlClientProvider>
  );
}
