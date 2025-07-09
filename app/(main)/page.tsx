'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  getDoc,
  serverTimestamp,
  where,
  getDocs,
  arrayUnion,
  arrayRemove,
  setDoc,
  writeBatch
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { isAdminUID } from '@/lib/config';
import { encryptMessage, decryptMessage } from '@/lib/encryption';
import { setupUserPresence, rtdb, updateUserStatus } from '@/lib/firebase';
import { generateUserID, isValidUserID } from '@/lib/utils';
import { UserTags } from '@/components/ui/user-tags';
import { MobileFriendsDrawer } from '@/components/ui/mobile-friends-drawer';
import { MessageStatusIcon } from '@/components/ui/message-status-icon';
import { ReactionPopover } from '@/components/ui/reaction-popover';
import { ReactionPills } from '@/components/ui/reaction-pills';
import { GroupChatModal } from '@/components/ui/group-chat-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { 
  Send, 
  LogOut, 
  Settings, 
  Shield, 
  Users,
  Image as ImageIcon,
  Save,
  X,
  UserPlus,
  MessageCircle,
  Copy,
  Check,
  Circle,
  Clock,
  Eye,
  Search,
  Plus,
  Volume2,
  VolumeX
} from 'lucide-react';
import { ref, onValue, set, remove } from 'firebase/database';

// Interfaces
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

// CORREÇÃO: Interface Chat enriquecida para exibição
interface DisplayChat extends Chat {
  display_name: string;
  display_photo: string;
}

interface Chat {
  id: string;
  name?: string;
  members: string[];
  isGroup: boolean;
  lastMessage?: {
    text: string;
    timestamp: any;
    sender: string;
  };
  createdBy: string;
  photoURL?: string;
}


export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [filteredMessages, setFilteredMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPhotoURL, setNewPhotoURL] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [newFriendID, setNewFriendID] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);
  const [copiedUserID, setCopiedUserID] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [statusMode, setStatusMode] = useState<'online' | 'offline' | 'hidden' | 'away'>('online');
  const [isFriendTyping, setIsFriendTyping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const [unreadCounts, setUnreadCounts] = useState<{ [chatId: string]: number }>({});
  const [sortedChats, setSortedChats] = useState<DisplayChat[]>([]); // CORREÇÃO: Usa a interface DisplayChat

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const sortChatsByActivity = (chatsToSort: DisplayChat[]) => {
    return [...chatsToSort].sort((a, b) => {
      const aTimestamp = a.lastMessage?.timestamp?.toMillis() || 0;
      const bTimestamp = b.lastMessage?.timestamp?.toMillis() || 0;
      return bTimestamp - aTimestamp;
    });
  };

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      loadUserData(currentUser.uid);
    } else {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    if (user) {
      const unsubscribe = loadChats();
      setupUserPresence(user.uid, statusMode);
      requestNotificationPermission();
      return () => {
        if (unsubscribe) unsubscribe.then(u => u());
      }
    }
  }, [user]);

  useEffect(() => {
    if (user && sortedChats.length > 0) {
      const unsubscribes = sortedChats.map(chat => {
        const q = query(
          collection(db, 'messages'),
          where('chatId', '==', chat.id)
        );
        return onSnapshot(q, (messageSnapshot) => {
          const count = messageSnapshot.docs.filter(
            doc => !doc.data().readBy?.includes(user.uid)
          ).length;
          
          setUnreadCounts(prevCounts => ({
            ...prevCounts,
            [chat.id]: count,
          }));
        });
      });

      return () => unsubscribes.forEach(unsub => unsub());
    }
  }, [user, sortedChats]);

  // ... (outros useEffects permanecem iguais)
  
  // CORREÇÃO GERAL: Função `loadChats` agora enriquece os dados para exibição
  const loadChats = async () => {
    if (!user) return;

    // Carrega amigos para o modal de criação de grupo
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const friendsUIDs = userDoc.data()?.friends || [];
    const friendsPromises = friendsUIDs.map((uid: string) => getDoc(doc(db, 'users', uid)));
    const friendDocs = await Promise.all(friendsPromises);
    const friendsData = friendDocs.map(doc => ({ uid: doc.id, ...doc.data() } as Friend));
    setFriends(friendsData);
    
    // Listener principal das conversas
    const q = query(
      collection(db, 'chats'),
      where('members', 'array-contains', user.uid)
    );
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatPromises = snapshot.docs.map(async (docSnap) => {
        const chatData = { id: docSnap.id, ...docSnap.data() } as Chat;
        let displayName = 'Grupo';
        let displayPhoto = 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=150&h=150&fit=crop&crop=face';

        if (!chatData.isGroup) {
          const otherUserId = chatData.members.find(uid => uid !== user.uid);
          if (otherUserId) {
            try {
              const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
              if (otherUserDoc.exists()) {
                const otherUserData = otherUserDoc.data();
                displayName = otherUserData.displayName;
                displayPhoto = otherUserData.photoURL;
              }
            } catch (e) { console.error("Erro ao buscar dados do amigo:", e); }
          }
        } else {
          displayName = chatData.name || 'Grupo sem nome';
          if (chatData.photoURL) displayPhoto = chatData.photoURL;
        }

        return {
          ...chatData,
          display_name: displayName,
          display_photo: displayPhoto,
        };
      });

      const resolvedChats = await Promise.all(chatPromises);
      const sorted = sortChatsByActivity(resolvedChats);
      setSortedChats(sorted);
    });

    return unsubscribe;
  };
  
  // ... (Restante das funções como `loadMessages`, `sendMessage` etc. permanecem as mesmas)
  
  const selectChat = (chat: DisplayChat) => { // CORREÇÃO: Usa DisplayChat
    setSelectedChat(chat);
    if (unreadCounts[chat.id] > 0) {
      setUnreadCounts(prev => ({ ...prev, [chat.id]: 0 }));
    }
    if (!chat.isGroup) {
      const friendUID = chat.members.find(uid => uid !== user?.uid);
      const friendData = friends.find(f => f.uid === friendUID);
      if(friendData) {
        setSelectedFriend(friendData);
      }
    } else {
      setSelectedFriend(null);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400">Carregando chat...</p>
        </div>
      </div>
    );
  }

  const ChatList = () => (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      <div className="p-2">
        <h3 className="text-gray-400 text-sm font-medium mb-2 px-2">Conversas ({sortedChats.length})</h3>
        {sortedChats.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="h-8 w-8 text-gray-600 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Nenhuma conversa</p>
            <p className="text-gray-600 text-xs">Adicione amigos para começar</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sortedChats.map((chat) => (
              <div
                key={chat.id}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors group ${
                  selectedChat?.id === chat.id 
                    ? 'bg-gray-700' 
                    : 'hover:bg-gray-800'
                }`}
                onClick={() => selectChat(chat)}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={chat.display_photo} />
                  <AvatarFallback className="bg-gray-700 text-white">
                    {chat.display_name?.charAt(0).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-medium truncate">
                    {chat.display_name}
                  </h4>
                  {chat.lastMessage && (
                    <p className="text-gray-400 text-xs truncate">
                      {chat.lastMessage.text}
                    </p>
                  )}
                </div>
                {unreadCounts[chat.id] > 0 && (
                   <Badge variant="destructive" className="flex-shrink-0">
                     {unreadCounts[chat.id] > 99 ? '99+' : unreadCounts[chat.id]}
                   </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
     <div className="h-screen [-webkit-app-region:no-drag] flex bg-black text-white overflow-hidden">
      <MobileFriendsDrawer friendsCount={sortedChats.length}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* ... Seu código para info do usuário e adicionar amigo ... */}
          <ChatList />
        </div>
      </MobileFriendsDrawer>

      <div className="hidden sm:flex w-80 bg-gray-900 border-r border-gray-700 flex-col overflow-hidden">
          {/* ... Seu código para info do usuário, editar perfil, etc. ... */}
          <ChatList />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-screen sm:h-auto">
        {selectedChat ? (
            <>
              {/* CORREÇÃO: Usa os dados de display do chat selecionado */}
              <div className="bg-gray-900 border-b border-gray-700 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={(selectedChat as DisplayChat).display_photo} />
                      <AvatarFallback className="bg-gray-700 text-white">
                        {(selectedChat as DisplayChat).display_name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="text-white font-semibold">
                        {(selectedChat as DisplayChat).display_name}
                      </h2>
                      {/* ... restante da lógica de status ... */}
                    </div>
                  </div>
                  {/* ... botão de pesquisa ... */}
                </div>
              </div>
              {/* ... restante do corpo do chat ... */}
            </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-800 p-4">
             {/* ... mensagem de "Selecione uma conversa" ... */}
          </div>
        )}
      </div>

      {showGroupModal && (
        <GroupChatModal
          friends={friends}
          onClose={() => setShowGroupModal(false)}
          onCreateGroup={createGroupChat}
        />
      )}
    </div>
  );
}