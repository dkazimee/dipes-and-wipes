const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "Dipes & Wipes <orders@dipesandwipes.com>";
const BASE_URL = `https://${process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost"}`;

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log(`[email] RESEND_API_KEY not set — skipping email to ${to}: "${subject}"`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[email] Resend error ${res.status}: ${body}`);
  }
}

export async function sendOrderConfirmation(params: {
  to: string;
  customerName: string;
  orderId: number;
  scheduledDate: string;
  diaperSize?: string | null;
  totalCents?: number | null;
  shippingName?: string | null;
  shippingAddress1?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingZip?: string | null;
}): Promise<void> {
  const { to, customerName, orderId, scheduledDate, diaperSize, totalCents, shippingName, shippingAddress1, shippingCity, shippingState, shippingZip } = params;

  const totalStr = totalCents != null ? `$${(totalCents / 100).toFixed(2)}` : null;
  const addressLines = [shippingName, shippingAddress1, `${shippingCity ?? ""}, ${shippingState ?? ""} ${shippingZip ?? ""}`.trim()]
    .filter(Boolean).join("<br>");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3fc;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3fc;padding:40px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
        <tr><td style="background:#2d9e8f;padding:28px 32px">
          <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700">Dipes &amp; Wipes</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:14px">Order confirmed</p>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:16px;color:#161f3a">Hi ${customerName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#5a6899;line-height:1.5">
            Thanks for your order! We've received it and will ship it by <strong style="color:#161f3a">${scheduledDate}</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3fc;border-radius:12px;padding:20px;margin-bottom:24px">
            <tr><td style="font-size:12px;color:#5a6899;text-transform:uppercase;letter-spacing:.06em;font-weight:600;padding-bottom:12px">Order summary</td></tr>
            <tr><td style="font-size:14px;color:#161f3a;padding-bottom:6px"><strong>Order #${orderId}</strong></td></tr>
            ${diaperSize ? `<tr><td style="font-size:14px;color:#5a6899;padding-bottom:6px">Diaper size: ${diaperSize}</td></tr>` : ""}
            ${totalStr ? `<tr><td style="font-size:15px;color:#2d9e8f;font-weight:700;padding-bottom:6px">${totalStr}</td></tr>` : ""}
            ${addressLines ? `<tr><td style="font-size:13px;color:#5a6899;padding-top:8px;border-top:1px solid #e8e4f5">${addressLines}</td></tr>` : ""}
          </table>
          <p style="margin:0 0 8px;font-size:14px;color:#5a6899">We'll send you another email with tracking details once your order ships.</p>
          <a href="${BASE_URL}/orders" style="display:inline-block;margin-top:16px;background:#2d9e8f;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600">View your orders</a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f0eef8;font-size:12px;color:#9896b0;text-align:center">
          © 2026 Dipes &amp; Wipes · <a href="${BASE_URL}" style="color:#2d9e8f;text-decoration:none">dipesandwipes.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(to, `Order #${orderId} confirmed — ships ${scheduledDate}`, html);
}

export async function sendShippingNotification(params: {
  to: string;
  customerName: string;
  orderId: number;
  trackingNumber: string;
  carrier: string;
  shippingName?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
}): Promise<void> {
  const { to, customerName, orderId, trackingNumber, carrier, shippingName, shippingCity, shippingState } = params;

  const carrierTrackingUrls: Record<string, string> = {
    USPS: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    UPS: `https://www.ups.com/track?tracknum=${trackingNumber}`,
    FedEx: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    DHL: `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${trackingNumber}`,
    OnTrac: `https://www.ontrac.com/tracking/?number=${trackingNumber}`,
  };
  const trackingUrl = carrierTrackingUrls[carrier] ?? `https://www.google.com/search?q=${carrier}+tracking+${trackingNumber}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3fc;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3fc;padding:40px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
        <tr><td style="background:#2d9e8f;padding:28px 32px">
          <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700">Dipes &amp; Wipes</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:14px">Your order is on its way!</p>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:16px;color:#161f3a">Hi ${customerName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#5a6899;line-height:1.5">
            Great news — order <strong style="color:#161f3a">#${orderId}</strong> has shipped
            ${shippingName ? ` to <strong style="color:#161f3a">${shippingName}</strong>` : ""}
            ${shippingCity ? ` in ${shippingCity}${shippingState ? ", " + shippingState : ""}` : ""}.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3fc;border-radius:12px;padding:20px;margin-bottom:24px">
            <tr><td style="font-size:12px;color:#5a6899;text-transform:uppercase;letter-spacing:.06em;font-weight:600;padding-bottom:12px">Tracking details</td></tr>
            <tr><td style="font-size:14px;color:#5a6899;padding-bottom:4px">Carrier</td></tr>
            <tr><td style="font-size:15px;color:#161f3a;font-weight:600;padding-bottom:12px">${carrier}</td></tr>
            <tr><td style="font-size:14px;color:#5a6899;padding-bottom:4px">Tracking number</td></tr>
            <tr><td style="font-size:15px;color:#161f3a;font-weight:600;font-family:monospace">${trackingNumber}</td></tr>
          </table>
          <a href="${trackingUrl}" style="display:inline-block;background:#2d9e8f;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600">Track your package →</a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f0eef8;font-size:12px;color:#9896b0;text-align:center">
          © 2026 Dipes &amp; Wipes · <a href="${BASE_URL}" style="color:#2d9e8f;text-decoration:none">dipesandwipes.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail(to, `Your Dipes & Wipes order #${orderId} has shipped — ${carrier} ${trackingNumber}`, html);
}
