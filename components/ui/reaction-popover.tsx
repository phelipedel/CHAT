import { useState } from 'react';
import { Button } from './button';

interface ReactionPopoverProps {
  onReactionSelect: (emoji: string) => void;
}

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥'];

export function ReactionPopover({ onReactionSelect }: ReactionPopoverProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div 
      className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 bg-gray-600 hover:bg-gray-500 text-white rounded-full"
      >
        😊
      </Button>
      
      {isVisible && (
        <div className="absolute bottom-full right-0 mb-2 bg-gray-800 border border-gray-600 rounded-lg p-2 flex gap-1 shadow-lg z-10">
          {EMOJI_OPTIONS.map((emoji) => (
            <Button
              key={emoji}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-gray-700 text-lg"
              onClick={() => {
                onReactionSelect(emoji);
                setIsVisible(false);
              }}
            >
              {emoji}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}