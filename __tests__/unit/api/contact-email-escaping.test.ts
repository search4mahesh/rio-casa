import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * B-63, end to end: the payload Resend is actually handed.
 *
 * `html-email.test.ts` proves the helper escapes. This proves the route uses
 * it — which is the half that regresses, because a new field added to the
 * template is one nobody remembers to wrap.
 */

const sendMock = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { contactInquiry: { create: vi.fn().mockResolvedValue({ id: "ci_1" }) } },
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfter: 60 }) };
});

import { POST } from "@/app/api/contact/route";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMock.mockResolvedValue({ data: { id: "e1" }, error: null });
  process.env.RESEND_API_KEY = "re_test_key";
});

describe("POST /api/contact — the notification email", () => {
  it("does not carry an injected tag through to the email body", async () => {
    await POST(
      post({
        name: '<a href="http://evil.example">Approve refund</a>',
        email: "attacker@example.com",
        message: "Please click the link above.",
      })
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    const { html } = sendMock.mock.calls[0][0];

    // Staff read this one. A live link here is a phishing mail that appears to
    // come from the property's own system.
    expect(html).not.toContain('<a href="http://evil.example"');
    expect(html).toContain("&lt;a href=&quot;http://evil.example&quot;&gt;");
  });

  it("escapes an image-based payload in the message body", async () => {
    await POST(
      post({
        name: "Asha Patil",
        email: "asha@example.com",
        message: "Hello\n<img src=x onerror=alert(document.cookie)>",
      })
    );

    const { html } = sendMock.mock.calls[0][0];
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("keeps real line breaks as <br/> while escaping the text", async () => {
    await POST(
      post({
        name: "Asha Patil",
        email: "asha@example.com",
        message: "First line\nSecond line",
      })
    );

    const { html } = sendMock.mock.calls[0][0];
    expect(html).toContain("First line<br/>Second line");
  });

  it("escapes the phone field too", async () => {
    await POST(
      post({
        name: "Asha Patil",
        email: "asha@example.com",
        phone: "<b>9876543210</b>",
        message: "Is a room free in September?",
      })
    );

    const { html } = sendMock.mock.calls[0][0];
    expect(html).not.toContain("<b>9876543210</b>");
    expect(html).toContain("&lt;b&gt;");
  });

  // Subjects are plain text in every mail client — escaping there would show
  // the reader `&amp;` in their inbox list.
  it("leaves the subject unescaped", async () => {
    await POST(
      post({ name: "Patil & Sons", email: "a@example.com", message: "A question about rooms." })
    );

    expect(sendMock.mock.calls[0][0].subject).toContain("Patil & Sons");
    expect(sendMock.mock.calls[0][0].subject).not.toContain("&amp;");
  });

  it("renders an ordinary enquiry unchanged", async () => {
    await POST(
      post({
        name: "Meera Joshi",
        email: "meera@example.com",
        phone: "9876500011",
        message: "Do you have a family room for 12-14 September?",
      })
    );

    const { html } = sendMock.mock.calls[0][0];
    expect(html).toContain("Meera Joshi");
    expect(html).toContain("Do you have a family room for 12-14 September?");
  });
});
