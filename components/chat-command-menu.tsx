"use client";

import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { FileText, Folder, ImagePlus, Keyboard, Laptop, MessageSquare, Plus, Search, Sparkles } from "lucide-react";

type Conversation = { id: string; title: string; updatedAt?: string | null; archived?: boolean };
type Project = { id: string; name: string; isSystem?: boolean };
const itemStyle = "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm outline-none data-[selected=true]:bg-accent";
const groupStyle = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground";

/** Independent HajiHaz AI command navigation, using MIT-licensed cmdk primitives. */
export default function ChatCommandMenu({
  open, onOpenChange, conversations, projects, onNewChat, onOpenChat,
  onOpenProject, onFiles, onImages, onComputer, onFocusComposer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: Conversation[];
  projects: Project[];
  onNewChat: () => void;
  onOpenChat: (id: string) => void;
  onOpenProject: (id: string) => void;
  onFiles: () => void;
  onImages: () => void;
  onComputer: () => void;
  onFocusComposer: () => void;
}) {
  const [query, setQuery] = useState("");
  const recent = useMemo(() => [...conversations]
    .filter((item) => !item.archived)
    .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
    .slice(0, 80), [conversations]);
  const close = (action: () => void) => { onOpenChange(false); setQuery(""); action(); };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => { onOpenChange(next); if (!next) setQuery(""); }}
      label="Search HajiHaz AI"
      loop
      vimBindings={false}
      className="w-full overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-2xl"
      overlayClassName="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[3px]"
      contentClassName="fixed left-1/2 top-[min(15vh,110px)] z-[71] w-[calc(100%-24px)] max-w-xl -translate-x-1/2 rounded-2xl outline-none"
    >
      <div className="flex items-center gap-3 border-b px-4">
        <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <Command.Input autoFocus value={query} onValueChange={setQuery}
          aria-label="Search conversations, projects and actions"
          placeholder="Search chats, projects or actions…"
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" />
        <kbd className="hidden rounded-md border px-2 py-1 text-[11px] text-muted-foreground sm:block">Esc</kbd>
      </div>
      <Command.List className="max-h-[min(62vh,420px)] overflow-y-auto overscroll-contain p-2">
        <Command.Empty className="px-4 py-10 text-center text-sm text-muted-foreground">
          No matches. Try another title or project.
        </Command.Empty>
        <Command.Group heading="Quick actions" className={groupStyle}>
          <Command.Item value="new chat start conversation" onSelect={() => close(onNewChat)} className={itemStyle}>
            <Plus className="size-4 shrink-0" /> New chat <span className="ml-auto text-xs text-muted-foreground">⌘N</span>
          </Command.Item>
          <Command.Item value="focus message composer type prompt" onSelect={() => close(onFocusComposer)} className={itemStyle}>
            <Sparkles className="size-4 shrink-0" /> Write a message <span className="ml-auto text-xs text-muted-foreground">/</span>
          </Command.Item>
          <Command.Item value="attach files upload documents library" onSelect={() => close(onFiles)} className={itemStyle}>
            <FileText className="size-4 shrink-0" /> File library
          </Command.Item>
          <Command.Item value="create generate image" onSelect={() => close(onImages)} className={itemStyle}>
            <ImagePlus className="size-4 shrink-0" /> Create image
          </Command.Item>
          <Command.Item value="computer Mac HHC devices" onSelect={() => close(onComputer)} className={itemStyle}>
            <Laptop className="size-4 shrink-0" /> My computer
          </Command.Item>
        </Command.Group>
        {projects.some((project) => !project.isSystem) && (
          <Command.Group heading="Projects" className={groupStyle}>
            {projects.filter((project) => !project.isSystem).slice(0, 30).map((project) => (
              <Command.Item key={project.id} value={"project " + project.name + " " + project.id}
                onSelect={() => close(() => onOpenProject(project.id))} className={itemStyle}>
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {recent.length > 0 && (
          <Command.Group heading="Conversations" className={groupStyle}>
            {recent.map((conversation) => (
              <Command.Item key={conversation.id} value={"chat " + conversation.title + " " + conversation.id}
                onSelect={() => close(() => onOpenChat(conversation.id))} className={itemStyle}>
                <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><Keyboard className="size-3.5" /> ↑ ↓ navigate · Enter open</span>
        <span>Only your chats and projects</span>
      </div>
    </Command.Dialog>
  );
}
