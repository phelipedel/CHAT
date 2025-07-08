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
  setDoc
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { isAdminUID } from '@/lib/config';
import { encryptMessage, decryptMessage } from '@/lib/encryption';
import { setupUserPresence, addSystemLog, rtdb } from '@/lib/firebase';
import { generateUserID, isValidUserID } from '@/lib/utils';
import { UserTags } from '@/components/ui/user-tags';
import { MobileFriendsDrawer } from '@/components/ui/mobile-friends-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  Eye,
  EyeOff
} from 'lucide-react';
import { ref, onValue } from 'firebase/database';

interface Message {
  id: string;
  text: string;
  userId: string;
  userName: string;
  userPhoto: string;
  timestamp: any;
  isImage?: boolean;
  chatId: string;
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
  hideOnlineStatus?: boolean;
}

interface Friend {
  uid: string;
  userID: string;
  displayName: string;
  photoURL: string;
  status?: 'online' | 'offline';
  lastSeen?: any;
  tags?: string[];
  lastMessage?: string;
  lastMessageTime?: any;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPhotoURL, setNewPhotoURL] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [newFriendID, setNewFriendID] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);
  const [copiedUserID, setCopiedUserID] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [hideOnlineStatus, setHideOnlineStatus] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
      loadFriends();
      setupUserPresence(user.uid);
      addSystemLog('INFO', `Usuário ${user.displayName} conectado`, { userID: user.userID });
    }
  }, [user]);

  useEffect(() => {
    if (selectedFriend && user) {
      const unsubscribe = loadMessages();
      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
      };
    }
  }, [selectedFriend, user]);

  useEffect(() => {
    if (selectedFriend && !friends.some(f => f.uid === selectedFriend.uid)) {
      setSelectedFriend(friends[0] || null);
    }
    else if (!selectedFriend && friends.length > 0) {
      setSelectedFriend(friends[0]);
    }
  }, [friends, selectedFriend]);


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
          hideOnlineStatus: userData.hideOnlineStatus || false
        });
        setNewDisplayName(userData.displayName);
        setNewPhotoURL(userData.photoURL);
        setHideOnlineStatus(userData.hideOnlineStatus || false);
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
            hideOnlineStatus: false
          };
          
          await setDoc(doc(db, 'users', userId), newUserData);
          
          setUser({
            uid: userId,
            ...newUserData,
            tags: newUserData.tags || [],
            hideOnlineStatus: newUserData.hideOnlineStatus || false
          });
          setNewDisplayName(newUserData.displayName);
          setNewPhotoURL(newUserData.photoURL);
          setHideOnlineStatus(newUserData.hideOnlineStatus || false);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados do usuário:', error);
    }
    setLoading(false);
  };

  const loadFriends = async () => {
    if (!user || !user.friends || user.friends.length === 0) {
      setFriends([]);
      return;
    }

    try {
      const friendsData: Friend[] = [];
      for (const friendUID of user.friends) {
        const friendDoc = await getDoc(doc(db, 'users', friendUID));
        if (friendDoc.exists()) {
          const friendData = friendDoc.data();
          const friend: Friend = {
            uid: friendUID,
            userID: friendData.userID,
            displayName: friendData.displayName,
            photoURL: friendData.photoURL,
            tags: friendData.tags || [],
            status: 'offline'
          };
          
          // Escutar status de presença do amigo
          const statusRef = ref(rtdb, `/status/${friendUID}`);
          onValue(statusRef, (snapshot) => {
            if (snapshot.exists()) {
              const status = snapshot.val();
              setFriends(prev => prev.map(f => 
                f.uid === friendUID 
                  ? { ...f, status: status.state, lastSeen: status.last_changed }
                  : f
              ));
            }
          });
          
          friendsData.push(friend);
        }
      }
      setFriends(friendsData);
    } catch (error) {
      console.error('Erro ao carregar amigos:', error);
    }
  };

  const loadMessages = () => {
    if (!selectedFriend || !user) return;

    const chatId = [user.uid, selectedFriend.uid].sort().join('_');
    const q = query(
      collection(db, 'messages'), 
      where('chatId', '==', chatId),
      orderBy('timestamp', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedMessages: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        loadedMessages.push({
          id: doc.id,
          text: decryptMessage(data.text, user.uid, selectedFriend.uid),
          userId: data.userId,
          userName: data.userName,
          userPhoto: data.userPhoto,
          timestamp: data.timestamp,
          isImage: data.isImage || false,
          chatId: data.chatId
        });
      });
      setMessages(loadedMessages);
      scrollToBottom();
    }, (error) => {
        console.error("Erro no listener do onSnapshot: ", error);
    });

    return unsubscribe;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !selectedFriend) return;

    const isImageUrl = newMessage.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) || 
                       newMessage.includes('images.unsplash.com') ||
                       newMessage.includes('via.placeholder.com');

    const chatId = [user.uid, selectedFriend.uid].sort().join('_');

    try {
      await addDoc(collection(db, 'messages'), {
        text: encryptMessage(newMessage, user.uid, selectedFriend.uid),
        userId: user.uid,
        userName: user.displayName,
        userPhoto: user.photoURL,
        timestamp: serverTimestamp(),
        isImage: Boolean(isImageUrl),
        chatId: chatId
      });
      setNewMessage('');
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
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

      setUser({
        ...user,
        friends: [...user.friends, friendUID]
      });

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
        hideOnlineStatus: hideOnlineStatus
      });
      
      setUser({
        ...user,
        displayName: newDisplayName,
        photoURL: newPhotoURL,
        hideOnlineStatus: hideOnlineStatus
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
    <div className="h-screen [-webkit-app-region:no-drag] flex bg-black text-white">
      {/* Mobile Friends Drawer */}
      <MobileFriendsDrawer friendsCount={friends.length}>
        <div className="flex flex-col h-full">
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
            <div className="flex gap-2">
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
          </div>
          
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <div className="p-2">
              <h3 className="text-gray-400 text-sm font-medium mb-2 px-2">Amigos ({friends.length})</h3>
              {friends.length === 0 ? (
                <div className="text-center py-8">
                  <MessageCircle className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">Nenhum amigo adicionado</p>
                  <p className="text-gray-600 text-xs">Adicione amigos usando o ID deles</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {friends.map((friend) => (
                    <div
                      key={friend.uid}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors group ${
                        selectedFriend?.uid === friend.uid 
                          ? 'bg-gray-700' 
                          : 'hover:bg-gray-800'
                      }`}
                      onClick={() => setSelectedFriend(friend)}
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={friend.photoURL} />
                          <AvatarFallback className="bg-gray-700 text-white">
                            {friend.displayName?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <Circle 
                          className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-gray-900 ${
                            friend.status === 'online' ? 'fill-green-500 text-green-500' : 'fill-gray-500 text-gray-500'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-white font-medium truncate">{friend.displayName}</h4>
                          {friend.tags && <UserTags tags={friend.tags} size="sm" />}
                        </div>
                        <p className="text-gray-400 text-xs">{friend.userID}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFriend(friend.uid);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 hover:bg-gray-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </MobileFriendsDrawer>

      {/* Desktop Friends Sidebar */}
      <div className="hidden sm:flex w-80 bg-gray-900 border-r border-gray-700 flex-col">
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
              <Input
                value={newPhotoURL}
                onChange={(e) => setNewPhotoURL(e.target.value)}
                placeholder="URL da foto"
                className="bg-gray-700 border-gray-600 text-white"
              />
              <div className="flex items-center space-x-2">
                <Switch
                  id="hide-status"
                  checked={hideOnlineStatus}
                  onCheckedChange={setHideOnlineStatus}
                />
                <Label htmlFor="hide-status" className="text-white text-sm">
                  {hideOnlineStatus ? <EyeOff className="h-4 w-4 inline mr-1" /> : <Eye className="h-4 w-4 inline mr-1" />}
                  Ocultar status online
                </Label>
              </div>
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
          <div className="flex gap-2">
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
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="p-2">
            <h3 className="text-gray-400 text-sm font-medium mb-2 px-2">Amigos ({friends.length})</h3>
            {friends.length === 0 ? (
              <div className="text-center py-8">
                <MessageCircle className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Nenhum amigo adicionado</p>
                <p className="text-gray-600 text-xs">Adicione amigos usando o ID deles</p>
              </div>
            ) : (
              <div className="space-y-1">
                {friends.map((friend) => (
                  <div
                    key={friend.uid}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors group ${
                      selectedFriend?.uid === friend.uid 
                        ? 'bg-gray-700' 
                        : 'hover:bg-gray-800'
                    }`}
                    onClick={() => setSelectedFriend(friend)}
                  >
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={friend.photoURL} />
                        <AvatarFallback className="bg-gray-700 text-white">
                          {friend.displayName?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <Circle 
                        className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-gray-900 ${
                          friend.status === 'online' ? 'fill-green-500 text-green-500' : 'fill-gray-500 text-gray-500'
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-white font-medium truncate">{friend.displayName}</h4>
                        {friend.tags && <UserTags tags={friend.tags} size="sm" />}
                      </div>
                      <p className="text-gray-400 text-xs">{friend.userID}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFriend(friend.uid);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 hover:bg-gray-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-rows-[auto_1fr_auto]">
        {selectedFriend ? (
          <>
            <div className="bg-gray-900 border-b border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={selectedFriend.photoURL} />
                  <AvatarFallback className="bg-gray-700 text-white">
                    {selectedFriend.displayName?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-white font-semibold">{selectedFriend.displayName}</h2>
                  <p className="text-gray-400 text-sm">{selectedFriend.userID}</p>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto p-4 space-y-4 bg-gray-800 scrollbar-hide">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.userId === user?.uid ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-3 ${
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
                    
                    <p className={`text-xs mt-1 ${
                      message.userId === user?.uid ? 'text-gray-600' : 'text-gray-400'
                    }`}>
                      {message.timestamp?.toDate?.().toLocaleTimeString() || 'Enviando...'}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="bg-gray-900 border-t border-gray-700 p-4">
              <form onSubmit={sendMessage} className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
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
          <div className="flex-1 flex items-center justify-center bg-gray-800">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 text-gray-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">Selecione um amigo</h2>
              <p className="text-gray-400">Escolha um amigo da lista para começar a conversar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}