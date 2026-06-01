"use client";

import { useEffect, useState } from "react";

type LineItem = { description: string; nights?: number; rate?: number; amount: number };

type Invoice = {
  id: string;
  invoiceNumber: string;
  hotelGstin: string; hotelName: string; hotelAddress: string;
  guestName: string; guestGstin?: string | null; guestAddress?: string | null;
  subtotal: string; discount: string; taxableAmount: string;
  cgstRate?: string | null; sgstRate?: string | null;
  cgstAmount?: string | null; sgstAmount?: string | null;
  totalAmount: string;
  lineItems: LineItem[];
  invoiceDate: string;
  dueDate?: string | null;
  status: string;
  booking: {
    bookingNumber: string; checkIn: string; checkOut: string; nights: number;
    adults: number; children: number;
    room: { name: string; roomNumber?: string | null; roomType: string };
  };
  guest: {
    firstName: string; lastName: string;
    phone: string; email?: string | null;
    address?: string | null; city?: string | null; state?: string | null;
    pincode?: string | null; gstin?: string | null; companyName?: string | null;
  };
};

function fmtINR(n: string | number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(n));
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

// Convert number to Indian English words (lakhs/crores)
function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
             "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function tens(num: number): string {
    if (num < 20) return a[num];
    return b[Math.floor(num / 10)] + (num % 10 ? " " + a[num % 10] : "");
  }
  function hundreds(num: number): string {
    return (num >= 100 ? a[Math.floor(num / 100)] + " Hundred " : "") + (num % 100 ? tens(num % 100) : "");
  }

  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);

  let result = "";
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  if (crore) result += hundreds(crore) + " Crore ";
  if (lakh) result += hundreds(lakh) + " Lakh ";
  if (thousand) result += hundreds(thousand) + " Thousand ";
  if (rest) result += hundreds(rest);
  result = result.trim() + " Rupees";
  if (paise > 0) result += " and " + tens(paise) + " Paise";
  return result + " Only";
}

export default function InvoicePrintPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailing, setEmailing] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");

  useEffect(() => {
    fetch(`/api/admin/invoices/${id}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setInvoice(d.invoice); setLoading(false); });
  }, [id]);

  async function sendEmail() {
    setEmailing(true);
    setEmailMsg("");
    const res = await fetch(`/api/admin/invoices/${id}/email`, { method: "POST" });
    const data = await res.json();
    setEmailMsg(data.success ? data.message : data.error);
    setEmailing(false);
    setTimeout(() => setEmailMsg(""), 5000);
  }

  if (loading) return <div className="p-10 text-center text-gray-400">Loading invoice…</div>;
  if (!invoice) return <div className="p-10 text-center text-gray-400">Invoice not found</div>;

  const guestAddress = [
    invoice.guest.address,
    [invoice.guest.city, invoice.guest.state, invoice.guest.pincode].filter(Boolean).join(", "),
  ].filter(Boolean).join("\n");

  return (
    <>
      {/* Action bar — hidden in print */}
      <div className="print:hidden bg-gray-100 border-b border-gray-300 px-6 py-3 flex items-center gap-3">
        <button onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-[#4A6741] hover:bg-[#3d5636] text-white text-sm font-medium rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print / Save as PDF
        </button>
        <button onClick={sendEmail} disabled={emailing}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 hover:bg-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors">
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {emailing ? "Sending…" : "Email to Guest"}
        </button>
        {emailMsg && <span className="text-sm text-gray-600 ml-2">{emailMsg}</span>}
        <button onClick={() => window.close()} className="ml-auto text-sm text-gray-500 hover:text-gray-700">Close</button>
      </div>

      {/* Invoice — print page */}
      <div className="max-w-4xl mx-auto p-10 bg-white print:p-8 print:max-w-full" id="invoice-print">

        {/* Header */}
        <div className="flex items-start justify-between pb-6 border-b-2 border-[#4A6741]">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded bg-[#4A6741] flex items-center justify-center">
                <span className="text-white text-sm font-bold">RC</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#4A6741]">{invoice.hotelName}</h1>
                <p className="text-xs text-gray-500">Mahabaleshwar, Maharashtra</p>
              </div>
            </div>
            <div className="text-xs text-gray-600 mt-2 whitespace-pre-line">{invoice.hotelAddress}</div>
            <div className="text-xs text-gray-700 mt-1"><strong>GSTIN:</strong> {invoice.hotelGstin}</div>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-bold text-gray-900">TAX INVOICE</h2>
            <div className="mt-3 text-sm">
              <div><span className="text-gray-500">Invoice #:</span> <span className="font-mono font-semibold">{invoice.invoiceNumber}</span></div>
              <div><span className="text-gray-500">Date:</span> {fmtDate(invoice.invoiceDate)}</div>
              <div><span className="text-gray-500">Booking #:</span> <span className="font-mono">{invoice.booking.bookingNumber}</span></div>
            </div>
          </div>
        </div>

        {/* Bill to */}
        <div className="grid grid-cols-2 gap-6 my-6">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Bill To</div>
            <div className="font-semibold text-gray-900">{invoice.guestName}</div>
            {invoice.guest.companyName && <div className="text-sm text-gray-700">{invoice.guest.companyName}</div>}
            {guestAddress && <div className="text-sm text-gray-600 whitespace-pre-line mt-1">{guestAddress}</div>}
            {invoice.guest.phone && <div className="text-sm text-gray-600 mt-1">📞 {invoice.guest.phone}</div>}
            {invoice.guest.email && <div className="text-sm text-gray-600">✉ {invoice.guest.email}</div>}
            {invoice.guestGstin && (
              <div className="text-sm text-gray-700 mt-2"><strong>GSTIN:</strong> <span className="font-mono">{invoice.guestGstin}</span></div>
            )}
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Stay Details</div>
            <div className="text-sm space-y-0.5">
              <div><span className="text-gray-500">Room:</span> {invoice.booking.room.roomNumber ? `#${invoice.booking.room.roomNumber} — ` : ""}{invoice.booking.room.name}</div>
              <div><span className="text-gray-500">Type:</span> <span className="capitalize">{invoice.booking.room.roomType}</span></div>
              <div><span className="text-gray-500">Check-in:</span> {fmtDate(invoice.booking.checkIn)}</div>
              <div><span className="text-gray-500">Check-out:</span> {fmtDate(invoice.booking.checkOut)}</div>
              <div><span className="text-gray-500">Nights:</span> {invoice.booking.nights}</div>
              <div><span className="text-gray-500">Guests:</span> {invoice.booking.adults} adult{invoice.booking.adults !== 1 ? "s" : ""}{invoice.booking.children > 0 ? `, ${invoice.booking.children} child${invoice.booking.children !== 1 ? "ren" : ""}` : ""}</div>
            </div>
          </div>
        </div>

        {/* Line items */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#4A6741] text-white">
              <th className="text-left px-3 py-2.5 font-semibold">Description</th>
              <th className="text-right px-3 py-2.5 font-semibold w-20">Nights</th>
              <th className="text-right px-3 py-2.5 font-semibold w-28">Rate (₹)</th>
              <th className="text-right px-3 py-2.5 font-semibold w-32">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.lineItems ?? []).map((item, i) => (
              <tr key={i} className="border-b border-gray-200">
                <td className="px-3 py-3">{item.description}</td>
                <td className="text-right px-3 py-3">{item.nights ?? "—"}</td>
                <td className="text-right px-3 py-3">{item.rate ? fmtINR(item.rate) : "—"}</td>
                <td className="text-right px-3 py-3 font-medium">{fmtINR(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mt-6">
          <table className="w-80 text-sm">
            <tbody>
              <tr>
                <td className="px-3 py-1.5 text-gray-600">Subtotal</td>
                <td className="text-right px-3 py-1.5 font-medium">₹{fmtINR(invoice.subtotal)}</td>
              </tr>
              {Number(invoice.discount) > 0 && (
                <tr>
                  <td className="px-3 py-1.5 text-gray-600">Discount</td>
                  <td className="text-right px-3 py-1.5 text-red-600">- ₹{fmtINR(invoice.discount)}</td>
                </tr>
              )}
              <tr className="border-t border-gray-200">
                <td className="px-3 py-1.5 text-gray-600">Taxable Amount</td>
                <td className="text-right px-3 py-1.5 font-medium">₹{fmtINR(invoice.taxableAmount)}</td>
              </tr>
              {invoice.cgstAmount && Number(invoice.cgstAmount) > 0 && (
                <tr>
                  <td className="px-3 py-1.5 text-gray-600">CGST @ {invoice.cgstRate}%</td>
                  <td className="text-right px-3 py-1.5">₹{fmtINR(invoice.cgstAmount)}</td>
                </tr>
              )}
              {invoice.sgstAmount && Number(invoice.sgstAmount) > 0 && (
                <tr>
                  <td className="px-3 py-1.5 text-gray-600">SGST @ {invoice.sgstRate}%</td>
                  <td className="text-right px-3 py-1.5">₹{fmtINR(invoice.sgstAmount)}</td>
                </tr>
              )}
              <tr className="border-t-2 border-[#4A6741]">
                <td className="px-3 py-2.5 font-bold text-base">TOTAL</td>
                <td className="text-right px-3 py-2.5 font-bold text-base text-[#4A6741]">₹{fmtINR(invoice.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Amount in words */}
        <div className="mt-6 p-3 bg-gray-50 border-l-4 border-[#4A6741] rounded">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Amount in Words</div>
          <div className="text-sm font-medium text-gray-800">{numberToWords(Number(invoice.totalAmount))}</div>
        </div>

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-gray-200 text-xs text-gray-500">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="font-semibold text-gray-700 mb-1">Terms & Conditions</div>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>This is a computer-generated invoice. No signature required.</li>
                <li>Check-in time: 12:00 PM · Check-out time: 11:00 AM</li>
                <li>GST as per the Government of India norms.</li>
              </ul>
            </div>
            <div className="text-right">
              <div className="mt-6">
                <div className="border-t border-gray-400 inline-block px-12 pt-2">For {invoice.hotelName}</div>
                <div className="mt-1">Authorised Signatory</div>
              </div>
            </div>
          </div>
          <div className="text-center mt-8 text-gray-400">
            Thank you for staying with us at Rio Casa
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body { background: white !important; }
          @page { margin: 1cm; size: A4; }
        }
      `}</style>
    </>
  );
}
