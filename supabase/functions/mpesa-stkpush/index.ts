// Supabase Edge Function: mpesa-stkpush (EDHAFU PAYROLL)
// Charges a SUBSCRIBER (account EP2050, EP2051 ...) for a plan covering all companies they own.
// Price comes from the database, never the browser.
// Deploy: npx supabase functions deploy mpesa-stkpush

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = Deno.env.get("MPESA_ENV") === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getToken(): Promise<string> {
  const key = Deno.env.get("MPESA_CONSUMER_KEY")!;
  const secret = Deno.env.get("MPESA_CONSUMER_SECRET")!;
  const res = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: "Basic " + btoa(`${key}:${secret}`) },
  });
  if (!res.ok) throw new Error("M-Pesa auth failed: " + (await res.text()));
  return (await res.json()).access_token;
}

function timestamp(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return d.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function normalisePhone(p: string): string {
  let s = String(p ?? "").replace(/\D/g, "");
  if (s.startsWith("0")) s = "254" + s.slice(1);
  if (s.length === 9) s = "254" + s;
  if (!/^254(7|1)\d{8}$/.test(s)) throw new Error("Invalid Safaricom number");
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let recordId: string | null = null;

  try {
    const { tier, phone, first_name, last_name, email, county, company_id } = await req.json();
    if (!tier) throw new Error("tier is required");

    // 1. Who is paying? Billing is per subscriber (the signed-in account)
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: u, error: ue } = await admin.auth.getUser(jwt);
    if (ue || !u.user) throw new Error("Not signed in");
    const userId = u.user.id;

    // 2. Their subscriber account (account number EP2050, EP2051 ...)
    let { data: sub } = await admin.from("subscribers").select("account_number").eq("user_id", userId).maybeSingle();
    if (!sub) {
      const { data: created, error: ce } = await admin.from("subscribers")
        .insert({ user_id: userId, email: u.user.email }).select("account_number").single();
      if (ce || !created) throw new Error("Could not create your subscriber account");
      sub = created;
    }
    const accountRef = sub.account_number;

    // 3. Test plan is for the admin only
    if (tier === "Test" && u.user.email !== Deno.env.get("BILLING_ADMIN_EMAIL")) {
      throw new Error("Unknown plan: Test");
    }

    // 4. Price from the database (all companies this subscriber owns)
    const { data: priceRows, error: pe } = await admin.rpc("compute_subscription_price", {
      p_user_id: userId, p_tier: tier,
    });
    if (pe) throw new Error(pe.message);
    const amount = Math.round(Number(priceRows?.[0]?.amount));
    const employeeCount = priceRows?.[0]?.employee_count ?? null;
    if (!amount || amount < 1) throw new Error("Could not work out the price for this plan");

    const msisdn = normalisePhone(phone);

    // Only link a company the subscriber actually owns (for the contact record)
    let ownedCompanyId: string | null = null;
    if (company_id) {
      const { data: co } = await admin.from("companies").select("id").eq("id", company_id).eq("user_id", userId).maybeSingle();
      if (co) ownedCompanyId = co.id;
    }

    // 5. Save the request BEFORE the phone is prompted
    const { data: rec, error: insErr } = await admin.from("subscription_payments").insert({
      user_id: userId, account_number: accountRef, company_id: ownedCompanyId,
      tier, employee_count: employeeCount, paid_by: userId,
      phone: msisdn, amount, account_reference: accountRef, status: "PENDING",
    }).select("id").single();
    if (insErr || !rec) throw new Error("DB insert failed: " + (insErr?.message ?? "no record"));
    recordId = rec.id;

    // 6. Keep the contact details, as the old form did (not fatal if it fails)
    if (ownedCompanyId) {
      const { error: reqErr } = await admin.from("subscription_requests").insert({
        company_id: ownedCompanyId, requested_tier: tier, first_name: first_name ?? "", last_name: last_name ?? "",
        email: email ?? u.user.email ?? "", phone: msisdn, county: county ?? "", status: "Awaiting M-Pesa payment",
      });
      if (reqErr) console.error("subscription_requests insert failed:", reqErr.message);
    }

    // 7. Send the STK push
    const shortcode = Deno.env.get("MPESA_SHORTCODE")!;
    const passkey = Deno.env.get("MPESA_PASSKEY")!;
    const ts = timestamp();
    const payload = {
      BusinessShortCode: shortcode,
      Password: btoa(shortcode + passkey + ts),
      Timestamp: ts,
      TransactionType: Deno.env.get("MPESA_TXN_TYPE") ?? "CustomerPayBillOnline",
      Amount: amount,
      PartyA: msisdn,
      PartyB: Deno.env.get("MPESA_PARTYB") ?? shortcode,
      PhoneNumber: msisdn,
      CallBackURL: Deno.env.get("MPESA_CALLBACK_URL")!,
      AccountReference: accountRef,
      TransactionDesc: "Payroll plan",
    };

    const token = await getToken();
    const res = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ResponseCode !== "0") {
      throw new Error(data.errorMessage ?? data.ResponseDescription ?? "STK push rejected");
    }

    // 8. Link Safaricom's IDs so the callback can find the record
    const { error: updErr } = await admin.from("subscription_payments").update({
      merchant_request_id: data.MerchantRequestID,
      checkout_request_id: data.CheckoutRequestID,
      updated_at: new Date().toISOString(),
    }).eq("id", recordId);
    if (updErr) console.error("Could not attach CheckoutRequestID", recordId, updErr.message);

    return Response.json(
      { ok: true, checkout_request_id: data.CheckoutRequestID, amount, account_number: accountRef, message: data.CustomerMessage },
      { headers: cors },
    );
  } catch (e) {
    const msg = (e as Error).message;
    if (recordId) {
      await admin.from("subscription_payments")
        .update({ status: "FAILED", result_desc: msg, updated_at: new Date().toISOString() })
        .eq("id", recordId).eq("status", "PENDING");
    }
    return Response.json({ ok: false, error: msg }, { status: 400, headers: cors });
  }
});
