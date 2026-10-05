import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { adminDb } from "@/lib/firebase/admin";

const TEST_AMOUNT_PAISE = 100;
const CURRENCY = "INR";

const paymentVerificationSchema = z.object({
  razorpayOrderId: z.string().min(1).max(128),
  razorpayPaymentId: z.string().min(1).max(128),
  razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/i),
  plan: z.string().optional(),
});

function getCredentials() {
  const keyId = typeof process !== "undefined" ? process.env?.["RAZORPAY_KEY_ID"] : undefined;
  const keySecret =
    typeof process !== "undefined" ? process.env?.["RAZORPAY_KEY_SECRET"] : undefined;

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay checkout is not configured yet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    );
  }

  return { keyId, keySecret };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const createRazorpayTestOrder = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { keyId, keySecret } = getCredentials();
    const receipt = `onyx_${context.userId.replaceAll("-", "").slice(0, 12)}_${Date.now()}`;
    const authorization = btoa(`${keyId}:${keySecret}`);
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: TEST_AMOUNT_PAISE, currency: CURRENCY, receipt }),
    });

    if (!response.ok) {
      console.error("Razorpay order creation failed", response.status, await response.text());
      throw new Error(
        response.status === 401
          ? "Razorpay rejected the credentials."
          : "Could not start Razorpay checkout. Please try again.",
      );
    }

    const order = z
      .object({
        id: z.string().min(1),
        amount: z.number().int().min(TEST_AMOUNT_PAISE),
        currency: z.literal(CURRENCY),
      })
      .parse(await response.json());

    return {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    };
  });

export const verifyRazorpayTestPayment = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => paymentVerificationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { keySecret } = getCredentials();
    const message = `${data.razorpayOrderId}|${data.razorpayPaymentId}`;
    const expectedHex = await hmacSha256Hex(keySecret, message);
    const valid = expectedHex.toLowerCase() === data.razorpaySignature.toLowerCase();

    if (!valid) throw new Error("Razorpay could not verify this payment.");

    const chosenPlan = data.plan || "Pro";

    // Write payment record and update user plan in Firestore from server
    try {
      const now = new Date().toISOString();
      const paymentRecord = {
        id: data.razorpayPaymentId,
        userId: context.userId,
        razorpayOrderId: data.razorpayOrderId,
        razorpayPaymentId: data.razorpayPaymentId,
        amount: TEST_AMOUNT_PAISE / 100,
        plan: chosenPlan,
        status: "captured",
        createdAt: now,
      };

      await adminDb.collection("payments").doc(data.razorpayPaymentId).set(paymentRecord);
      await adminDb
        .collection("users")
        .doc(context.userId)
        .set({ plan: chosenPlan }, { merge: true });
    } catch (err) {
      console.error("Failed to write payment record in Firestore:", err);
    }

    return { verified: true as const, paymentId: data.razorpayPaymentId, plan: chosenPlan };
  });
