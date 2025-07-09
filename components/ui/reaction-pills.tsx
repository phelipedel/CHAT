'use client';

interface ReactionPillsProps {
  reactions: { [emoji: string]: string[] };
  onReactionClick: (emoji: string) => void;
  currentUserId: string;
}

export function ReactionPills({ reactions, onReactionClick, currentUserId }: ReactionPillsProps) {
  const reactionEntries = Object.entries(reactions).filter(([_, users]) => users.length > 0);
  
  if (reactionEntries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {reactionEntries.map(([emoji, users]) => {
        const isUserReacted = users.includes(currentUserId);
        
        return (
          <button
            key={emoji}
            onClick={(e) => {
              e.stopPropagation();
              onReactionClick(emoji);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
              isUserReacted 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
            }`}
          >
            <span>{emoji}</span>
            <span>{users.length}</span>
          </button>
        );
      })}
    </div>
  );
}