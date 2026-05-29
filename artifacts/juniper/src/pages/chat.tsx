import { useMemo } from "react";
import { ChatInterface } from "@/components/chat/chat-interface";
import { Artifact, Conversation } from "@/components/app-sidebar";
import { UserProfile } from "@/lib/profile";

type Props = {
  userName: string;
  profile: UserProfile | null;
  activeConvId: string | null;
  conversations: Conversation[];
  chatKey: number;
  onConversationStart: (title: string) => void;
  onArtifactSaved: (a: Artifact) => void;
  onOpenProfile: () => void;
  onMessagesUpdate: (messages: Array<{ role: "user" | "assistant"; content: string }>) => void;
};

export function ChatPage({
  userName,
  profile,
  activeConvId,
  conversations,
  chatKey,
  onConversationStart,
  onArtifactSaved,
  onOpenProfile,
  onMessagesUpdate,
}: Props) {
  const initialMessages = useMemo(
    () => (activeConvId ? conversations.find((c) => c.id === activeConvId)?.messages : undefined),
    [activeConvId, conversations],
  );

  return (
    <ChatInterface
      key={chatKey}
      userName={userName}
      profile={profile}
      onConversationStart={onConversationStart}
      onArtifactSaved={onArtifactSaved}
      onOpenProfile={onOpenProfile}
      initialMessages={initialMessages}
      onMessagesUpdate={onMessagesUpdate}
    />
  );
}
