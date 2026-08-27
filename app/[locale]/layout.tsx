import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import WhatsAppButton from "@/components/layout/WhatsAppButton";

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
      <Navbar locale={locale} />
      <main className="pt-16">{children}</main>
      <Footer locale={locale} />
      <WhatsAppButton />
    </NextIntlClientProvider>
  );
}
