import { useEffect, useRef, useState } from "react";
import type { PlayerMark, RoomChatMessage } from "../network/protocol";
import type { LayoutMode } from "../game/interaction/deviceMode";

interface GameChatPanelProps {
  layoutMode: LayoutMode;
  viewerRole: "player" | "spectator";
  myMark: PlayerMark;
  messages: RoomChatMessage[];
  onSendMessage: (message: string) => void;
  disabled: boolean;
}

function formatMessageTime(sentAt: number): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(sentAt);
  } catch {
    return "";
  }
}

export function GameChatPanel({
  layoutMode,
  viewerRole,
  myMark,
  messages,
  onSendMessage,
  disabled
}: GameChatPanelProps) {
  const [draft, setDraft] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const isMobile = layoutMode === "mobile";
  const canSend = !disabled && draft.trim().length > 0;

  useEffect(() => {
    const list = messagesRef.current;
    if (!list) {
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    const content = draft.trim();
    if (!content || disabled) {
      return;
    }
    onSendMessage(content.slice(0, 220));
    setDraft("");
  };

  return (
    <aside className={`game-chat-panel ${isMobile ? "mobile" : "desktop"}`} aria-label="对局聊天">
      <div className="game-chat-header">
        <span>战局聊天</span>
        <span>{messages.length} 条</span>
      </div>
      <div ref={messagesRef} className="game-chat-messages">
        {messages.length === 0 ? (
          <p className="game-chat-empty">开局先打个招呼吧，按 Enter 即可发送。</p>
        ) : (
          messages.map((message) => {
            const isSelf =
              viewerRole === "player" &&
              message.senderRole === "player" &&
              message.senderMark === myMark;
            const roleClassName = isSelf
              ? "self"
              : message.senderRole === "spectator"
                ? "spectator"
                : "opponent";
            const ariaLabel = isSelf
              ? "我方消息"
              : message.senderRole === "spectator"
                ? "观战消息"
                : "玩家消息";
            return (
              <article
                key={message.id}
                className={`game-chat-message ${roleClassName}`}
                aria-label={ariaLabel}
              >
                <div className="game-chat-message-meta">
                  <span>{message.senderDisplayName}</span>
                  <span>{formatMessageTime(message.sentAt)}</span>
                </div>
                <p>{message.message}</p>
              </article>
            );
          })
        )}
      </div>
      <div className="game-chat-input-row">
        <textarea
          className="game-chat-input"
          value={draft}
          maxLength={220}
          placeholder={disabled ? "连接恢复后可聊天" : "输入消息，Enter 发送"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
              return;
            }
            event.preventDefault();
            handleSend();
          }}
          disabled={disabled}
        />
        <button className="hud-mini-button game-chat-send" type="button" disabled={!canSend} onClick={handleSend}>
          发送
        </button>
      </div>
    </aside>
  );
}
