"use client";

import { useEffect, useState, useCallback, useId } from "react";
import { useToast, Toast } from "@/components/ui/Toast";

type Recipient = { guestName: string; phone: string | null; email: string | null; bookingNumber?: string; checkIn?: string; roomName?: string };

type Preview = {
  totalRecipients: number; reachableCount: number; skippedCount: number;
  recipients: Recipient[];
  sample: { to: string | null | undefined; subject?: string; body: string } | null;
};

type SendResult = {
  sentCount: number; skippedCount: number; errors: string[];
  whatsappLinks?: { guestName: string; phone: string; url: string }[];
};

type Log = {
  id: string; channel: string; subject: string | null; body: string;
  recipients: number; sentBy: string; filter: string; createdAt: string;
};

const FILTER_LABEL: Record<string, string> = {
  "upcoming-arrivals": "Upcoming Arrivals",
  "checked-in": "Currently Checked-in",
  "past-guests": "Past Guests",
  "manual": "Manual",
};

const TEMPLATES = {
  arrival: "Hi {{guestName}}, this is a friendly reminder that your stay at Rio Casa begins {{checkIn}}. Your booking is {{bookingNumber}} for {{roomName}}. Check-in time is 12:00 PM. Looking forward to welcoming you!",
  thanks: "Dear {{guestName}}, thank you for staying at Rio Casa! We hope you had a wonderful time. We'd love to hear your feedback.",
  reengagement: "Hi {{guestName}}, the monsoon season at Mahabaleshwar is magical and we'd love to welcome you back to Rio Casa. Get 15% off direct bookings with code WELCOME15.",
};

export default function CommunicationsPanel() {
  const fieldId = useId();
  const [tab, setTab] = useState<"compose" | "log">("compose");

  // Compose state
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [filterType, setFilterType] = useState<"upcoming-arrivals" | "checked-in" | "past-guests" | "manual">("upcoming-arrivals");
  const [days, setDays] = useState(2);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [manualRaw, setManualRaw] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast, showToast } = useToast();

  // Log state
  const [logs, setLogs] = useState<Log[]>([]);


  function buildFilter() {
    if (filterType === "upcoming-arrivals") return { type: filterType, days };
    if (filterType === "past-guests") return { type: filterType, fromDate: fromDate || undefined, toDate: toDate || undefined };
    if (filterType === "manual") {
      const lines = manualRaw.split("\n").map((l) => l.trim()).filter(Boolean);
      const recipients = lines.map((line) => {
        const [guestName, contact] = line.split(",").map((s) => s?.trim());
        const isEmail = contact?.includes("@");
        return { guestName: guestName || "Guest", ...(isEmail ? { email: contact } : { phone: contact }) };
      });
      return { type: filterType, recipients };
    }
    return { type: filterType };
  }

  async function doPreview() {
    setLoading(true); setSendResult(null);
    const res = await fetch("/api/admin/communications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "preview", channel, filter: buildFilter(), subject, body }),
    });
    const data = await res.json();
    if (data.success) setPreview(data.data);
    else showToast(data.error ?? "Preview failed");
    setLoading(false);
  }

  async function doSend() {
    if (!preview || preview.reachableCount === 0) { showToast("Run preview first"); return; }
    if (!confirm(`Send ${preview.reachableCount} ${channel} message${preview.reachableCount !== 1 ? "s" : ""}?`)) return;
    setLoading(true);
    const res = await fetch("/api/admin/communications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", channel, filter: buildFilter(), subject, body }),
    });
    const data = await res.json();
    if (data.success) {
      setSendResult(data);
      showToast(`Sent ${data.sentCount} ${channel} message${data.sentCount !== 1 ? "s" : ""}`);
      setPreview(null);
    } else {
      showToast(data.error ?? "Send failed");
    }
    setLoading(false);
  }

  const loadLogs = useCallback(async () => {
    const res = await fetch("/api/admin/communications");
    const data = await res.json();
    if (data.success) setLogs(data.data);
  }, []);

  useEffect(() => { if (tab === "log") loadLogs(); }, [tab, loadLogs]);

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-end gap-3 mb-6">
        <div className="flex bg-gray-100 rounded-lg p-1 gap-0.5">
          <button onClick={() => setTab("compose")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md ${tab === "compose" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            Compose
          </button>
          <button onClick={() => setTab("log")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md ${tab === "log" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            Send Log
          </button>
        </div>
      </div>

      {tab === "compose" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: compose */}
          <div className="lg:col-span-2 space-y-4">
            {/* Channel */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <span id={`${fieldId}-channel-label`} className="block text-sm font-semibold text-gray-700 mb-2">Channel</span>
              <div role="group" aria-labelledby={`${fieldId}-channel-label`} className="flex gap-2">
                {(["email", "whatsapp"] as const).map((c) => (
                  <button key={c} onClick={() => setChannel(c)}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      channel === c ? "border-primary bg-primary/5 text-primary" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}>
                    {c === "email" ? "Email (via Resend)" : "WhatsApp (click-to-chat)"}
                  </button>
                ))}
              </div>
            </div>

            {/* Audience */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <label htmlFor={`${fieldId}-audience`} className="block text-sm font-semibold text-gray-700">Audience</label>
              <select id={`${fieldId}-audience`} value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                {Object.entries(FILTER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>

              {filterType === "upcoming-arrivals" && (
                <div>
                  <label htmlFor={`${fieldId}-within-next-n-days`} className="block text-xs text-gray-500 mb-1">Within next N days</label>
                  <input id={`${fieldId}-within-next-n-days`} type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))}
                    className="w-32 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              )}

              {filterType === "past-guests" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`${fieldId}-from`} className="block text-xs text-gray-500 mb-1">From</label>
                    <input id={`${fieldId}-from`} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label htmlFor={`${fieldId}-to`} className="block text-xs text-gray-500 mb-1">To</label>
                    <input id={`${fieldId}-to`} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg" />
                  </div>
                </div>
              )}

              {filterType === "manual" && (
                <div>
                  <label htmlFor={`${fieldId}-one-per-line-name-contact`} className="block text-xs text-gray-500 mb-1">One per line: <span className="font-mono">Name, contact</span></label>
                  <textarea id={`${fieldId}-one-per-line-name-contact`} value={manualRaw} onChange={(e) => setManualRaw(e.target.value)} rows={4}
                    placeholder="Ravi Kumar, ravi@example.com&#10;Priya Sharma, 9876543210"
                    className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg font-mono resize-none" />
                </div>
              )}
            </div>

            {/* Message */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Message</span>
                <div className="flex gap-1">
                  <button onClick={() => { setSubject("Check-in reminder — Rio Casa"); setBody(TEMPLATES.arrival); }}
                    className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">Arrival</button>
                  <button onClick={() => { setSubject("Thank you for staying"); setBody(TEMPLATES.thanks); }}
                    className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">Thank you</button>
                  <button onClick={() => { setSubject("Welcome back!"); setBody(TEMPLATES.reengagement); }}
                    className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">Re-engage</button>
                </div>
              </div>

              {channel === "email" && (
                <div>
                  <label htmlFor={`${fieldId}-subject`} className="block text-xs text-gray-500 mb-1">Subject *</label>
                  <input id={`${fieldId}-subject`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200}
                    className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              )}

              <div>
                <label htmlFor={`${fieldId}-body`} className="block text-xs text-gray-500 mb-1">Body *</label>
                <textarea id={`${fieldId}-body`} value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={4000}
                  placeholder="Hi {{guestName}}, ..."
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                <div className="text-xs text-gray-400 mt-1">
                  Merge tags: <code className="bg-gray-100 px-1 rounded">{`{{guestName}}`}</code>{" "}
                  <code className="bg-gray-100 px-1 rounded">{`{{checkIn}}`}</code>{" "}
                  <code className="bg-gray-100 px-1 rounded">{`{{bookingNumber}}`}</code>{" "}
                  <code className="bg-gray-100 px-1 rounded">{`{{roomName}}`}</code>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={doPreview} disabled={loading || !body || (channel === "email" && !subject)}
                className="flex-1 py-2.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
                {loading ? "Loading…" : "Preview"}
              </button>
              <button onClick={doSend} disabled={loading || !preview || preview.reachableCount === 0}
                className="flex-1 py-2.5 btn-admin">
                {loading ? "Sending…" : preview ? `Send to ${preview.reachableCount}` : "Send"}
              </button>
            </div>
          </div>

          {/* Right: preview pane */}
          <div className="space-y-4">
            {preview && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Preview</h3>
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="bg-blue-50 rounded p-2">
                    <div className="text-lg font-bold text-blue-700">{preview.totalRecipients}</div>
                    <div className="text-[10px] text-blue-600">Matched</div>
                  </div>
                  <div className="bg-green-50 rounded p-2">
                    <div className="text-lg font-bold text-green-700">{preview.reachableCount}</div>
                    <div className="text-[10px] text-green-600">Reachable</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-lg font-bold text-gray-600">{preview.skippedCount}</div>
                    <div className="text-[10px] text-gray-500">Skipped</div>
                  </div>
                </div>

                {preview.sample && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg text-xs">
                    <div className="font-semibold text-gray-700 mb-1">Sample (first recipient):</div>
                    <div className="text-gray-500">To: <span className="font-mono">{preview.sample.to}</span></div>
                    {preview.sample.subject && <div className="text-gray-500">Subject: {preview.sample.subject}</div>}
                    <div className="mt-2 text-gray-700 whitespace-pre-wrap">{preview.sample.body}</div>
                  </div>
                )}

                {preview.recipients.length > 0 && (
                  <>
                    <div className="text-xs font-semibold text-gray-500 mb-1.5">Recipients (first 10)</div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {preview.recipients.map((r, i) => (
                        <div key={i} className="text-xs flex justify-between border-b border-gray-100 pb-1">
                          <span>{r.guestName}</span>
                          <span className="text-gray-400 truncate ml-2 max-w-[120px]">{channel === "email" ? r.email : r.phone}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {sendResult && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-green-700 mb-2">✓ Sent</h3>
                <div className="text-sm text-green-700">{sendResult.sentCount} message{sendResult.sentCount !== 1 ? "s" : ""} sent</div>
                {sendResult.skippedCount > 0 && <div className="text-xs text-amber-600 mt-1">{sendResult.skippedCount} skipped</div>}
                {sendResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-red-600 cursor-pointer">{sendResult.errors.length} error{sendResult.errors.length !== 1 ? "s" : ""}</summary>
                    <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                      {sendResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </details>
                )}
                {sendResult.whatsappLinks && sendResult.whatsappLinks.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-700 mb-1.5">Click each link to open WhatsApp:</div>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {sendResult.whatsappLinks.map((l, i) => (
                        <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                          className="block text-xs px-2 py-1.5 bg-white border border-green-300 rounded hover:bg-green-100 transition-colors">
                          <span className="font-medium text-gray-800">{l.guestName}</span>
                          <span className="text-gray-400 ml-1">{l.phone}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        // ─── Send Log ───
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Sent</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Channel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Audience</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Recipients</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Subject</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-gray-400">No sends yet</td></tr>
              ) : logs.map((log) => {
                let filterType = "—";
                try { filterType = FILTER_LABEL[JSON.parse(log.filter).type] ?? "—"; } catch { /* ignore */ }
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(log.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${log.channel === "email" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                        {log.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{filterType}</td>
                    <td className="px-4 py-3 text-right font-medium">{log.recipients}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-xs">{log.subject ?? <span className="italic text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{log.sentBy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
