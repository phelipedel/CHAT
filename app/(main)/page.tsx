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

// Interface enriquecida para exibição na UI
interface DisplayChat extends Chat {
  display_name: string;
  display_photo: string;
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
  const [selectedChat, setSelectedChat] = useState<DisplayChat | null>(null);
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
  const [sortedChats, setSortedChats] = useState<DisplayChat[]>([]);

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
  }, []);

  useEffect(() => {
    if (user) {
      const unsubscribePromise = loadChats();
      setupUserPresence(user.uid, statusMode);
      requestNotificationPermission();
      return () => {
        unsubscribePromise.then(unsub => unsub && unsub());
      }
    }
  }, [user]);
  
  useEffect(() => {
    if (user && sortedChats.length > 0) {
      const unsubscribes = sortedChats.map(chat => {
        const q = query(collection(db, 'messages'), where('chatId', '==', chat.id));
        return onSnapshot(q, (messageSnapshot) => {
          if (!user) return;
          const count = messageSnapshot.docs.filter(
            doc => doc.data().userId !== user.uid && !doc.data().readBy?.includes(user.uid)
          ).length;
          setUnreadCounts(prev => ({ ...prev, [chat.id]: count }));
        });
      });
      return () => unsubscribes.forEach(unsub => unsub());
    }
  }, [user, sortedChats]);

  useEffect(() => {
    if (user) {
      updateUserStatus(user.uid, statusMode);
    }
  }, [statusMode, user]);

  useEffect(() => {
    if (selectedChat && user) {
      const unsubscribe = loadMessages();
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [selectedChat, user]);
  
  useEffect(() => {
    if (messages.length > 0 && user && selectedChat) {
      const unreadMessages = messages.filter(msg => 
        msg.userId !== user.uid && 
        (!msg.readBy || !msg.readBy.includes(user.uid))
      );
      if (unreadMessages.length > 0) {
        const batch = writeBatch(db);
        unreadMessages.forEach(msg => {
          const msgRef = doc(db, 'messages', msg.id);
          batch.update(msgRef, { readBy: arrayUnion(user.uid) });
        });
        batch.commit().catch(console.error);
      }
    }
  }, [messages, user, selectedChat]);
  
  const loadUserData = async (userId: string) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        let userID = userData.userID;
        if (!userID) {
          userID = generateUserID();
          await updateDoc(doc(db, 'users', userId), { userID });
        }
        setUser({ uid: userId, ...userData, userID, friends: userData.friends || [] } as User);
        setNewDisplayName(userData.displayName);
        setNewPhotoURL(userData.photoURL);
        setStatusMode(userData.statusMode || 'online');
      } else {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userID = generateUserID();
          const newUserData = {
            email: currentUser.email || '',
            displayName: currentUser.displayName || 'Usuário',
            photoURL: currentUser.photoURL || `https://api.dicebear.com/6.x/initials/svg?seed=${currentUser.email}`,
            isAdmin: isAdminUID(userId),
            createdAt: new Date(),
            userID: userID,
            friends: [],
            tags: [],
            statusMode: 'online'
          };
          await setDoc(doc(db, 'users', userId), newUserData);
          setUser({ uid: userId, ...newUserData });
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados do usuário:', error);
    }
    setLoading(false);
  };
  
  const loadChats = async () => {
    if (!user) return;
  
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const friendsUIDs = userDoc.data()?.friends || [];
    const friendsPromises = friendsUIDs.map((uid: string) => getDoc(doc(db, 'users', uid)));
    const friendDocs = await Promise.all(friendsPromises);
    const friendsData = friendDocs.filter(doc => doc.exists()).map(doc => ({ uid: doc.id, ...doc.data() } as Friend));
    setFriends(friendsData);
    
    const q = query(collection(db, 'chats'), where('members', 'array-contains', user.uid));
  
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatPromises = snapshot.docs.map(async (docSnap) => {
        const chatData = { id: docSnap.id, ...docSnap.data() } as Chat;
        let displayName = 'Grupo';
        let displayPhoto = `https://api.dicebear.com/6.x/identicon/svg?seed=${chatData.id}`;
  
        if (!chatData.isGroup) {
          const otherUserId = chatData.members.find(uid => uid !== user.uid);
          displayName = "Chat Deletado";
          displayPhoto = `https://api.dicebear.com/6.x/initials/svg?seed=?`;

          if (otherUserId) {
            try {
              let friend = friendsData.find(f => f.uid === otherUserId);
              if (!friend) {
                const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
                if (otherUserDoc.exists()) friend = { uid: otherUserDoc.id, ...otherUserDoc.data() } as Friend;
              }
              if (friend) {
                displayName = friend.displayName;
                displayPhoto = friend.photoURL;
              }
            } catch (e) { console.error("Erro ao buscar dados do amigo:", e); }
          }
        } else {
          displayName = chatData.name || 'Grupo sem nome';
          if (chatData.photoURL) displayPhoto = chatData.photoURL;
        }
  
        return { ...chatData, display_name: displayName, display_photo: displayPhoto };
      });
  
      const resolvedChats = await Promise.all(chatPromises);
      const sorted = sortChatsByActivity(resolvedChats);
      setSortedChats(sorted);
    });
  
    return unsubscribe;
  };
  
  const loadMessages = () => {
    if (!selectedChat || !user) return undefined;
    const chatId = selectedChat.id;
    const q = query(collection(db, 'messages'), where('chatId', '==', chatId), orderBy('timestamp', 'asc'));
    
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
      scrollToBottom();
    }, (error) => console.error("Erro no listener de mensagens: ", error));
  };
  
  const selectChat = (chat: DisplayChat) => {
    if (!user) return;
    setSelectedChat(chat);
    if (unreadCounts[chat.id] > 0) {
      setUnreadCounts(prev => ({ ...prev, [chat.id]: 0 }));
    }
    if (!chat.isGroup) {
      const friendUID = chat.members.find(uid => uid !== user.uid);
      if(friendUID){
        const friendData = friends.find(f => f.uid === friendUID);
        setSelectedFriend(friendData || null);
      }
    } else {
      setSelectedFriend(null);
    }
  };

  // ... (outras funções auxiliares)
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !selectedChat) return;
  
    const isImageUrl = /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(newMessage);
    const chatId = selectedChat.id;
  
    try {
      const messageText = selectedChat.isGroup ? newMessage : encryptMessage(newMessage, user.uid, selectedFriend?.uid || '');
      await addDoc(collection(db, 'messages'), { text: messageText, userId: user.uid, userName: user.displayName, userPhoto: user.photoURL, timestamp: serverTimestamp(), isImage: isImageUrl, chatId: chatId, readBy: [user.uid], reactions: {} });
      await updateDoc(doc(db, 'chats', chatId), { lastMessage: { text: isImageUrl ? "📷 Imagem" : newMessage, timestamp: serverTimestamp(), sender: user.uid } });
      setNewMessage('');
    } catch (error) { console.error('Erro ao enviar mensagem:', error); }
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

  return (
    <div className="h-screen [-webkit-app-region:no-drag] flex bg-black text-white overflow-hidden">
      {/* Sidebar para Desktop */}
      <div className="hidden sm:flex w-80 bg-gray-900 border-r border-gray-700 flex-col overflow-hidden">
        {/* User Info & Actions */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-12 w-12 ring-2 ring-white">
              <AvatarImage src={user?.photoURL} />
              <AvatarFallback className="bg-gray-700 text-white">{user?.displayName?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-semibold truncate">{user?.displayName}</h2>
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="text-xs bg-green-600 text-white">{user?.userID}</Badge>
                <Button variant="ghost" size="sm" onClick={() => {}} className="h-6 w-6 p-0 text-gray-400 hover:text-white hover:bg-gray-700" title="Copiar ID">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditingProfile(!editingProfile)} className="text-gray-400 hover:text-white hover:bg-gray-800"><Settings className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setSoundEnabled(!soundEnabled)} className="text-gray-400 hover:text-white hover:bg-gray-800">{soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</Button>
            {user?.isAdmin && (<Button variant="ghost" size="sm" onClick={() => router.push('/admin')} className="text-gray-400 hover:text-white hover:bg-gray-800"><Users className="h-4 w-4" /></Button>)}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-400 hover:text-white hover:bg-gray-800"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Add Friend & Group */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex gap-2 mb-2">
            <Input value={newFriendID} onChange={(e) => setNewFriendID(e.target.value)} placeholder="ID do amigo (ex: del#1234)" className="bg-gray-700 border-gray-600 text-white" onKeyPress={(e) => { if (e.key === 'Enter') addFriend(); }}/>
            <Button onClick={addFriend} disabled={addingFriend} className="bg-white text-black hover:bg-gray-200" title="Adicionar amigo">
              {addingFriend ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div> : <UserPlus className="h-4 w-4" />}
            </Button>
          </div>
          <Button onClick={() => setShowGroupModal(true)} className="w-full bg-purple-600 hover:bg-purple-700 text-white" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Criar Grupo
          </Button>
        </div>
        
        {/* Chat List */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="p-2">
            <h3 className="text-gray-400 text-sm font-medium mb-2 px-2">Conversas ({sortedChats.length})</h3>
            {sortedChats.map((chat) => (
              <div key={chat.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors group ${selectedChat?.id === chat.id ? 'bg-gray-700' : 'hover:bg-gray-800'}`} onClick={() => selectChat(chat)}>
                <Avatar className="h-10 w-10">
                  <AvatarImage src={chat.display_photo} />
                  <AvatarFallback className="bg-gray-700 text-white">{chat.display_name?.charAt(0).toUpperCase() || '?'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-medium truncate">{chat.display_name}</h4>
                  {chat.lastMessage && <p className="text-gray-400 text-xs truncate">{chat.lastMessage.text}</p>}
                </div>
                {unreadCounts[chat.id] > 0 && <Badge variant="destructive" className="flex-shrink-0">{unreadCounts[chat.id] > 99 ? '99+' : unreadCounts[chat.id]}</Badge>}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen sm:h-auto">
        {selectedChat ? (
          <>
            <div className="bg-gray-900 border-b border-gray-700 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10"><AvatarImage src={selectedChat.display_photo} /><AvatarFallback>{selectedChat.display_name?.charAt(0)}</AvatarFallback></Avatar>
                <div>
                  <h2 className="text-white font-semibold">{selectedChat.display_name}</h2>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowSearch(!showSearch)}><Search className="h-4 w-4" /></Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-800 scrollbar-hide">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.userId === user?.uid ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-lg p-3 relative group ${message.userId === user?.uid ? 'bg-white text-black' : 'bg-gray-700 text-white'}`}>
                    {message.userId !== user?.uid && <div className="flex items-center gap-2 mb-2"><Avatar className="h-6 w-6"><AvatarImage src={message.userPhoto} /></Avatar><span className="text-sm text-gray-300">{message.userName}</span></div>}
                    {message.isImage ? <img src={message.text} alt="Imagem" className="max-w-full h-auto rounded-lg"/> : <p className="break-words">{decryptMessage(message.text, message.userId, user?.uid || '')}</p>}
                    <div className="mt-1 text-xs text-right">{message.timestamp?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="bg-gray-900 border-t border-gray-700 p-4">
              <form onSubmit={sendMessage} className="flex gap-2">
                <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Digite sua mensagem..." className="flex-1 bg-gray-700" />
                <Button type="submit" disabled={!newMessage.trim()} className="bg-white text-black"><Send className="h-4 w-4" /></Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-800">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 text-gray-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold">Selecione uma conversa</h2>
              <p className="text-gray-400">Escolha uma conversa para começar.</p>
            </div>
          </div>
        )}
      </div>

      {showGroupModal && <GroupChatModal friends={friends} onClose={() => setShowGroupModal(false)} onCreateGroup={createGroupChat} />}
    </div>
  );
}