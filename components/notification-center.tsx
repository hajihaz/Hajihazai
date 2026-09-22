"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, X } from "lucide-react";

type NotificationItem = {
  id: string;
  notificationId: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
};

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationCenter() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount ?? 0));
    } catch {
      // Notification refresh is best effort and never blocks chat.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function markRead(id: string) {
    const current = items.find((item) => item.id === id);
    if (!current || current.isRead) return;
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      void load();
    }
  }

  async function markAllRead() {
    if (!unreadCount) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((item) => ({ ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() })));
        setUnreadCount(0);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative shrink-0" ref={panelRef}>
      <button
        type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        title="Notifications"
        onClick={() => setOpen((value) => !value)}
        className="relative flex size-10 items-center justify-center rounded-lg border text-muted-foreground hover:bg-accent hover:text-foreground sm:size-9"
      >
        <Bell className="size-4" />
        {unreadCount > 0 ? (
          <span aria-hidden="true" className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-xl border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-[11px] text-muted-foreground">{unreadCount ? `${unreadCount} unread` : "All caught up"}</p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 ? (
                <button type="button" onClick={() => void markAllRead()} disabled={loading} className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40" aria-label="Mark all notifications as read" title="Mark all as read">
                  <CheckCheck className="size-4" />
                </button>
              ) : null}
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close notifications">
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Bell className="mx-auto size-7 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Updates from HajiHaz AI will appear here.</p>
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void markRead(item.id)}
                  className={`flex w-full gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent/60 ${item.isRead ? "" : "bg-accent/30"}`}
                >
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.isRead ? "bg-transparent" : "bg-primary"}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className={`text-sm ${item.isRead ? "font-medium" : "font-semibold"}`}>{item.title}</span>
                      {item.isRead ? <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /> : null}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.message}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground/80">{relativeTime(item.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
