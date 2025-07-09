import { Check, CheckCheck } from 'lucide-react';

interface Message {
  id: string;
  readBy?: string[];
  userId: string;
}

interface User {
  uid: string;
}

interface Friend {
  uid: string;
}

interface MessageStatusIconProps {
  message: Message;
  currentUser: User;
  selectedFriend?: Friend | null;
}

export function MessageStatusIcon({ message, currentUser, selectedFriend }: MessageStatusIconProps) {
  // Only show status for messages sent by current user
  if (message.userId !== currentUser.uid) {
    return null;
  }

  const readBy = message.readBy || [];
  
  // If friend has read the message (blue double check)
  if (selectedFriend && readBy.includes(selectedFriend.uid)) {
    return <CheckCheck className="h-3 w-3 text-blue-500" />;
  }
  
  // If message has been delivered but not read (gray double check)
  if (readBy.length > 1) {
    return <CheckCheck className="h-3 w-3 text-gray-500" />;
  }
  
  // Message sent but not delivered (single gray check)
  return <Check className="h-3 w-3 text-gray-500" />;
}