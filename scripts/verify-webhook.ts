import "dotenv/config";
import crypto from "crypto";

/**
 * Proves `/api/payment/webhook` is wired correctly, before Razorpay is pointed
 * at it.
 *
 *   npm run build && npm start                 # in one terminal
 *   npx tsx scripts/verify-webhook.ts          # in another
 *   npx tsx scripts/verify-webhook.ts --base https://riocasa.in
 *
 * **Read-only. It never settles a payment.** Every delivery it sends names an
 * order id that no booking holds, so the route resolves nothing and writes
 * nothing — which is exactly the case that proves the plumbing without touching
 * a guest's money. What settlement itself does is covered by
 * `payment-verify.test.ts` and `payment-webhook.test.ts`.
 *
 * What this catches that unit tests cannot, because it speaks to a real
 * deployment over real HTTP:
 *
 * - `RAZORPAY_WEBHOOK_SECRET` missing on that environment (503 on everything).
 * - The secret here disagreeing with the secret there — the single most likely
 *   setup mistake, and one that shows up in Razorpay's dashboard only as
 *   deliveries failing.
 * - A proxy, middleware or body parser that alters the bytes in flight. The
 *   signature is over the raw body, so anything that re-serialises it on the
 *   way in breaks verification with no other symptom.
 *
 * Run it against production too. It is safe there for the same reason it is
 * safe locally: no booking holds these order ids.
 */

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1] ?? fallback;
};

const PORT = process.env.PORT ?? "3000";
const BASE = arg("base", `http://localhost:${PORT}`);
const URL_PATH = "/api/payment/webhook";
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

/** An order id no booking can hold, so a correctly-signed delivery is inert. */
const INERT_ORDER = `order_verify_${crypto.randomBytes(8).toString("hex")}`;

function body(event: string) {
  return JSON.stringify({
    event,
    payload: {
      payment: {
        entity: { id: `pay_verify_${crypto.randomBytes(6).toString("hex")}`, order_id: INERT_ORDER },
      },
    },
  });
}

function sign(raw: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

async function deliver(raw: string, signature: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["x-razorpay-signature"] = signature;
  const res = await fetch(`${BASE}${URL_PATH}`, { method: "POST", headers, body: raw });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* an empty or HTML body is itself the finding — reported as the raw text */
  }
  return { status: res.status, body: parsed, text: text.slice(0, 200) };
}

type Check = { name: string; expect: number; why: string; run: () => Promise<{ status: number; text: string }> };

async function main() {
  if (!SECRET) {
    console.error(
      "RAZORPAY_WEBHOOK_SECRET is not set in this shell's environment.\n" +
        "It is what the script signs with, so there is nothing to verify against.\n" +
        "Set it in .env (it is gitignored) and re-run."
    );
    process.exit(1);
  }

  console.log(`Verifying ${BASE}${URL_PATH}`);
  console.log(`Using order ${INERT_ORDER} — no booking holds it, so nothing settles.\n`);

  const checks: Check[] = [
    {
      name: "unsigned delivery is refused",
      expect: 401,
      why: "absence of a signature must never read as a pass",
      run: () => deliver(body("payment.captured"), null),
    },
    {
      name: "wrong-secret signature is refused",
      expect: 401,
      why: "the deployment's secret differs from this shell's — the usual setup mistake",
      run: () => {
        const raw = body("payment.captured");
        return deliver(raw, sign(raw, "definitely-not-the-secret"));
      },
    },
    {
      name: "short signature is refused without a crash",
      expect: 401,
      why: "timingSafeEqual throws on a length mismatch; a 500 here means the length guard is gone",
      run: () => deliver(body("payment.captured"), "abc"),
    },
    {
      name: "correctly signed payment.captured is accepted",
      expect: 200,
      why: "THE ONE THAT MATTERS — a 401 here means the secrets disagree or the body was altered in flight",
      run: () => {
        const raw = body("payment.captured");
        return deliver(raw, sign(raw, SECRET));
      },
    },
    {
      name: "payment.authorized is acknowledged, not acted on",
      expect: 200,
      why: "an uncaptured hold is not money",
      run: () => {
        const raw = body("payment.authorized");
        return deliver(raw, sign(raw, SECRET));
      },
    },
    {
      name: "signed nonsense is acknowledged, not retried",
      expect: 200,
      why: "a 500 here would make Razorpay redeliver an unparseable body for 24 hours",
      run: () => deliver("not json", sign("not json", SECRET)),
    },
  ];

  let failed = 0;
  for (const check of checks) {
    let got: { status: number; text: string };
    try {
      got = await check.run();
    } catch (err) {
      console.log(`  FAIL  ${check.name}`);
      console.log(`        could not reach ${BASE} — is the server running? ${(err as Error).message}\n`);
      failed++;
      continue;
    }

    if (got.status === check.expect) {
      console.log(`  ok    ${check.name}  (${got.status})`);
      continue;
    }

    failed++;
    console.log(`  FAIL  ${check.name}`);
    console.log(`        expected ${check.expect}, got ${got.status} — ${check.why}`);
    if (got.status === 503) {
      console.log(`        503 means RAZORPAY_WEBHOOK_SECRET is unset on that deployment.`);
    }
    console.log(`        body: ${got.text}\n`);
  }

  console.log("");
  if (failed > 0) {
    console.error(`${failed} of ${checks.length} checks failed — do not point Razorpay at this URL yet.`);
    process.exit(1);
  }
  console.log(`All ${checks.length} checks passed. The endpoint is ready for a Razorpay webhook.`);
  console.log("Nothing was written: no booking holds the order id used above.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
