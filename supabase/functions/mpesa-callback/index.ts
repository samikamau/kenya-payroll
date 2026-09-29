// Supabase Edge Function: mpesa-callback (EDHAFU PAYROLL, same logic as SACCO)
// Safaricom posts the payment result here. Safaricom sends no Supabase login,
// so deploy with: supabase functions deploy mpesa-callback --no-verify-jwt
// Protection: a secret token in the callback URL (?token=...).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ACK = () => Response.json({ ResultCode: 0, ResultDesc: "Accepted" });

// "20260928101112" (Kenya time) -> ISO timestamp
function toIso(v: unknown): string | null {
  const s = String(v ?? "");
  if (s.length !== 14) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}+03:00`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== Deno.env.get("MPESA_CALLBACK_TOKEN")) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return ACK(); }

  const cb = body?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return ACK();

  const items: { Name: string; Value?: unknown }[] = cb.CallbackMetadata?.Item ?? [];
  const get = (n: string) => items.find((i) => i.Name === n)?.Value;

  const status = cb.ResultCode === 0 ? "SUCCESS"
    : cb.ResultCode === 1032 ? "CANCELLED"   // user cancelled on phone
    : "FAILED";                              // e.g. 1 insufficient funds, 1037 timeout, 2001 wrong PIN

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Only update rows still PENDING (Safaricom can retry callbacks)
  const { data: txn } = await admin
    .from("subscription_payments")
    .update({
      status,
      result_code: cb.ResultCode,
      result_desc: cb.ResultDesc,
      mpesa_receipt: get("MpesaReceiptNumber") ?? null,
      mpesa_amount: get("Amount") ?? null,
      transaction_date: toIso(get("TransactionDate")),
      raw_callback: body,
      updated_at: new Date().toISOString(),
    })
    .eq("checkout_request_id", cb.CheckoutRequestID)
    .eq("status", "PENDING")
    .select("id, status")
    .maybeSingle();

  if (txn?.status === "SUCCESS") {
    const { error } = await admin.rpc("apply_subscription_payment", { p_txn_id: txn.id });
    if (error) console.error("apply_subscription_payment failed", error.message);
  }

  return ACK();
});
