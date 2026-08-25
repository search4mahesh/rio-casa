import Link from "next/link";

import { pageMetadata } from "@/lib/page-metadata";

export const generateMetadata = () => pageMetadata("privacy");

/**
 * The footer has always linked here, so until now every public page carried a
 * link to a 404. Content is a plain-language baseline covering what the booking
 * flow actually collects — have it reviewed before launch.
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-earth-bg py-16">
      <div className="container-resort max-w-2xl">
        <h1 className="section-heading mb-2">Privacy Policy</h1>
        <p className="font-sans text-sm text-earth-text/50 mb-10">
          Rio Casa, Mahabaleshwar, Satara District, Maharashtra
        </p>

        <div className="space-y-8 font-sans text-earth-text/75 leading-relaxed">
          <Section title="What we collect">
            <p>
              When you make a booking we collect your name, email address, phone number, stay
              dates, number of guests and any special requests you choose to share. If you
              contact us through the website or WhatsApp, we keep that correspondence so we can
              answer you.
            </p>
          </Section>

          <Section title="Payments">
            <p>
              Card, UPI and net-banking payments are processed by Razorpay. Your card details are
              entered on Razorpay&apos;s systems and are never stored on ours — we retain only the
              payment reference needed to match a payment to your booking.
            </p>
          </Section>

          <Section title="How we use it">
            <p>
              We use your information to confirm and manage your stay, to send booking
              confirmations and related updates, to meet the guest-record requirements that apply
              to hotels in India, and to answer questions you send us. We do not sell your
              information.
            </p>
          </Section>

          <Section title="Who we share it with">
            <p>
              We share only what is necessary: our payment processor to take payment, our email
              provider to send your confirmation, and any travel platform you booked through. We
              may disclose information where the law requires it.
            </p>
          </Section>

          <Section title="How long we keep it">
            <p>
              Booking and billing records are kept for as long as tax and hospitality regulations
              require. Enquiries that do not lead to a booking are kept only as long as they are
              useful in answering you.
            </p>
          </Section>

          <Section title="Your choices">
            <p>
              You can ask us for a copy of the information we hold about you, ask us to correct
              it, or ask us to delete anything we are not required to keep. Write to{" "}
              <a href="mailto:info@riocasa.in" className="text-primary hover:underline">
                info@riocasa.in
              </a>{" "}
              and we will respond.
            </p>
          </Section>

          <Section title="Cookies">
            <p>
              The site uses only the cookies needed to make it work — for example keeping your
              booking selections as you move through the steps, and keeping staff signed in to the
              admin area. We do not use advertising cookies.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about this policy can go to{" "}
              <a href="mailto:info@riocasa.in" className="text-primary hover:underline">
                info@riocasa.in
              </a>
              .
            </p>
          </Section>
        </div>

        <div className="mt-12 pt-8 border-t border-primary/10">
          <Link href="/" className="btn-outline">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-xl text-earth-text mb-2">{title}</h2>
      {children}
    </section>
  );
}
