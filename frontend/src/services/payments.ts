

export interface PaymentOrder {
  razorpay_order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}

export interface PaymentVerification {
  booking_id: string;
  booking_status: string;
  payment_status: string;
  message: string;
}

export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpaySuccess) => void;
  modal?: {
    ondismiss?: () => void;
  };
  theme?: {
    color: string;
  };
}

export interface RazorpayInstance {
  open: () => void;
  on: (
    event: string,
    callback: (response: unknown) => void
  ) => void;
}

declare global {
  interface Window {
    Razorpay?: new (
      options: RazorpayOptions
    ) => RazorpayInstance;
  }
}

async function readResponse<T>(
  response: Response
): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (HTTP ${response.status})`;

    try {
      const data: { detail?: unknown } =
        await response.json();

      if (typeof data.detail === "string") {
        message = data.detail;
      }
    } catch {
      // Preserve the HTTP error.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function createPaymentOrder(
  bookingId: string
): Promise<PaymentOrder> {
  const response = await fetch(
    "/api/v1/payments/orders",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        booking_id: bookingId,
      }),
    }
  );

  return readResponse<PaymentOrder>(response);
}

export async function verifyPayment(
  payment: RazorpaySuccess
): Promise<PaymentVerification> {
  const response = await fetch(
    "/api/v1/payments/verify",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payment),
    }
  );

  return readResponse<PaymentVerification>(response);
}

export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<
      HTMLScriptElement
    >('script[data-razorpay-checkout="true"]');

    if (existing) {
      existing.addEventListener(
        "load",
        () => resolve(),
        { once: true }
      );

      existing.addEventListener(
        "error",
        () => reject(
          new Error("Unable to load Razorpay Checkout.")
        ),
        { once: true }
      );

      return;
    }

    const script = document.createElement("script");

    script.src =
      "https://checkout.razorpay.com/v1/checkout.js";

    script.async = true;
    script.dataset.razorpayCheckout = "true";

    script.onload = () => resolve();

    script.onerror = () => {
      script.remove();
      reject(
        new Error(
          "Unable to load Razorpay Checkout."
        )
      );
    };

    document.body.appendChild(script);
  });
}
