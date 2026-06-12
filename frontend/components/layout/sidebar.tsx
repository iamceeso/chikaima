"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Cog,
  FolderKanban,
  LayoutDashboard,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import type { Conversation } from "@/types";
import { useChatStore } from "@/store/chat-store";

const navItems = [
  { href: "/chat", label: "New Chat", icon: MessageSquarePlus },
  { href: "/library", label: "Library", icon: LayoutDashboard },
  { href: "/processing", label: "Processing", icon: FolderKanban },
];

const settingsItems = [
  { href: "/settings/workspace", label: "Workspace", icon: Cog, adminOnly: false },
  { href: "/settings/models", label: "Models", icon: Sparkles, adminOnly: true },
  { href: "/settings/providers", label: "Providers", icon: Settings, adminOnly: true },
  { href: "/settings/users", label: "Users", icon: FolderKanban, adminOnly: true },
];

export function Sidebar({
  pathname,
  collapsed = false,
  mobile = false,
  onClose,
  onToggleCollapse,
}: {
  pathname: string;
  collapsed?: boolean;
  mobile?: boolean;
  onClose?: () => void;
  onToggleCollapse?: () => void;
}) {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const { hasAdminAccess } = useAdminAccess();
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const openFreshChat = useChatStore((state) => state.openFreshChat);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);
  const queryClient = useQueryClient();
  const [conversationPendingDelete, setConversationPendingDelete] = useState<Conversation | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => {
      if (!token) {
        return Promise.resolve([]);
      }
      return api.getConversations(token);
    },
  });
  const selectedConversationId = activeConversationId ?? conversationsQuery.data?.[0]?.id;
  const [settingsOpen, setSettingsOpen] = useState(pathname.startsWith("/settings"));
  const deleteConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      await api.deleteConversation(token, conversationId);
    },
    onMutate: async (conversationId: string) => {
      await queryClient.cancelQueries({ queryKey: ["conversations"] });
      const previousConversations = queryClient.getQueryData<Conversation[]>(["conversations"]) ?? [];
      setDeletingConversationId(conversationId);

      queryClient.setQueryData<Conversation[]>(["conversations"], (current = []) =>
        current.filter((conversation) => conversation.id !== conversationId),
      );

      if (selectedConversationId === conversationId) {
        openFreshChat();
      }

      setConversationPendingDelete(null);
      return { previousConversations };
    },
    onError: (_error, _conversationId, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(["conversations"], context.previousConversations);
      }
      setDeletingConversationId(null);
    },
    onSettled: async () => {
      setDeletingConversationId(null);
      deleteConversation.reset();
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col rounded-none border border-border bg-background-secondary/55 p-3 transition-all xl:h-screen xl:p-4",
        collapsed && !mobile ? "xl:w-22" : "xl:w-67",
      )}
    >
      <div
        className={cn(
          "mb-4 flex items-center rounded-2xl px-2 py-1.5",
          collapsed && !mobile ? "justify-center" : "gap-3",
        )}
      >
        {!collapsed || mobile ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Image
              src="/olanma-logo.png"
              alt="Olanma logo"
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 object-contain"
              priority
            />
            <p className="truncate text-xs font-semibold uppercase tracking-[0.24em] text-foreground">OLANMA</p>
          </div>
        ) : (
          <div className="flex flex-1 justify-center">
            <Image
              src="/olanma-logo.png"
              alt="Olanma logo"
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
              priority
            />
          </div>
        )}
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden h-9 w-9 items-center justify-center rounded-xl bg-surface text-foreground-muted transition hover:bg-surface/70 hover:text-foreground xl:flex"
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (item.href === "/chat") {
                  openFreshChat();
                }
                setSettingsOpen(false);
                onClose?.();
              }}
              className={cn(
                "group flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[11px] transition-colors duration-150",
                collapsed && !mobile ? "justify-center px-1.5" : "",
                active
                  ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(20,32,25,0.04)] dark:shadow-none"
                  : "text-foreground-muted hover:bg-surface/70 hover:text-foreground",
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg border border-transparent transition-colors",
                  active
                    ? "bg-background-secondary text-foreground dark:bg-surface-strong"
                    : "bg-transparent text-foreground-muted group-hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              {!collapsed || mobile ? (
                <div className="flex flex-1 items-center justify-between">
                  <span className={cn("font-medium", active ? "text-foreground" : "")}>{item.label}</span>
                  {active ? <ChevronRight className="h-3.5 w-3.5 text-muted" /> : null}
                </div>
              ) : null}
            </Link>
          );
        })}

        <div className="pt-1">
          <button
            type="button"
              onClick={() => setSettingsOpen((value) => !value)}
              className={cn(
                "group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[11px] transition-colors duration-150",
                collapsed && !mobile ? "justify-center px-1.5" : "",
                settingsOpen
                  ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(20,32,25,0.04)] dark:shadow-none"
                : "text-foreground-muted hover:bg-surface/70 hover:text-foreground",
            )}
          >
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg border border-transparent transition-colors",
                settingsOpen
                  ? "bg-background-secondary text-foreground dark:bg-surface-strong"
                  : "bg-transparent text-foreground-muted group-hover:text-foreground",
              )}
            >
              <Settings className="h-4 w-4" />
            </div>
            {!collapsed || mobile ? (
              <div className="flex flex-1 items-center justify-between">
                <span className={cn("font-medium", settingsOpen ? "text-foreground" : "")}>Settings</span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform", settingsOpen ? "rotate-180" : "")} />
              </div>
            ) : null}
          </button>

          {(!collapsed || mobile) && settingsOpen ? (
            <div className="mt-2 space-y-1 pl-4">
              {settingsItems
                .filter((item) => !item.adminOnly || hasAdminAccess)
                .map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                        href={item.href}
                        onClick={() => {
                          onClose?.();
                        }}
                        className={cn(
                        "flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[11px] transition-colors duration-150",
                        active
                          ? "bg-background text-foreground"
                          : "text-foreground-muted hover:bg-surface/70 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="font-medium">
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
            </div>
          ) : null}
        </div>
      </nav>

      {!collapsed || mobile ? (
        <div className="mt-auto min-h-0 border-t border-border pt-4">
          <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Recents</div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {conversationsQuery.data?.map((item) => {
              const active = pathname === "/chat" && selectedConversationId === item.id;
              return (
                <div
                  key={item.id}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setConversationPendingDelete(item);
                  }}
                  className={cn(
                    "group flex items-start gap-2 rounded-2xl px-3 py-2 transition-colors duration-150",
                    active
                      ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(20,32,25,0.04)] dark:shadow-none"
                      : "text-foreground-muted hover:bg-surface/70 hover:text-foreground",
                  )}
                >
                  <Link
                    href="/chat"
                    onClick={() => {
                      setActiveConversationId(item.id);
                      onClose?.();
                    }}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate text-xs font-medium">{item.title}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {item.messages?.at(-1)?.content ?? "No messages yet"}
                    </p>
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete ${item.title}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setConversationPendingDelete(item);
                    }}
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity",
                      active
                        ? "text-foreground-muted hover:bg-background"
                        : "text-foreground-muted hover:bg-background/80 group-hover:opacity-100",
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {!conversationsQuery.data?.length ? (
              <div className="rounded-2xl border border-dashed border-border px-3 py-4 text-xs text-foreground-muted">
                No chats yet
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <AlertDialog
        open={Boolean(conversationPendingDelete)}
        onOpenChange={(open) => {
          if (!open && deletingConversationId !== conversationPendingDelete?.id) {
            setConversationPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              {conversationPendingDelete
                ? `This will remove "${conversationPendingDelete.title}" and all messages in that analysis.`
                : "This analysis will be removed from your recent chats."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="border border-border"
              disabled={deletingConversationId === conversationPendingDelete?.id}
              onClick={() => setConversationPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deletingConversationId !== null || !conversationPendingDelete}
              onClick={() => {
                if (!conversationPendingDelete) {
                  return;
                }
                deleteConversation.mutate(conversationPendingDelete.id);
              }}
            >
              {deletingConversationId === conversationPendingDelete?.id ? "Deleting..." : "Delete chat"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </aside>
  );
}
