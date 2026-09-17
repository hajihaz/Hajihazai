"use client";

import {
  BriefcaseBusiness,
  ExternalLink,
  GraduationCap,
  Instagram,
  Mail,
  MapPin,
  Sparkles,
  Target,
} from "lucide-react";

export interface ProfileCardData {
  fullName: string;
  preferredName: string;
  occupation: string;
  currentDegree: string;
  institution: string;
  location: string;
  businesses: string[];
  goals: string[];
  photoUrl?: string | null;
  instagramHandle?: string;
  instagramUrl?: string;
  contactEmail?: string;
}

export function ProfileCard({ data }: { data: ProfileCardData }) {
  return (
    <article className="my-3 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="h-1.5 bg-gradient-to-r from-violet-500 via-indigo-500 to-fuchsia-500" />
      <div className="p-3 sm:p-4">
        <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border bg-muted shadow-sm">
            {data.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.photoUrl}
                alt={`${data.preferredName} portrait`}
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-500 text-5xl text-white">
                {data.preferredName[0]?.toUpperCase() ?? "H"}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-10 text-white">
              <p className="text-xl font-semibold">{data.preferredName}</p>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/70">Build · Learn · Create</p>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-2xl font-bold tracking-tight">{data.preferredName}</h3>
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white">✓</span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{data.fullName}</p>
            <p className="mt-1 font-medium">{data.occupation}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5" /> {data.location}
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <InfoBlock icon={<GraduationCap className="size-4" />} title="Education">
                <p className="font-medium">{data.currentDegree}</p>
                <p className="text-[11px] leading-4 text-muted-foreground">{data.institution}</p>
              </InfoBlock>
              <InfoBlock icon={<BriefcaseBusiness className="size-4" />} title="Businesses">
                <ul className="space-y-1 text-xs">
                  {data.businesses.map((b) => <li key={b}>• {b}</li>)}
                </ul>
              </InfoBlock>
              <InfoBlock icon={<Target className="size-4" />} title="Goals">
                <ul className="space-y-1 text-xs">
                  {data.goals.map((g) => <li key={g}>• {g}</li>)}
                </ul>
              </InfoBlock>
              <InfoBlock icon={<Sparkles className="size-4" />} title="Interests">
                <p className="text-xs leading-5">Law · Business · Technology · Investing · Fitness · Growth</p>
              </InfoBlock>
            </div>
          </div>
        </div>

        {(data.instagramHandle || data.contactEmail) && (
          <div className="mt-3 grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-2">
            {data.instagramHandle && data.instagramUrl ? (
              <a href={data.instagramUrl} target="_blank" rel="noreferrer noopener" className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-2 transition-colors hover:bg-accent">
                <Instagram className="size-5 shrink-0 text-fuchsia-500" />
                <span className="min-w-0 flex-1"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Instagram</span><span className="block truncate text-sm font-semibold">@{data.instagramHandle}</span></span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              </a>
            ) : null}
            {data.contactEmail ? (
              <a href={`mailto:${data.contactEmail}`} className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-2 transition-colors hover:bg-accent">
                <Mail className="size-5 shrink-0 text-violet-600" />
                <span className="min-w-0 flex-1"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Contact / Collaborate</span><span className="block truncate text-sm font-semibold">{data.contactEmail}</span></span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              </a>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}

function InfoBlock({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-muted/50 px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

/** Returns true if the message is asking for a personal profile card. */
export function isProfileCardQuery(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return (
    /^who (is|are) haji/i.test(lower) ||
    /^(tell me |)about haji/i.test(lower) ||
    /^introduce haji/i.test(lower) ||
    /^(show|give) (me |)(haji('s|s)? )?profile/i.test(lower) ||
    lower === "haji" ||
    /^haji (who|info|details|profile)/i.test(lower)
  );
}

/** Default profile data — overridden if knowledge base data is available. */
export const DEFAULT_PROFILE: ProfileCardData = {
  fullName: "Syed Hasan Kuddos Sahib",
  preferredName: "Haji",
  occupation: "Entrepreneur & Law Student",
  currentDegree: "LLB (Hons)",
  institution: "SRM School of Law, SRM Institute of Science and Technology",
  location: "Chennai, Tamil Nadu, India",
  businesses: ["Suplaykart (B2B FMCG SaaS)", "AllBee Solutions (Digital Agency)"],
  goals: [
    "Relaunch and stabilise Suplaykart",
    "Become a Corporate Lawyer",
    "Build a lasting legacy",
  ],
  photoUrl: "/branding/haji-profile.jpg",
  instagramHandle: "hajihaz",
  instagramUrl: "https://www.instagram.com/hajihaz/",
  contactEmail: "iamhajihaz@gmail.com",
};
