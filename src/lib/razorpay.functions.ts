import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { adminDb } from "@/lib/firebase/admin";

const CURRENCY = "INR";

const PLAN_PRICES_PAISE: Record<string, { amount: number; name: string }> = {
  pro: { amount: 49900, name: "Pro" },
  institution: { amount: 199900, name: "Institution" },
};

const orderSchema = z.object({
  planCode: z.string().min(1),
});

const paymentVerificationSchema = z.object({
  razorpayOrderId: z.string().min(1).max(128),
  razorpayPaymentId: z.string().min(1).max(128),
  razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/i),
  planCode: z.string().min(1),
});

function getCredentials() {
  const keyId = typeof process !== "undefined" ? process.env?.["RAZORPAY_KEY_ID"] : undefined;
  const keySecret =
    typeof process !== "undefined" ? process.env?.["RAZORPAY_KEY_SECRET"] : undefined;

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay checkout is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables.",
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

export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { planCode: string }) => orderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { keyId, keySecret } = getCredentials();
    const planInfo = PLAN_PRICES_PAISE[data.planCode.toLowerCase()];
    if (!planInfo) {
      throw new Error("Invalid plan selected for checkout.");
    }

    const receipt = `onyx_${context.userId.replaceAll("-", "").slice(0, 12)}_${Date.now()}`;
    const authorization = btoa(`${keyId}:${keySecret}`);
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: planInfo.amount,
        currency: CURRENCY,
        receipt,
        notes: { userId: context.userId, planCode: data.planCode },
      }),
    });

    if (!response.ok) {
      console.error("Razorpay order creation failed", response.status, await response.text());
      throw new Error(
        response.status === 401
          ? "Razorpay rejected the API keys. Please verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
          : "Could not start Razorpay checkout. Please try again.",
      );
    }

    const order = z
      .object({
        id: z.string().min(1),
        amount: z.number().int().min(100),
        currency: z.literal(CURRENCY),
      })
      .parse(await response.json());

    return {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      planCode: data.planCode,
      planName: planInfo.name,
    };
  });

export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: any) => paymentVerificationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { keySecret } = getCredentials();
    const message = `${data.razorpayOrderId}|${data.razorpayPaymentId}`;
    const expectedHex = await hmacSha256Hex(keySecret, message);
    const valid = expectedHex.toLowerCase() === data.razorpaySignature.toLowerCase();

    if (!valid) throw new Error("Razorpay payment verification failed: invalid signature.");

    const planInfo = PLAN_PRICES_PAISE[data.planCode.toLowerCase()] || {
      name: data.planCode,
      amount: 0,
    };

    // Write payment record and update user plan in Firestore from server only
    const now = new Date().toISOString();
    const paymentRecord = {
      id: data.razorpayPaymentId,
      userId: context.userId,
      razorpayOrderId: data.razorpayOrderId,
      razorpayPaymentId: data.razorpayPaymentId,
      amount: planInfo.amount / 100,
      plan: planInfo.name,
      planCode: data.planCode,
      status: "captured",
      createdAt: now,
    };

    await adminDb.collection("payments").doc(data.razorpayPaymentId).set(paymentRecord);
    await adminDb
      .collection("users")
      .doc(context.userId)
      .set({ plan: planInfo.name }, { merge: true });

    return { verified: true as const, paymentId: data.razorpayPaymentId, plan: planInfo.name };
  });
