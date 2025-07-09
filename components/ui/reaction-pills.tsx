import { Button } from './button';

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
        const hasUserReacted = users.includes(currentUserId);
        
        return (
          <Button
            key={emoji}
            variant="ghost"
            size="sm"
            className={`h-6 px-2 py-0 text-xs rounded-full border ${
              hasUserReacted 
                ? 'bg-blue-600 border-blue-500 text-white' 
                : 'bg-gray-600 border-gray-500 text-gray-300 hover:bg-gray-500'
            }`}
            onClick={() => onReactionClick(emoji)}
          >
            {emoji} {users.length}
          </Button>
        );
      })}
    </div>
  );
}