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
        const q = query(
          collection(db, 'messages'),
          where('chatId', '==', chat.id)
        );
        return onSnapshot(q, (messageSnapshot) => {
          if (!user) return;
          // CORREÇÃO: Conta apenas mensagens não lidas de OUTROS usuários
          const count = messageSnapshot.docs.filter(
            doc => doc.data().userId !== user.uid && !doc.data().readBy?.includes(user.uid)
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

  useEffect(() => {
    if (user) {
      updateUserStatus(user.uid, statusMode);
    }
  }, [statusMode, user]);

  useEffect(() => {
    if (selectedChat && user) {
      const unsubscribe = loadMessages();
      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
      };
    }
  }, [selectedChat, user]);
  
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredMessages(messages);
    } else {
      const filtered = messages.filter(msg => 
        msg.text.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredMessages(filtered);
    }
  }, [searchQuery, messages]);

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
          batch.update(msgRef, {
            readBy: arrayUnion(user.uid)
          });
        });
        batch.commit().catch(console.error);
      }
    }
  }, [messages, user, selectedChat]);
  
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    }
  };

  const playNotificationSound = () => {
    if (soundEnabled) {
      const audio = new Audio('/sounds/notification.mp3');
      audio.play().catch(console.error);
    }
  };

  const showSystemNotification = (title: string, options: NotificationOptions) => {
    if (notificationsEnabled && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, options);
      });
    }
  };
  
  const loadUserData = async (userId: string) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      const isUserAdmin = isAdminUID(userId);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        let userID = userData.userID;
        if (!userID) {
          userID = generateUserID();
          await updateDoc(doc(db, 'users', userId), { userID });
        }
        
        setUser({
          uid: userId,
          email: userData.email,
          displayName: userData.displayName,
          photoURL: userData.photoURL,
          isAdmin: isUserAdmin,
          userID: userID,
          friends: userData.friends || [],
          tags: userData.tags || [],
          statusMode: userData.statusMode || 'online'
        });
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
            isAdmin: isUserAdmin,
            createdAt: new Date(),
            userID: userID,
            friends: [],
            tags: [],
            statusMode: 'online'
          };
          
          await setDoc(doc(db, 'users', userId), newUserData);
          
          setUser({ uid: userId, ...newUserData });
          setNewDisplayName(newUserData.displayName);
          setNewPhotoURL(newUserData.photoURL);
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
          displayName = "Chat Privado";
          if (otherUserId) {
            try {
              const friend = friendsData.find(f => f.uid === otherUserId);
              if (friend) {
                displayName = friend.displayName;
                displayPhoto = friend.photoURL;
              } else {
                const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
                if (otherUserDoc.exists()) {
                    const otherUserData = otherUserDoc.data();
                    displayName = otherUserData.displayName;
                    displayPhoto = otherUserData.photoURL;
                }
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
        } as DisplayChat;
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
    const q = query(
      collection(db, 'messages'), 
      where('chatId', '==', chatId),
      orderBy('timestamp', 'asc')
    );
    
    return onSnapshot(q, (snapshot) => {
      const loadedMessages: Message[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const message = {
          id: doc.id,
          text: selectedChat.isGroup ? data.text : decryptMessage(data.text, data.userId, user.uid === data.userId ? selectedFriend?.uid || '' : user.uid),
          ...data
        } as Message;
        loadedMessages.push(message);
      });
      
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.userId !== user.uid && !document.hasFocus()) {
            playNotificationSound();
            showSystemNotification(`Nova mensagem de ${data.userName}`, {
              body: data.text,
              icon: data.userPhoto,
              tag: chatId
            });
          }
        }
      });
      
      setMessages(loadedMessages);
      scrollToBottom();
    }, (error) => {
      console.error("Erro no listener de mensagens: ", error);
    });
  };

  const selectChat = async (chat: DisplayChat) => {
    setSelectedChat(chat);

    // Imediatamente zera o contador na UI para feedback rápido
    if (unreadCounts[chat.id] > 0) {
      setUnreadCounts(prev => ({ ...prev, [chat.id]: 0 }));
    }

    if (!chat.isGroup) {
      const friendUID = chat.members.find(uid => uid !== user?.uid);
      if (friendUID) {
        const friendData = friends.find(f => f.uid === friendUID);
        setSelectedFriend(friendData || null);
      }
    } else {
      setSelectedFriend(null);
    }

    // A marcação como lido no DB é feita pelo useEffect que observa `messages`
  };


  // ... (Restante do seu código: handleTyping, scrollToBottom, sendMessage, handleReaction, createGroupChat, addFriend, removeFriend, handleLogout, updateProfile, copyUserID)
  const handleTyping = () => {
    if (!selectedChat || !user || !selectedFriend) return;
  
    const chatId = selectedChat.id;
    const typingRef = ref(rtdb, `/typing/${chatId}/${user.uid}`);
  
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  
    set(typingRef, true);
  
    typingTimeoutRef.current = setTimeout(() => {
      remove(typingRef);
    }, 2000);
  };
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !selectedChat) return;
  
    const isImageUrl = newMessage.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) || 
                       newMessage.includes('images.unsplash.com') ||
                       newMessage.includes('via.placeholder.com');
  
    const chatId = selectedChat.id;
  
    try {
      const messageText = selectedChat.isGroup ? newMessage : encryptMessage(newMessage, user.uid, selectedFriend?.uid || '');
      
      await addDoc(collection(db, 'messages'), {
        text: messageText,
        userId: user.uid,
        userName: user.displayName,
        userPhoto: user.photoURL,
        timestamp: serverTimestamp(),
        isImage: Boolean(isImageUrl),
        chatId: chatId,
        readBy: [user.uid],
        reactions: {}
      });
  
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text: newMessage,
          timestamp: serverTimestamp(),
          sender: user.uid
        }
      });
  
      setNewMessage('');
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (selectedFriend) {
        const typingRef = ref(rtdb, `/typing/${chatId}/${user.uid}`);
        remove(typingRef);
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
  };
  
  const handleReaction = async (message: Message, emoji: string) => {
    if (!user) return;
    const messageRef = doc(db, 'messages', message.id);
    const currentReactions = message.reactions || {};
    const userReactedEmoji = Object.keys(currentReactions).find(e => currentReactions[e].includes(user.uid));

    const batch = writeBatch(db);

    // Se o usuário já reagiu (com qualquer emoji), remove a reação antiga
    if (userReactedEmoji) {
      batch.update(messageRef, { [`reactions.${userReactedEmoji}`]: arrayRemove(user.uid) });
    }

    // Se a nova reação não for a mesma que a antiga (ou se não havia antiga), adiciona a nova
    if (userReactedEmoji !== emoji) {
      batch.update(messageRef, { [`reactions.${emoji}`]: arrayUnion(user.uid) });
    }

    await batch.commit();
  };

  const createGroupChat = async (selectedFriendsUids: string[], groupName: string) => {
    if (!user) return;
    try {
      const members = [user.uid, ...selectedFriendsUids];
      await addDoc(collection(db, 'chats'), {
        name: groupName,
        members,
        isGroup: true,
        createdBy: user.uid,
        photoURL: `https://api.dicebear.com/6.x/identicon/svg?seed=${groupName}`,
        lastMessage: null
      });
      setShowGroupModal(false);
    } catch (error) {
      console.error('Erro ao criar grupo:', error);
    }
  };

  const addFriend = async () => {
    if (!newFriendID.trim() || !user) return;
    if (!isValidUserID(newFriendID)) {
      alert('ID inválido! Use o formato: nome#1234');
      return;
    }
    setAddingFriend(true);
    try {
      const q = query(collection(db, 'users'), where('userID', '==', newFriendID));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        alert('Usuário não encontrado!');
        setAddingFriend(false);
        return;
      }
      const friendDoc = querySnapshot.docs[0];
      const friendUID = friendDoc.id;
      const friendData = friendDoc.data();
      if (friendUID === user.uid) {
        alert("Você não pode adicionar a si mesmo!");
        setAddingFriend(false);
        return;
      }
      if (user.friends.includes(friendUID)) {
        alert('Este usuário já é seu amigo!');
        setAddingFriend(false);
        return;
      }
      await updateDoc(doc(db, 'users', user.uid), { friends: arrayUnion(friendUID) });
      await updateDoc(doc(db, 'users', friendUID), { friends: arrayUnion(user.uid) });
      
      const sortedMembers = [user.uid, friendUID].sort();
      const chatsQuery = query(collection(db, 'chats'), where('isGroup', '==', false), where('members', '==', sortedMembers));
      const chatsSnapshot = await getDocs(chatsQuery);
      
      if (chatsSnapshot.empty) {
        await addDoc(collection(db, 'chats'), {
          members: sortedMembers,
          isGroup: false,
          createdBy: user.uid,
          lastMessage: null
        });
      }
      
      setNewFriendID('');
      alert(`${friendData.displayName} adicionado!`);
    } catch (error) {
      console.error('Erro ao adicionar amigo:', error);
      alert('Ocorreu um erro.');
    }
    setAddingFriend(false);
  };
  
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) { console.error('Erro ao fazer logout:', error); }
  };
  
  const updateProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: newDisplayName,
        photoURL: newPhotoURL,
        statusMode: statusMode,
      });
      setUser(prev => prev ? ({ ...prev, displayName: newDisplayName, photoURL: newPhotoURL, statusMode: statusMode }) : null);
      setEditingProfile(false);
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
    }
    setSavingProfile(false);
  };

  const copyUserID = async () => {
    if (!user?.userID) return;
    await navigator.clipboard.writeText(user.userID);
    setCopiedUserID(true);
    setTimeout(() => setCopiedUserID(false), 2000);
  };

  // JSX
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
      <MobileFriendsDrawer friendsCount={sortedChats.length}>
        <div className="flex flex-col h-full overflow-hidden">
            {/* User Info, etc. */}
            <ChatList />
        </div>
      </MobileFriendsDrawer>

      <div className="hidden sm:flex w-80 bg-gray-900 border-r border-gray-700 flex-col overflow-hidden">
          {/* User Info & Actions */}
          <div className="p-4 border-b border-gray-700">
            {/* ... */}
          </div>

          {editingProfile && (
            <div className="p-4 border-b border-gray-700 bg-gray-800">
                {/* ... Edit profile form ... */}
            </div>
          )}

          {/* Add Friend & Group */}
          <div className="p-4 border-b border-gray-700">
              {/* ... Add friend form ... */}
          </div>
          
          <ChatList />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-screen sm:h-auto">
        {selectedChat ? (
          <>
            <div className="bg-gray-900 border-b border-gray-700 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedChat.display_photo} />
                    <AvatarFallback className="bg-gray-700 text-white">{selectedChat.display_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-white font-semibold">{selectedChat.display_name}</h2>
                    {/* Status logic can go here */}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowSearch(!showSearch)} className="text-gray-400 hover:text-white hover:bg-gray-800"><Search className="h-4 w-4" /></Button>
              </div>
              {showSearch && (
                  <div className="mt-3">
                      <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Pesquisar mensagens..." className="bg-gray-700 border-gray-600 text-white"/>
                  </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-800 scrollbar-hide">
              {filteredMessages.map((message) => (
                <div key={message.id} className={`flex ${message.userId === user?.uid ? 'justify-end' : 'justify-start'}`}>
                  {/* ... Message rendering ... */}
                </div>
              ))}
              {isFriendTyping && <div className="text-sm text-gray-400">...digitando</div>}
              <div ref={messagesEndRef} />
            </div>

            <div className="bg-gray-900 border-t border-gray-700 p-4">
              <form onSubmit={sendMessage} className="flex gap-2">
                <Input value={newMessage} onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }} placeholder="Digite sua mensagem..." className="flex-1 bg-gray-700 border-gray-600 text-white" />
                <Button type="submit" disabled={!newMessage.trim()} className="bg-white text-black hover:bg-gray-200"><Send className="h-4 w-4" /></Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-800 p-4">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 text-gray-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">Selecione uma conversa</h2>
              <p className="text-gray-400 text-center">Escolha uma conversa da lista para começar a conversar</p>
            </div>
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