import type { ChatMessage } from "../api";
import MarkdownBody from "./MarkdownBody";
import VetCard from "./VetCard";
import VetiAvatar from "./VetiAvatar";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "./TriageIndicator";

export default function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const category = !isUser ? message.category : null;

  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-bot"}`}>
      {!isUser && (
        <div className="msg-avatar">
          <VetiAvatar size={30} />
        </div>
      )}
      <div
        className={`bubble ${isUser ? "bubble-user" : "bubble-bot"} ${
          category ? `cat-${category}` : ""
        }`}
      >
        {category && (
          <span className={`bubble-badge bubble-badge-${category}`}>
            {CATEGORY_ICONS[category]} {CATEGORY_LABELS[category]}
          </span>
        )}
        {isUser ? (
          <p className="bubble-text">{message.content}</p>
        ) : (
          <MarkdownBody text={message.content} />
        )}

        {message.vets.length > 0 && (
          <div className="vet-list">
            {message.vets.map((v) => (
              <VetCard key={v.osmKey} vet={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
