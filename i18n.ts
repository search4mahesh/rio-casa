import { getRequestConfig } from "next-intl/server";

const validLocales = ["en", "hi", "mr"] as const;

export default getRequestConfig(async ({ locale }) => {
  const resolved = validLocales.includes(locale as (typeof validLocales)[number])
    ? (locale as string)
    : "en";

  return {
    locale: resolved,
    messages: (await import(`./messages/${resolved}.json`)).default,
  };
});
