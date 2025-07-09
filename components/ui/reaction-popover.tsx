'use client';

import { useState } from 'react';

interface ReactionPopoverProps {
  onReactionSelect: (emoji: string) => void;
}

const AVAILABLE_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🔥'];

export function ReactionPopover({ onReactionSelect }: ReactionPopoverProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div 
      className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {isVisible && (
        <div className="absolute -top-12 right-0 bg-gray-800 border border-gray-600 rounded-lg p-2 flex gap-1 shadow-lg z-10">
          {AVAILABLE_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={(e) => {
                e.stopPropagation();
                onReactionSelect(emoji);
                setIsVisible(false);
              }}
              className="text-lg hover:bg-gray-700 rounded p-1 transition-colors"
              title={`Reagir com ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}