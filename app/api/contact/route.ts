import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { okMessage } from "@/lib/api-response";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(10),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = schema.parse(body);

    // Log inquiry server-side; email via Resend can be wired when RESEND_API_KEY is set
    console.log("Contact inquiry:", data);

    return okMessage("Inquiry received. We will contact you shortly.");
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Failed to send inquiry" }, { status: 500 });
  }
}
