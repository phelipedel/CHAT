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

// ... (interfaces remain the same)

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
  const [chats, setChats] = useState<Chat[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<{ [chatId: string]: number }>({});
  const [sortedChats, setSortedChats] = useState<Chat[]>([]);
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const sortChatsByActivity = (chatsToSort: Chat[]) => {
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
      loadChats();
      setupUserPresence(user.uid, statusMode);
      requestNotificationPermission();
    }
  }, [user]);

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
    if (selectedFriend?.uid) {
      const statusRef = ref(rtdb, `/status/${selectedFriend.uid}`);
      const unsubscribe = onValue(statusRef, (snapshot) => {
        if (snapshot.exists()) {
          const status = snapshot.val();
          setSelectedFriend(currentFriend => ({
            ...currentFriend!,
            status: status.state || 'offline',
            lastSeen: status.last_changed
          }));
        }
      });
      return () => unsubscribe();
    }
  }, [selectedFriend?.uid]);

  useEffect(() => {
    if (selectedChat && user) {
      const chatId = selectedChat.id;
      const typingRef = ref(rtdb, `/typing/${chatId}`);

      const unsubscribe = onValue(typingRef, (snapshot) => {
        if (snapshot.exists()) {
          const typingData = snapshot.val();
          const isTyping = Object.keys(typingData).some(uid => uid !== user.uid && typingData[uid] === true);
          setIsFriendTyping(isTyping);
        } else {
          setIsFriendTyping(false);
        }
      });

      return () => unsubscribe();
    }
  }, [selectedChat, user, selectedFriend]);

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

  useEffect(() => {
    if (user && chats.length > 0) {
      const unsubscribes = chats.map(chat => {
        const q = query(
          collection(db, 'messages'),
          where('chatId', '==', chat.id)
        );
        return onSnapshot(q, (snapshot) => {
          const count = snapshot.docs.filter(doc => !doc.data().readBy?.includes(user.uid)).length;
          setUnreadCounts(prevCounts => ({
            ...prevCounts,
            [chat.id]: count,
          }));
        });
      });
      return () => unsubscribes.forEach(unsub => unsub());
    }
  }, [user, chats]);

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
            photoURL: currentUser.photoURL || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
            isAdmin: isUserAdmin,
            createdAt: new Date(),
            userID: userID,
            friends: [],
            tags: [],
            statusMode: 'online'
          };

          await setDoc(doc(db, 'users', userId), newUserData);

          setUser({
            uid: userId,
            ...newUserData,
            tags: newUserData.tags || [],
            statusMode: newUserData.statusMode || 'online'
          });
          setNewDisplayName(newUserData.displayName);
          setNewPhotoURL(newUserData.photoURL);
          setStatusMode(newUserData.statusMode || 'online');
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados do usuário:', error);
    }
    setLoading(false);
  };

  const loadChats = async () => {
    if (!user) return;

    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.data();
      const userFriends = userData?.friends || [];

      const friendsData: Friend[] = [];
      for (const friendUID of userFriends) {
        const friendDoc = await getDoc(doc(db, 'users', friendUID));
        if (friendDoc.exists()) {
          const friendData = friendDoc.data();
          friendsData.push({
            uid: friendUID,
            userID: friendData.userID,
            displayName: friendData.displayName,
            photoURL: friendData.photoURL,
            tags: friendData.tags || [],
            status: 'offline'
          });
        }
      }
      setFriends(friendsData);

      const statusUnsubscribes: Function[] = [];
      friendsData.forEach(friend => {
        const statusRef = ref(rtdb, `/status/${friend.uid}`);
        const unsubscribe = onValue(statusRef, (snapshot) => {
          if (snapshot.exists()) {
            const status = snapshot.val();
            setFriends(prev => prev.map(f =>
              f.uid === friend.uid
                ? { ...f, status: status.state, lastSeen: status.last_changed }
                : f
            ));
          }
        });
        statusUnsubscribes.push(unsubscribe);
      });

      const q = query(
        collection(db, 'chats'),
        where('members', 'array-contains', user.uid)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const chatsData: Chat[] = [];
        snapshot.forEach((doc) => {
          chatsData.push({
            id: doc.id,
            ...doc.data()
          } as Chat);
        });
        const sorted = sortChatsByActivity(chatsData);
        setChats(chatsData);
        setSortedChats(sorted);
      });

      return () => {
        unsubscribe();
        statusUnsubscribes.forEach(unsub => unsub());
      };
    } catch (error) {
      console.error('Erro ao carregar chats:', error);
    }
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
          text: selectedChat.isGroup ? data.text : decryptMessage(data.text, user.uid, selectedFriend?.uid || ''),
          userId: data.userId,
          userName: data.userName,
          userPhoto: data.userPhoto,
          timestamp: data.timestamp,
          isImage: data.isImage || false,
          chatId: data.chatId,
          readBy: data.readBy || [],
        };
        loadedMessages.push(message);
      });

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const message = loadedMessages.find(m => m.id === change.doc.id);
          if (message && data.userId !== user.uid && !document.hasFocus()) {
            playNotificationSound();
            showSystemNotification(`Nova mensagem de ${data.userName}`, {
              body: message.text,
              icon: data.userPhoto,
              tag: chatId
            });
          }
        }
      });

      loadedMessages.sort((a, b) => {
        return (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0);
      });

      setMessages(loadedMessages);
      scrollToBottom();
    }, (error) => {
      console.error("Erro no listener do onSnapshot: ", error);
    });
  };

  const handleTyping = () => {
    if (!selectedChat || !user) return;

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
      const typingRef = ref(rtdb, `/typing/${chatId}/${user.uid}`);
      remove(typingRef);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
  };

  // ... (handleReaction, createGroupChat, addFriend, removeFriend, handleLogout, updateProfile, copyUserID functions remain the same)

  const selectChat = (chat: Chat) => {
    setSelectedChat(chat);
    if (unreadCounts[chat.id] > 0) {
      setUnreadCounts(prev => ({ ...prev, [chat.id]: 0 }));
    }
    if (!chat.isGroup) {
      const friendUID = chat.members.find(uid => uid !== user?.uid);
      if (friendUID) {
        getDoc(doc(db, 'users', friendUID)).then(friendDoc => {
          if (friendDoc.exists()) {
            const friendData = friendDoc.data();
            setSelectedFriend({
              uid: friendUID,
              userID: friendData.userID,
              displayName: friendData.displayName,
              photoURL: friendData.photoURL,
              tags: friendData.tags || [],
              status: 'offline'
            });
          }
        });
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

  return (
    <div className="h-screen [-webkit-app-region:no-drag] flex bg-black text-white overflow-hidden">
      <MobileFriendsDrawer friendsCount={sortedChats.length}>
        {/* ... (MobileFriendsDrawer content is the same, but map over sortedChats) */}
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
              {/* ... (Avatar and chat info) */}
              {unreadCounts[chat.id] > 0 && (
                <div className="ml-auto">
                  <Badge variant="destructive">{unreadCounts[chat.id] > 99 ? '99+' : unreadCounts[chat.id]}</Badge>
                </div>
              )}
            </div>
          ))}
        </div>
      </MobileFriendsDrawer>

      <div className="hidden sm:flex w-80 bg-gray-900 border-r border-gray-700 flex-col overflow-hidden">
        {/* ... (Sidebar content is the same, but map over sortedChats) */}
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
              {/* ... (Avatar and chat info) */}
              {unreadCounts[chat.id] > 0 && (
                <div className="ml-auto">
                  <Badge variant="destructive">{unreadCounts[chat.id] > 99 ? '99+' : unreadCounts[chat.id]}</Badge>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-screen sm:h-auto">
        {/* ... (Rest of the component remains the same) */}
      </div>
    </div>
  );
}