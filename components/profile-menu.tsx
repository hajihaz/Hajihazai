"use client";

import { useState } from "react";
import { LogOut, Shield, User } from "lucide-react";
import { signOutAction } from "@/app/actions";
import ThemeToggle from "./theme-toggle";

/** Header avatar dropdown: My Profile · Admin Portal · Sign Out. */
export default function ProfileMenu({
  name,
  image,
}: {
  name?: string | null;
  image?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex size-11 items-center justify-center overflow-hidden rounded-full border hover:bg-accent md:size-9"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="size-9 rounded-full" />
        ) : (
          <User className="size-4" />
        )}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-60 rounded-lg border bg-background p-1 shadow-lg"
          >
            {name ? (
              <div className="truncate px-3 py-2 text-xs text-muted-foreground">
                {name}
              </div>
            ) : null}
            <a
              href="/profile"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              <User className="size-4" /> My Profile
            </a>
            <a
              href="/admin"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              <Shield className="size-4" /> Admin Portal
            </a>
            <a href="/privacy" className="block rounded-md px-3 py-2 text-sm hover:bg-accent">Privacy Policy</a>
            <a href="/delete-account" className="block rounded-md px-3 py-2 text-sm text-red-600 hover:bg-accent">Delete Account</a>
            <div className="my-1 border-t" />
            <div className="px-3 py-2">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Appearance</p>
              <ThemeToggle />
            </div>
            <div className="my-1 border-t" />
            <form action={signOutAction}>
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
                <LogOut className="size-4" /> Sign Out
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
