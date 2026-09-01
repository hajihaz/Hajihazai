/** Password-reset email adapter. Uses Resend's HTTPS API when configured. */
export interface SendResult { delivered: boolean; provider: "resend" | "none"; }

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn("[email] RESEND_API_KEY/EMAIL_FROM not configured; reset email not delivered");
    return { delivered: false, provider: "none" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Reset your HajiHaz AI password",
        text: `Use this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
        html: `<p>Use the button below to reset your HajiHaz AI password.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error(`[email] Resend rejected email: HTTP ${response.status}`);
      return { delivered: false, provider: "resend" };
    }
    return { delivered: true, provider: "resend" };
  } catch (error) {
    console.error("[email] Resend request failed:", error);
    return { delivered: false, provider: "resend" };
  }
}
