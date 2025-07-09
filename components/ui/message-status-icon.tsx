'use client';

import { Check } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  userId: string;
  userName: string;
  userPhoto: string;
  timestamp: any;
  isImage?: boolean;
  chatId: string;
  readBy?: string[];
  reactions?: { [emoji: string]: string[] };
}

interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  isAdmin: boolean;
  userID: string;
  friends: string[];
  tags?: string[];
  statusMode?: 'online' | 'offline' | 'hidden' | 'away';
}

interface Friend {
  uid: string;
  userID: string;
  displayName: string;
  photoURL: string;
  status?: 'online' | 'offline' | 'hidden' | 'away';
  lastSeen?: any;
  tags?: string[];
  lastMessage?: string;
  lastMessageTime?: any;
}

interface MessageStatusIconProps {
  message: Message;
  currentUser: User;
  selectedFriend: Friend | null;
}

export function MessageStatusIcon({ message, currentUser, selectedFriend }: MessageStatusIconProps) {
  // Only show status for messages sent by current user
  if (message.userId !== currentUser.uid) {
    return null;
  }

  const readBy = message.readBy || [];
  
  // If friend has read the message (blue double check)
  if (selectedFriend && readBy.includes(selectedFriend.uid)) {
    return (
      <div className="flex items-center text-blue-500">
        <Check className="h-3 w-3" />
        <Check className="h-3 w-3 -ml-1" />
      </div>
    );
  }
  
  // If message has been delivered to others (gray double check)
  if (readBy.length > 1) {
    return (
      <div className="flex items-center text-gray-400">
        <Check className="h-3 w-3" />
        <Check className="h-3 w-3 -ml-1" />
      </div>
    );
  }
  
  // Message sent but not delivered (single gray check)
  return (
    <div className="flex items-center text-gray-400">
      <Check className="h-3 w-3" />
    </div>
  );
}