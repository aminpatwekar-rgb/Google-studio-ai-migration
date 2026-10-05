import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { createRazorpayTestOrder, verifyRazorpayTestPayment } from "@/lib/razorpay.functions";

type RazorpayResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayFailure = {
  error?: { description?: string };
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string };
  theme: { color: string };
  handler: (result: RazorpayResult) => void | Promise<void>;
  modal: { ondismiss: () => void };
};

type RazorpayCheckout = {
  open: () => void;
  on: (event: "payment.failed", handler: (failure: RazorpayFailure) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayCheckout;
  }
}

let scriptPromise: Promise<void> | undefined;

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = undefined;
      reject(new Error("Razorpay checkout could not load."));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function SubscriptionSettingsCard() {
  const { profile, user } = useAuth();
  const createOrder = useServerFn(createRazorpayTestOrder);
  const verifyPayment = useServerFn(verifyRazorpayTestPayment);
  const [loading, setLoading] = useState(false);

  const startCheckout = async () => {
    setLoading(true);
    try {
      const [{ keyId, orderId, amount, currency }] = await Promise.all([
        createOrder(),
        loadRazorpayCheckout(),
      ]);
      const Razorpay = window.Razorpay;
      if (!Razorpay) throw new Error("Razorpay checkout could not load.");

      const checkout = new Razorpay({
        key: keyId,
        amount,
        currency,
        name: "ONYX",
        description: "Subscription checkout test",
        order_id: orderId,
        prefill: {
          ...(profile?.full_name ? { name: profile.full_name } : {}),
          ...(user?.email ? { email: user.email } : {}),
        },
        theme: { color: "#111111" },
        modal: { ondismiss: () => setLoading(false) },
        handler: async (result) => {
          try {
            await verifyPayment({
              data: {
                razorpayOrderId: result.razorpay_order_id,
                razorpayPaymentId: result.razorpay_payment_id,
                razorpaySignature: result.razorpay_signature,
              },
            });
            toast.success("Razorpay test payment verified");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Payment verification failed");
          } finally {
            setLoading(false);
          }
        },
      });

      checkout.on("payment.failed", (failure) => {
        toast.error(failure.error?.description || "Razorpay payment failed");
        setLoading(false);
      });
      checkout.open();
    } catch (error) {
      setLoading(false);
      toast.error(error instanceof Error ? error.message : "Could not start Razorpay checkout");
    }
  };

  return (
    <Card className="lift transition-colors duration-200 hover:lift-hover">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>ONYX Subscription</CardTitle>
            <CardDescription>Razorpay is connected in test mode.</CardDescription>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Test
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium">₹1 checkout test</p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Use Razorpay's test payment details to confirm checkout and secure verification. Your
            subscription will not change yet.
          </p>
        </div>
        <Button type="button" onClick={startCheckout} loading={loading} className="shrink-0">
          <CreditCard /> Test checkout
        </Button>
      </CardContent>
    </Card>
  );
}
