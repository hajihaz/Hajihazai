import Link from "next/link";

export const metadata = { title: "Privacy Policy | HajiHaz AI" };

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-5 py-12 text-sm leading-7 text-foreground">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">HajiHaz AI</p>
      <h1 className="mb-2 text-3xl font-semibold">Privacy Policy</h1>
      <p className="mb-8 text-muted-foreground">Effective date: September 16, 2026</p>
      <p>HajiHaz AI is an AI assistant provided by HajiHaz. This Privacy Policy explains what information HajiHaz AI accesses, collects, uses, stores, and shares when you use the HajiHaz AI website or Android app.</p>

      <h2 className="mt-8 text-xl font-semibold">Information we collect</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li><b>Account information:</b> name, email address, profile information, and authentication information needed to create and maintain your account.</li>
        <li><b>Google sign-in information:</b> when you choose Google sign-in, Google provides the account information required to authenticate you. HajiHaz AI does not receive your Google password.</li>
        <li><b>Chats and content:</b> messages, conversation history, projects, uploaded knowledge, saved memories, feedback, and related content that you choose to submit.</li>
        <li><b>Security and operational data:</b> session information, rate-limit information, error information, and limited request metadata used to secure and operate the service.</li>
        <li><b>Preferences:</b> limited device-local preferences such as the selected theme may be stored locally in your browser or app WebView.</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">How we use information</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Provide authentication, conversations, memory, knowledge, projects, and other requested HajiHaz AI features.</li>
        <li>Process your prompts and content through the AI services required to generate responses and related features.</li>
        <li>Provide web search, embeddings, notifications, password recovery, security controls, and service administration where enabled.</li>
        <li>Prevent abuse, enforce rate limits, troubleshoot failures, maintain security, and improve reliability.</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">Service providers and sharing</h2>
      <p>We do not sell personal information. Information may be shared with service providers only as needed to operate requested features. Depending on the feature and production configuration, these providers can include Google for authentication, Neon for database hosting, Vercel for application hosting, email providers for transactional email, and AI/search providers for AI generation, embeddings, or live-search features. Provider handling is subject to their applicable terms and privacy practices.</p>
      <p className="mt-3">Prompts or other content sent to an external AI provider are sent only when required by the selected feature or server-side routing configuration. Secrets and provider API keys are kept server-side and are not intentionally exposed to users.</p>

      <h2 className="mt-8 text-xl font-semibold">Security</h2>
      <p>HajiHaz AI uses HTTPS for network transport and applies authentication, authorization, ownership checks, rate limiting, input limits, and server-side protection for account and application data. No online service can guarantee absolute security.</p>

      <h2 className="mt-8 text-xl font-semibold">Retention and deletion</h2>
      <p>Your account data and user-owned application content are retained while your account is active so the service can provide its features. You can delete individual conversations, memories, projects, knowledge items, and messages where those controls are provided. You can also request deletion of your account and associated user data.</p>
      <p className="mt-3">To delete your HajiHaz AI account, sign in and use the account deletion control at <Link className="underline" href="/delete-account">Delete Account</Link>. Account deletion removes the account and associated user-owned records from the HajiHaz AI database, subject to technical backups and any information that must be retained for security or legal obligations.</p>

      <h2 className="mt-8 text-xl font-semibold">Children</h2>
      <p>HajiHaz AI is not directed to children under 13, and we do not knowingly collect personal information from children under 13.</p>

      <h2 className="mt-8 text-xl font-semibold">Changes</h2>
      <p>We may update this Privacy Policy when our service or legal requirements change. The effective date above will be updated when material changes are made.</p>

      <h2 className="mt-8 text-xl font-semibold">Contact</h2>
      <p>Privacy questions or requests can be sent to <a className="underline" href="mailto:iamhajihaz@gmail.com">iamhajihaz@gmail.com</a>.</p>
      <p className="mt-10"><Link className="underline" href="/">Back to HajiHaz AI</Link></p>
    </main>
  );
}
