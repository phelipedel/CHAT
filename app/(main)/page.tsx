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
import { setupUserPresence, addSystemLog, rtdb, updateUserStatus } from '@/lib/firebase';
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
  Edit2,
  Save,
  X,
  UserPlus,
  MessageCircle,
  Trash2,
  Copy,
  Check,
  Circle,
  Wifi,
  WifiOff,
  Eye,
  Clock,
  Search,
  Plus,
  Volume2,
  VolumeX
} from 'lucide-react';
import { ref, onValue, set, remove } from 'firebase/database';

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
  const [chats, setChats] = useState<Chat[]>([]);
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
      const chatId = selectedChat.isGroup ? selectedChat.id : [user.uid, selectedFriend?.uid].sort().join('_');
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

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    }
  };

// CÓDIGO MODIFICADO COM UM LINK
const playNotificationSound = () => {
  if (soundEnabled) {
    // Substitua esta URL pelo link do seu som
    const audioUrl = 'https://www.myinstants.com/media/sounds/notificacao.mp3'; 
    const audio = new Audio(audioUrl);
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
      
      for (const friend of friendsData) {
        const sortedMembers = [user.uid, friend.uid].sort();
        const chatId = sortedMembers.join('_'); 
        const chatDocRef = doc(db, 'chats', chatId);
        const chatDoc = await getDoc(chatDocRef);

        if (!chatDoc.exists()) {
          await setDoc(chatDocRef, {
            members: sortedMembers,
            isGroup: false,
            createdBy: user.uid,
            lastMessage: null,
            name: friend.displayName, 
            photoURL: friend.photoURL
          });
        }
      }
      
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
        setChats(chatsData);
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
    const [member1, member2] = selectedChat.members;
  
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
          text: selectedChat.isGroup ? data.text : decryptMessage(data.text, member1, member2),
          userId: data.userId,
          userName: data.userName,
          userPhoto: data.userPhoto,
          timestamp: data.timestamp,
          isImage: data.isImage || false,
          chatId: data.chatId,
          readBy: data.readBy || [],
          reactions: data.reactions || {}
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
              tag: chatId,
              data: { url: window.location.origin }
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

    const chatId = selectedChat.isGroup ? selectedChat.id : [user.uid, selectedFriend?.uid].sort().join('_');
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
      const typingRef = ref(rtdb, `/typing/${chatId}/${user.uid}`);
      remove(typingRef);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
  };

  const handleReaction = async (message: Message, emoji: string) => {
    if (!user) return;

    try {
      const messageRef = doc(db, 'messages', message.id);
      const currentReactions = message.reactions || {};
      const userReactions = Object.keys(currentReactions).filter(e => 
        currentReactions[e].includes(user.uid)
      );

      const batch = writeBatch(db);

      userReactions.forEach(reactionEmoji => {
        if (reactionEmoji !== emoji) {
          batch.update(messageRef, {
            [`reactions.${reactionEmoji}`]: arrayRemove(user.uid)
          });
        }
      });

      const currentEmojiReactions = currentReactions[emoji] || [];
      if (currentEmojiReactions.includes(user.uid)) {
        batch.update(messageRef, {
          [`reactions.${emoji}`]: arrayRemove(user.uid)
        });
      } else {
        batch.update(messageRef, {
          [`reactions.${emoji}`]: arrayUnion(user.uid)
        });
      }

      await batch.commit();
    } catch (error) {
      console.error('Erro ao adicionar reação:', error);
    }
  };

  const createGroupChat = async (selectedFriends: string[], groupName: string) => {
    if (!user) return;

    try {
      const members = [user.uid, ...selectedFriends];
      await addDoc(collection(db, 'chats'), {
        name: groupName,
        members,
        isGroup: true,
        createdBy: user.uid,
        photoURL: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=150&h=150&fit=crop&crop=face',
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
      alert('ID inválido! Use o formato: del#1234');
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
        alert('Este usuário já está na sua lista de amigos!');
        setAddingFriend(false);
        return;
      }

      await updateDoc(doc(db, 'users', user.uid), {
        friends: arrayUnion(friendUID)
      });

      await updateDoc(doc(db, 'users', friendUID), {
        friends: arrayUnion(user.uid)
      });
      
      loadChats();

      setNewFriendID('');
      alert(`${friendData.displayName} foi adicionado como amigo!`);
    } catch (error) {
      console.error('Erro ao adicionar amigo:', error);
      alert('Erro ao adicionar amigo. Tente novamente.');
    }
    setAddingFriend(false);
  };

  const removeFriend = async (friendUID: string) => {
    if (!user) return;

    if (confirm('Tem certeza que deseja remover este amigo?')) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          friends: arrayRemove(friendUID)
        });

        await updateDoc(doc(db, 'users', friendUID), {
          friends: arrayRemove(user.uid)
        });

        setUser({
          ...user,
          friends: user.friends.filter(f => f !== friendUID)
        });
        
      } catch (error) {
        console.error('Erro ao remover amigo:', error);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
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
      
      setUser({
        ...user,
        displayName: newDisplayName,
        photoURL: newPhotoURL,
        statusMode: statusMode,
      });
      setEditingProfile(false);
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      alert('Erro ao salvar perfil. Tente novamente.');
    }
    setSavingProfile(false);
  };

  const copyUserID = async () => {
    if (!user?.userID) return;
    
    try {
      await navigator.clipboard.writeText(user.userID);
      setCopiedUserID(true);
      setTimeout(() => setCopiedUserID(false), 2000);
    } catch (error) {
      const textArea = document.createElement('textarea');
      textArea.value = user.userID;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedUserID(true);
      setTimeout(() => setCopiedUserID(false), 2000);
    }
  };

  const selectChat = (chat: Chat) => {
    setSelectedChat(chat);
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
      <MobileFriendsDrawer friendsCount={chats.length}>
        <div className="flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-12 w-12 ring-2 ring-white">
                <AvatarImage src={user?.photoURL} />
                <AvatarFallback className="bg-gray-700 text-white">
                  {user?.displayName?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-white font-semibold">{user?.displayName}</h2>
                  {user?.tags && <UserTags tags={user.tags} size="sm" />}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="text-xs bg-green-600 text-white">
                      {user?.userID}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copyUserID}
                      className="h-6 w-6 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
                      title="Copiar ID"
                    >
                      {copiedUserID ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  {user?.isAdmin && (
                    <Badge variant="destructive" className="text-xs">
                      <Shield className="h-3 w-3 mr-1" />
                      Admin
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-b border-gray-700">
            <div className="mb-2">
              <p className="text-xs text-gray-400 mb-1">Adicionar amigo pelo ID:</p>
            </div>
            <div className="flex gap-2 mb-2">
              <Input
                value={newFriendID}
                onChange={(e) => setNewFriendID(e.target.value)}
                placeholder="ID do amigo (ex: del#1234)"
                className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    addFriend();
                  }
                }}
              />
              <Button
                onClick={addFriend}
                disabled={addingFriend}
                className="bg-white text-black hover:bg-gray-200"
                title="Adicionar amigo"
              >
                {addingFriend ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button
              onClick={() => setShowGroupModal(true)}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Criar Grupo
            </Button>
          </div>
          
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <div className="p-2">
              <h3 className="text-gray-400 text-sm font-medium mb-2 px-2">Conversas ({chats.length})</h3>
              {chats.length === 0 ? (
                <div className="text-center py-8">
                  <MessageCircle className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">Nenhuma conversa</p>
                  <p className="text-gray-600 text-xs">Adicione amigos para começar</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {chats.map((chat) => {
                    const friendInChat = !chat.isGroup 
                      ? friends.find(f => chat.members.includes(f.uid) && f.uid !== user?.uid) 
                      : null;

                    return (
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
                          <AvatarImage src={chat.isGroup ? chat.photoURL : friendInChat?.photoURL} />
                          <AvatarFallback className="bg-gray-700 text-white">
                            {chat.isGroup ? chat.name?.charAt(0) : friendInChat?.displayName?.charAt(0) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium truncate">
                            {chat.isGroup ? chat.name : friendInChat?.displayName || 'Chat Privado'}
                          </h4>
                          {chat.lastMessage && (
                            <p className="text-gray-400 text-xs truncate">
                              {chat.lastMessage.text}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </MobileFriendsDrawer>

      <div className="hidden sm:flex w-80 bg-gray-900 border-r border-gray-700 flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-12 w-12 ring-2 ring-white">
              <AvatarImage src={user?.photoURL} />
              <AvatarFallback className="bg-gray-700 text-white">
                {user?.displayName?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-white font-semibold">{user?.displayName}</h2>
                {user?.tags && <UserTags tags={user.tags} size="sm" />}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-xs bg-green-600 text-white">
                    {user?.userID}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyUserID}
                    className="h-6 w-6 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
                    title="Copiar ID"
                  >
                    {copiedUserID ? (
                      <Check className="h-3 w-3 text-green-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                {user?.isAdmin && (
                  <Badge variant="destructive" className="text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    Admin
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingProfile(!editingProfile)}
              className="text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="text-gray-400 hover:text-white hover:bg-gray-800"
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            {user?.isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/admin')}
                className="text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <Users className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {editingProfile && (
          <div className="p-4 border-b border-gray-700 bg-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white text-sm font-medium">Editar Perfil</h3>
            </div>
            <div className="space-y-3">
              <Input
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Nome de exibição"
                className="bg-gray-700 border-gray-600 text-white"
              />
              <div className="space-y-2">
                <Label htmlFor="status-mode" className="text-white text-sm">
                  Status de presença:
                </Label>
                <Select value={statusMode} onValueChange={(value: 'online' | 'offline' | 'hidden' | 'away') => setStatusMode(value)}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="online" className="text-white hover:bg-gray-700">
                      <div className="flex items-center gap-2">
                        <Circle className="h-3 w-3 fill-green-500 text-green-500" />
                        Online
                      </div>
                    </SelectItem>
                    <SelectItem value="away" className="text-white hover:bg-gray-700">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-yellow-500" />
                        Ausente
                      </div>
                    </SelectItem>
                    <SelectItem value="hidden" className="text-white hover:bg-gray-700">
                      <div className="flex items-center gap-2">
                        <Eye className="h-3 w-3 text-gray-500" />
                        Oculto
                      </div>
                    </SelectItem>
                    <SelectItem value="offline" className="text-white hover:bg-gray-700">
                      <div className="flex items-center gap-2">
                        <Circle className="h-3 w-3 fill-gray-500 text-gray-500" />
                        Offline
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                value={newPhotoURL}
                onChange={(e) => setNewPhotoURL(e.target.value)}
                placeholder="URL da foto"
                className="bg-gray-700 border-gray-600 text-white"
              />
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={updateProfile} 
                  disabled={savingProfile}
                  className="bg-white text-black hover:bg-gray-200"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {savingProfile ? 'Salvando...' : 'Salvar'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setEditingProfile(false)} 
                  disabled={savingProfile}
                  className="border-gray-600 text-white hover:bg-gray-800"
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="p-4 border-b border-gray-700">
          <div className="mb-2">
            <p className="text-xs text-gray-400 mb-1">Adicionar amigo pelo ID:</p>
          </div>
          <div className="flex gap-2 mb-2">
            <Input
              value={newFriendID}
              onChange={(e) => setNewFriendID(e.target.value)}
              placeholder="ID do amigo (ex: del#1234)"
              className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  addFriend();
                }
              }}
            />
            <Button
              onClick={addFriend}
              disabled={addingFriend}
              className="bg-white text-black hover:bg-gray-200"
              title="Adicionar amigo"
            >
              {addingFriend ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
            </Button>
          </div>
          <Button
            onClick={() => setShowGroupModal(true)}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Criar Grupo
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="p-2">
            <h3 className="text-gray-400 text-sm font-medium mb-2 px-2">Conversas ({chats.length})</h3>
            {chats.length === 0 ? (
              <div className="text-center py-8">
                <MessageCircle className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Nenhuma conversa</p>
                <p className="text-gray-600 text-xs">Adicione amigos para começar</p>
              </div>
            ) : (
              <div className="space-y-1">
                {chats.map((chat) => {
                  const friendInChat = !chat.isGroup 
                    ? friends.find(f => chat.members.includes(f.uid) && f.uid !== user?.uid) 
                    : null;
                  return (
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
                        <AvatarImage src={chat.isGroup ? chat.photoURL : friendInChat?.photoURL} />
                        <AvatarFallback className="bg-gray-700 text-white">
                          {chat.isGroup ? chat.name?.charAt(0) : friendInChat?.displayName?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-medium truncate">
                          {chat.isGroup ? chat.name : friendInChat?.displayName || 'Chat Privado'}
                        </h4>
                        {chat.lastMessage && (
                          <p className="text-gray-400 text-xs truncate">
                            {chat.lastMessage.text}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-screen sm:h-auto">
        {selectedChat ? (
          <>
            <div className="bg-gray-900 border-b border-gray-700 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedChat.isGroup ? selectedChat.photoURL : selectedFriend?.photoURL} />
                    <AvatarFallback className="bg-gray-700 text-white">
                      {selectedChat.isGroup ? selectedChat.name?.charAt(0) : selectedFriend?.displayName?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-white font-semibold">
                      {selectedChat.isGroup ? selectedChat.name : selectedFriend?.displayName}
                    </h2>
                    <div className="flex items-center gap-2">
                      {!selectedChat.isGroup && selectedFriend && (
                        <>
                          <p className="text-gray-400 text-sm">{selectedFriend.userID}</p>
                          {selectedFriend.status && selectedFriend.status !== 'hidden' && (
                            <Badge 
                              variant="secondary" 
                              className={`text-xs ${
                                selectedFriend.status === 'online' 
                                  ? 'bg-green-600 text-white' 
                                  : selectedFriend.status === 'away'
                                  ? 'bg-yellow-600 text-white'
                                  : 'bg-gray-600 text-white'
                              }`}
                            >
                              {selectedFriend.status === 'online' && <Circle className="h-2 w-2 mr-1 fill-current" />}
                              {selectedFriend.status === 'away' && <Clock className="h-2 w-2 mr-1" />}
                              {selectedFriend.status === 'offline' && <Circle className="h-2 w-2 mr-1 fill-current" />}
                              {selectedFriend.status === 'online' ? 'Online' : 
                               selectedFriend.status === 'away' ? 'Ausente' : 'Offline'}
                            </Badge>
                          )}
                        </>
                      )}
                      {selectedChat.isGroup && (
                        <p className="text-gray-400 text-sm">{selectedChat.members.length} membros</p>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSearch(!showSearch)}
                  className="text-gray-400 hover:text-white hover:bg-gray-800"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {showSearch && (
                <div className="mt-3">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar mensagens..."
                    className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-800 scrollbar-hide">
              {filteredMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.userId === user?.uid ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-3 relative group ${
                      message.userId === user?.uid
                        ? 'bg-white text-black'
                        : 'bg-gray-700 text-white'
                    }`}
                  >
                    {message.userId !== user?.uid && (
                      <div className="flex items-center gap-2 mb-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={message.userPhoto} />
                          <AvatarFallback className="bg-gray-600 text-white text-xs">
                            {message.userName?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-gray-300">{message.userName}</span>
                      </div>
                    )}
                    
                    {message.isImage ? (
                      <img
                        src={message.text}
                        alt="Imagem compartilhada"
                        className="max-w-full h-auto rounded-lg"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          target.style.display = 'none';
                          const nextEl = target.nextElementSibling as HTMLElement;
                          if (nextEl) {
                            nextEl.textContent = 'Erro ao carregar imagem';
                          }
                        }}
                      />
                    ) : (
                      <p className="break-words">{message.text}</p>
                    )}

                    <ReactionPills 
                      reactions={message.reactions || {}} 
                      onReactionClick={(emoji) => handleReaction(message, emoji)}
                      currentUserId={user?.uid || ''}
                    />
                    
                    <div className="flex items-center justify-between mt-1">
                      <p className={`text-xs ${
                        message.userId === user?.uid ? 'text-gray-600' : 'text-gray-400'
                      }`}>
                        {message.timestamp?.toDate?.().toLocaleTimeString() || 'Enviando...'}
                      </p>
                      {message.userId === user?.uid && (
                        <MessageStatusIcon 
                          message={message} 
                          currentUser={user} 
                          selectedFriend={selectedFriend}
                        />
                      )}
                    </div>

                    <ReactionPopover 
                      onReactionSelect={(emoji) => handleReaction(message, emoji)}
                    />
                  </div>
                </div>
              ))}
              
              {isFriendTyping && (
                <div className="flex justify-start">
                  <div className="bg-gray-700 text-white rounded-lg p-3 max-w-[70%]">
                    <div className="flex items-center gap-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                      <span className="text-sm text-gray-400">digitando...</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            <div className="bg-gray-900 border-t border-gray-700 p-4">
              <form onSubmit={sendMessage} className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    handleTyping();
                  }}
                  placeholder="Digite sua mensagem ou cole uma URL de imagem..."
                  className="flex-1 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-white"
                />
                <Button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="bg-white text-black hover:bg-gray-200"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              <p className="text-xs text-gray-500 mt-2">
                <ImageIcon className="inline h-3 w-3 mr-1" />
                Dica: Cole uma URL de imagem para compartilhar fotos
              </p>
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