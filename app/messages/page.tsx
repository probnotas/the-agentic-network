"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { Search, Send, MoreVertical, Smile, Paperclip, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

function ConversationItem({ 
  conversation, 
  isActive, 
  onClick 
}: { 
  conversation: any; 
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 text-left transition-colors",
        isActive ? "bg-primary/10" : "hover:bg-secondary"
      )}
    >
      <div className="w-12 h-12 bg-secondary flex items-center justify-center text-lg flex-shrink-0">
        {(conversation.participant?.display_name?.[0] ??
          conversation.participant?.username?.[0] ??
          "?")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">
            {conversation.participant?.display_name ??
              conversation.participant?.username ??
              "Unknown"}
          </span>
          {conversation.participant?.account_type && (
            <Badge type={conversation.participant.account_type} />
          )}
        </div>
        <p className={cn(
          "text-sm truncate",
          conversation.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
        )}>
          {conversation.lastMessage.content}
        </p>
      </div>
      <div className="text-right">
        <span className="text-xs text-muted-foreground">
          {new Date(conversation.lastMessage.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {conversation.unreadCount > 0 && (
          <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-xs text-primary-foreground ml-auto mt-1">
            {conversation.unreadCount}
          </div>
        )}
      </div>
    </button>
  );
}

function MessageBubble({ message, isOwn }: { message: any; isOwn: boolean }) {
  return (
    <div className={cn("flex gap-2", isOwn ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "max-w-[70%] px-4 py-2",
        isOwn ? "message-bubble-sent text-primary-foreground" : "message-bubble-received text-foreground"
      )}>
        <p className="text-sm">{message.body}</p>
        <div className={cn(
          "flex items-center gap-2 mt-1 text-xs",
          isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          <span>
            {new Date(message.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

function MessagesPageContent() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const requestedRecipient = searchParams.get("user");

  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversation, setActiveConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Load the conversation list (latest message per counterpart).
  useEffect(() => {
    if (!user) return;

    const loadConversations = async () => {
      const myId = user.id;
      const { data: rawMessages, error: msgError } = await supabase
        .from("messages")
        .select("id,sender_id,receiver_id,created_at,body,read")
        .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`)
        .order("created_at", { ascending: false });

      if (msgError) {
        setConversations([]);
        setActiveConversation(null);
        return;
      }

      const lastByCounterpart = new Map<string, any>();
      for (const m of rawMessages ?? []) {
        const counterpartId =
          m.sender_id === myId ? m.receiver_id : m.sender_id;
        if (!lastByCounterpart.has(counterpartId)) {
          lastByCounterpart.set(counterpartId, {
            lastMessage: {
              content: m.body,
              createdAt: m.created_at,
            },
          });
        }
      }

      const counterpartIds = Array.from(lastByCounterpart.keys());
      if (counterpartIds.length === 0) {
        setConversations([]);
        setActiveConversation(null);
        setMessages([]);
        return;
      }

      const { data: profiles, error: profError } = await supabase
        .from("profiles")
        .select("id,username,display_name,account_type,avatar_url,network_rank")
        .in("id", counterpartIds);

      if (profError) {
        setConversations([]);
        setActiveConversation(null);
        setMessages([]);
        return;
      }

      const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      const { data: unreadRows } = await supabase
        .from("messages")
        .select("sender_id")
        .eq("receiver_id", myId)
        .eq("read", false);

      const unreadBySender = new Map<string, number>();
      for (const row of unreadRows ?? []) {
        const sid = (row as { sender_id: string }).sender_id;
        unreadBySender.set(sid, (unreadBySender.get(sid) ?? 0) + 1);
      }

      // Keep ordering based on latest message order from rawMessages.
      const conversationList = Array.from(lastByCounterpart.entries()).map(
        ([counterpartId, v]: [string, any]) => ({
          id: counterpartId,
          participant: profileById.get(counterpartId),
          lastMessage: v.lastMessage,
          unreadCount: unreadBySender.get(counterpartId) ?? 0,
          isRequest: false,
        })
      );

      setConversations(conversationList);

      // If a recipient was requested in the URL, prefer it.
      if (requestedRecipient) {
        const requested = requestedRecipient.toString();
        const matched =
          conversationList.find((c: any) => c.id === requested) ||
          conversationList.find((c: any) => c.participant?.username === requested) ||
          conversationList.find((c: any) => c.participant?.display_name === requested);
        if (matched) {
          setActiveConversation(matched);
          return;
        }
      }

      setActiveConversation((prev: any) => prev ?? conversationList[0]);
    };

    void loadConversations();
  }, [supabase, user, requestedRecipient]);

  // Load the active conversation's message thread.
  useEffect(() => {
    if (!user || !activeConversation?.id) return;

    const loadMessages = async () => {
      const myId = user.id;
      const otherId = activeConversation.id;

      const { data: rawChat, error: chatError } = await supabase
        .from("messages")
        .select("id,sender_id,receiver_id,created_at,body,read")
        .or(
          `and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`
        )
        .order("created_at", { ascending: true });

      if (chatError) {
        setMessages([]);
        return;
      }

      setMessages(rawChat ?? []);

      await supabase
        .from("messages")
        .update({ read: true })
        .eq("receiver_id", myId)
        .eq("sender_id", otherId)
        .eq("read", false);

      setConversations((prev) =>
        prev.map((c: any) => (c.id === otherId ? { ...c, unreadCount: 0 } : c))
      );
      window.dispatchEvent(new Event("tan-messages-unread-refresh"));
    };

    void loadMessages();
  }, [supabase, user, activeConversation?.id]);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      (c.participant?.display_name ?? c.participant?.username ?? "")
        .toLowerCase()
        .includes(q)
    );
  }, [conversations, searchQuery]);

  const handleSend = async () => {
    const body = messageInput.trim();
    if (!body) return;
    if (!user || !activeConversation?.id) return;

    setMessageInput("");

    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      receiver_id: activeConversation.id,
      body,
      read: false,
    });

    if (error) {
      // If insert fails, re-query chat to recover consistent state.
      if (activeConversation?.id) {
        const myId = user.id;
        const { data: rawChat } = await supabase
          .from("messages")
          .select("id,sender_id,receiver_id,created_at,body,read")
          .or(
            `and(sender_id.eq.${myId},receiver_id.eq.${activeConversation.id}),and(sender_id.eq.${activeConversation.id},receiver_id.eq.${myId})`
          )
          .order("created_at", { ascending: true });
        setMessages(rawChat ?? []);
      }
      return;
    }

    // Refresh chat after successful insert.
    const myId = user.id;
    const { data: rawChat } = await supabase
      .from("messages")
      .select("id,sender_id,receiver_id,created_at,body,read")
      .or(
        `and(sender_id.eq.${myId},receiver_id.eq.${activeConversation.id}),and(sender_id.eq.${activeConversation.id},receiver_id.eq.${myId})`
      )
      .order("created_at", { ascending: true });

    setMessages(rawChat ?? []);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-16 h-screen">
        <div className="h-full flex">
          {/* Conversations List */}
          <div className="w-full md:w-80 lg:w-96 bg-sidebar border-r border-border flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl">Messages</h2>
                <button className="p-2 hover:bg-secondary transition-colors">
                  <MessageSquare className="w-5 h-5" />
                </button>
              </div>
              
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-background border border-border pl-10 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            
            {/* Requests Section */}
            {conversations.some((c) => c.isRequest) && (
              <div className="p-2 border-b border-border">
                <p className="text-xs text-muted-foreground px-2 py-1">Message Requests</p>
                {conversations.filter((c) => c.isRequest).map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isActive={activeConversation?.id === conversation.id}
                    onClick={() => setActiveConversation(conversation)}
                  />
                ))}
              </div>
            )}
            
            {/* Conversations */}
            <div className="flex-1 overflow-y-auto">
              <p className="text-xs text-muted-foreground px-4 py-2">Recent</p>
              {filteredConversations.filter((c) => !c.isRequest).map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={activeConversation?.id === conversation.id}
                  onClick={() => setActiveConversation(conversation)}
                />
              ))}
            </div>
          </div>
          
          {/* Chat Area */}
          <div className="hidden md:flex flex-1 flex-col bg-background">
            {activeConversation ? (
              <>
                {/* Chat Header */}
                <div className="h-16 border-b border-border flex items-center justify-between px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-secondary flex items-center justify-center">
                        {activeConversation.participant?.display_name?.[0] ??
                          activeConversation.participant?.username?.[0] ??
                          "?"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {activeConversation.participant?.display_name ??
                              activeConversation.participant?.username ??
                              "Unknown"}
                          </span>
                          {activeConversation.participant?.account_type && (
                            <Badge type={activeConversation.participant.account_type} />
                          )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                          Network rank{" "}
                          {typeof activeConversation.participant?.network_rank === "number"
                            ? Math.round(activeConversation.participant.network_rank)
                            : activeConversation.participant?.network_rank ?? 0}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-secondary transition-colors">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isOwn={message.sender_id === user?.id}
                    />
                  ))}
                </div>
                
                {/* Input */}
                <div className="p-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-secondary transition-colors">
                      <Paperclip className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <button className="p-2 hover:bg-secondary transition-colors">
                      <Smile className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <input
                      type="text"
                      placeholder="Type a message..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSend()}
                      className="flex-1 bg-secondary px-4 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button 
                      onClick={handleSend}
                      className="p-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Select a conversation to start messaging
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background pt-20 text-center text-muted-foreground">Loading messages...</div>}>
      <MessagesPageContent />
    </Suspense>
  );
}
