/**
 * Correct invoices written under the placeholder GSTIN.
 *
 * `lib/invoice-service.ts` fell back to `27XXXXX0000X1ZX` when `HOTEL_GSTIN`
 * was unset — and `.env` had it set *to the placeholder*, so the fallback was
 * not even the mechanism. The value is snapshotted onto the `Invoice` row at
 * check-out (deliberately: a tax document handed to a guest must not change
 * when someone edits a setting later), which means fixing the code does
 * nothing for rows already written. This is that fix (B-62).
 *
 *   npx tsx prisma/repair-invoice-gstin.ts            # report only
 *   npx tsx prisma/repair-invoice-gstin.ts --apply    # rewrite them
 *
 * Only rows carrying the placeholder are touched. An invoice already bearing a
 * real GSTIN — the property's current one or a previous one — is left exactly
 * as it is: rewriting a correct historical snapshot is the thing the snapshot
 * exists to prevent.
 *
 * Idempotent, and safe to re-run: a second run finds nothing to do.
 *
 * **This does not un-send anything.** An invoice already emailed or printed is
 * out in the world with the wrong number on it; correcting the record is the
 * part that can be automated, and reissuing to affected guests is a judgement
 * call for the property.
 */
import { makeScriptClient } from "./script-client";
import { gstinProblem, PLACEHOLDER_GSTIN } from "../lib/hotel-details";

const APPLY = process.argv.includes("--apply");

async function main() {
  const problem = gstinProblem(process.env.HOTEL_GSTIN);
  if (problem) {
    throw new Error(
      `${problem}. There is nothing to correct these invoices *to*. ` +
        `Set HOTEL_GSTIN to the property's real GSTIN and re-run.`
    );
  }

  const gstin = process.env.HOTEL_GSTIN!.trim().toUpperCase();
  const name = process.env.HOTEL_NAME?.trim() || "Rio Casa Resort";
  const address =
    process.env.HOTEL_ADDRESS?.trim() || "Mahabaleshwar, Satara District, Maharashtra - 412806";

  const prisma = makeScriptClient();

  const affected = await prisma.invoice.findMany({
    where: { hotelGstin: PLACEHOLDER_GSTIN },
    select: { id: true, invoiceNumber: true, invoiceDate: true, guestName: true, totalAmount: true },
    orderBy: { invoiceDate: "asc" },
  });

  const total = await prisma.invoice.count();

  console.log(`\nInvoices on file:                 ${total}`);
  console.log(`Carrying the placeholder GSTIN:   ${affected.length}`);
  console.log(`Would be corrected to:            ${gstin}\n`);

  if (affected.length === 0) {
    console.log("Nothing to do.\n");
    await prisma.$disconnect();
    return;
  }

  for (const inv of affected) {
    const day = inv.invoiceDate.toISOString().slice(0, 10);
    console.log(`  ${inv.invoiceNumber.padEnd(20)} ${day}  ${inv.guestName.padEnd(22)} ₹${inv.totalAmount}`);
  }

  if (!APPLY) {
    console.log(`\nDry run — nothing written. Re-run with --apply to correct these ${affected.length}.\n`);
    await prisma.$disconnect();
    return;
  }

  const { count } = await prisma.invoice.updateMany({
    where: { hotelGstin: PLACEHOLDER_GSTIN },
    data: { hotelGstin: gstin, hotelName: name, hotelAddress: address },
  });

  console.log(`\nCorrected ${count} invoice${count === 1 ? "" : "s"}.`);
  console.log("Any of these already sent to a guest carries the old number — reissuing is a");
  console.log("decision for the property, not something this script can do.\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
