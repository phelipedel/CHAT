// Nova pasta (4)/app/(main)/page.tsx
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  getDoc, 
  updateDoc, 
  where,
  getDocs,
  arrayUnion,
  arrayRemove,
  deleteDoc
} from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { auth, db, rtdb, setupUserPresence, updateUserStatus } from '@/lib/firebase';
import { encryptMessage, decryptMessage } from '@/lib/encryption';
import { isValidUserID } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { 
  MessageCircle, 
  Send, 
  Settings, 
  LogOut, 
  UserPlus, 
  Users, 
  X, 
  Save,
  Circle,
  Clock,
  Eye,
  Trash2,
  Edit,
  Camera,
  Check,
  Search
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserTags } from '@/components/ui/user-tags';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  userID: string;
  friends: string[];
  isAdmin?: boolean;
  statusMode?: 'online' | 'offline' | 'hidden' | 'away';
  status?: string;
  lastSeen?: any;
  tags?: string[];
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  receiverId?: string;
  groupId?: string;
  timestamp: any;
  senderName: string;
  senderPhoto: string;
}

interface Group {
  id: string;
  name: string;
  photoURL: string;
  members: string[];
  createdBy: string;
  createdAt: any;
}

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [friends, setFriends] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedChat, setSelectedChat] = useState<{type: 'friend' | 'group', id: string, name: string, photo: string} | null>(null);
  const [addFriendID, setAddFriendID] = useState('');
  const [showConnectionsModal, setShowConnectionsModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupPhotoURL, setGroupPhotoURL] = useState('https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=150&h=150&fit=crop&crop=center');
  const [selectedFriendsForGroup, setSelectedFriendsForGroup] = useState<string[]>([]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPhotoURL, setNewPhotoURL] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [statusMode, setStatusMode] = useState<'online' | 'offline' | 'hidden' | 'away'>('online');
  const [userStatuses, setUserStatuses] = useState<{[key: string]: {state: string, last_changed: any}}>({});
  const [onlineMembers, setOnlineMembers] = useState<{[key: string]: number}>({});
  const [editingGroupDetails, setEditingGroupDetails] = useState<{ id: string, name: string, photoURL: string } | null>(null);
  const [newGroupPhotoName, setNewGroupPhotoName] = useState('');
  const [newGroupPhotoURL, setNewGroupPhotoURL] = useState('');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  // Inicializar áudio de notificação
  useEffect(() => {
    audioRef.current = new Audio('/notifi/notification.mp3');
    audioRef.current.volume = 0.5;
  }, []);

  // Função para tocar som de notificação
  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = { uid: firebaseUser.uid, ...userDoc.data() } as User;
          setUser(userData);
          setNewDisplayName(userData.displayName);
          setNewPhotoURL(userData.photoURL);
          setStatusMode(userData.statusMode || 'online');
          
          // Configurar presença do usuário
          setupUserPresence(firebaseUser.uid, userData.statusMode || 'online');
        }
      } else {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Monitorar status de todos os usuários
  useEffect(() => {
    const statusRef = ref(rtdb, 'status');
    const unsubscribe = onValue(statusRef, (snapshot) => {
      if (snapshot.exists()) {
        setUserStatuses(snapshot.val());
      }
    });

    return () => unsubscribe();
  }, []);

  // Calcular membros online para grupos
  useEffect(() => {
    const newOnlineMembers: {[key: string]: number} = {};
    
    groups.forEach(group => {
      let onlineCount = 0;
      group.members.forEach(memberId => {
        const status = userStatuses[memberId];
        if (status && status.state === 'online') {
          onlineCount++;
        }
      });
      newOnlineMembers[group.id] = onlineCount;
    });
    
    setOnlineMembers(newOnlineMembers);
  }, [groups, userStatuses]);

  useEffect(() => {
    if (!user) return;

    const friendsQuery = query(
      collection(db, 'users'),
      where('__name__', 'in', user.friends.length > 0 ? user.friends : ['dummy'])
    );

    const unsubscribe = onSnapshot(friendsQuery, (snapshot) => {
      const friendsData = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as User[];
      setFriends(friendsData);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const groupsQuery = query(
      collection(db, 'groups'),
      where('members', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(groupsQuery, (snapshot) => {
      const groupsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Group[];
      setGroups(groupsData);
    });

    return () => unsubscribe();
  }, [user]);

  // Efeito principal para mensagens com reordenação e notificação
  useEffect(() => {
    if (!selectedChat || !user) return;

    let messagesQuery;
    if (selectedChat.type === 'friend') {
      messagesQuery = query(
        collection(db, 'messages'),
        where('participants', 'array-contains', user.uid),
        orderBy('timestamp', 'asc')
      );
    } else {
      messagesQuery = query(
        collection(db, 'messages'),
        where('groupId', '==', selectedChat.id),
        orderBy('timestamp', 'asc')
      );
    }

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      let incomingMessageFromOthersDetected = false;
      let chatToReorderId: string | null = null;
      let chatType: 'friend' | 'group' | null = null;

      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const newMessageDoc = change.doc.data() as Message;
          if (newMessageDoc.senderId !== user.uid) { // Mensagem nova e de outro usuário
            incomingMessageFromOthersDetected = true;
            chatToReorderId = newMessageDoc.receiverId || newMessageDoc.groupId || null;
            chatType = newMessageDoc.receiverId ? 'friend' : (newMessageDoc.groupId ? 'group' : null);

            // Tocar som e exibir toast para esta nova mensagem específica
            if (!isMuted) {
              playNotificationSound();
              const notificationText = chatType === 'friend'
                ? decryptMessage(newMessageDoc.text, newMessageDoc.senderId, user.uid)
                : newMessageDoc.text;
              toast({
                title: `Nova mensagem de ${newMessageDoc.senderName}`,
                description: notificationText.length > 50 ? notificationText.substring(0, 50) + '...' : notificationText,
              });
            }
          }
        }
      });

      const chatSpecificMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];

      setMessages(chatSpecificMessages); // Sempre atualiza o estado das mensagens

      // Reordenar lista de amigos/grupos se alguma nova mensagem de outros foi detectada
      if (incomingMessageFromOthersDetected && chatToReorderId && chatType) {
          if (chatType === 'friend') {
              setFriends(prevFriends => {
                  const friendToMove = prevFriends.find(f => f.uid === chatToReorderId);
                  if (friendToMove) {
                      const filtered = prevFriends.filter(f => f.uid !== chatToReorderId);
                      return [friendToMove, ...filtered]; // Move para o topo
                  }
                  return prevFriends;
              });
          } else if (chatType === 'group') {
              setGroups(prevGroups => {
                  const groupToMove = prevGroups.find(g => g.id === chatToReorderId);
                  if (groupToMove) {
                      const filtered = prevGroups.filter(g => g.id !== chatToReorderId);
                      return [groupToMove, ...filtered]; // Move para o topo
                  }
                  return prevGroups;
              });
          }
      }
    });

    // Dependências mínimas e corretas para o onSnapshot
    return () => unsubscribe();
  }, [selectedChat, user, toast, isMuted]); 

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const updateProfile = async () => {
    if (!user) return;

    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: newDisplayName,
        photoURL: newPhotoURL,
        statusMode: statusMode,
      });

      // Atualizar status de presença
      await updateUserStatus(user.uid, statusMode);

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

  // Função para atualizar detalhes do grupo (nome e foto)
  const updateGroupDetails = async () => {
    if (!editingGroupDetails || !newGroupPhotoName.trim() || !newGroupPhotoURL.trim()) {
      alert('Nome e URL da foto não podem estar vazios.');
      return;
    }

    try {
      await updateDoc(doc(db, 'groups', editingGroupDetails.id), {
        name: newGroupPhotoName,
        photoURL: newGroupPhotoURL
      });
      
      setEditingGroupDetails(null);
      setNewGroupPhotoName('');
      setNewGroupPhotoURL('');
    } catch (error) {
      console.error('Erro ao atualizar grupo:', error);
      alert('Erro ao atualizar grupo. Por favor, tente novamente.');
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat || !user) return;

    try {
      const messageData: any = {
        text: selectedChat.type === 'friend' 
          ? encryptMessage(newMessage, user.uid, selectedChat.id)
          : newMessage, // Mensagens de grupo não são criptografadas por este painel
        senderId: user.uid,
        senderName: user.displayName,
        senderPhoto: user.photoURL,
        timestamp: serverTimestamp(),
      };

      if (selectedChat.type === 'friend') {
        messageData.receiverId = selectedChat.id;
        messageData.participants = [user.uid, selectedChat.id];
      } else {
        messageData.groupId = selectedChat.id;
      }

      await addDoc(collection(db, 'messages'), messageData);
      setNewMessage('');
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      alert('Erro ao enviar mensagem. Por favor, verifique sua conexão ou as permissões.');
    }
  };

  const addFriend = async () => {
    if (!addFriendID.trim() || !user || !isValidUserID(addFriendID)) {
      alert('ID inválido. Use o formato correto (ex: del#1234)');
      return;
    }

    try {
      const usersQuery = query(collection(db, 'users'), where('userID', '==', addFriendID));
      const querySnapshot = await getDocs(usersQuery);
      
      if (querySnapshot.empty) {
        alert('Usuário não encontrado');
        return;
      }

      const friendDoc = querySnapshot.docs[0];
      const friendId = friendDoc.id;

      if (friendId === user.uid) {
        alert('Você não pode adicionar a si mesmo');
        return;
      }

      if (user.friends.includes(friendId)) {
        alert('Este usuário já é seu amigo');
        return;
      }

      await updateDoc(doc(db, 'users', user.uid), {
        friends: arrayUnion(friendId)
      });

      await updateDoc(doc(db, 'users', friendId), {
        friends: arrayUnion(user.uid)
      });

      setAddFriendID('');
      setShowConnectionsModal(false);
    } catch (error) {
      console.error('Erro ao adicionar amigo:', error);
      alert('Erro ao adicionar amigo');
    }
  };

  const createGroup = async () => {
    if (!groupName.trim() || selectedFriendsForGroup.length === 0 || !user) return;

    try {
      const groupData = {
        name: groupName,
        photoURL: groupPhotoURL,
        members: [user.uid, ...selectedFriendsForGroup],
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'groups'), groupData);
      
      setGroupName('');
      setGroupPhotoURL('https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=150&h=150&fit=crop&crop=center');
      setSelectedFriendsForGroup([]);
      setShowConnectionsModal(false);
    } catch (error) {
      console.error('Erro ao criar grupo:', error);
      alert('Erro ao criar grupo');
    }
  };

  const removeFriend = async (friendId: string) => {
    if (!user || !confirm('Tem certeza que deseja remover este amigo?')) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        friends: arrayRemove(friendId)
      });

      await updateDoc(doc(db, 'users', friendId), {
        friends: arrayRemove(user.uid)
      });
    } catch (error) {
      console.error('Erro ao remover amigo:', error);
      alert('Erro ao remover amigo');
    }
  };

  const leaveGroup = async (groupId: string) => {
    if (!user || !confirm('Tem certeza que deseja sair do grupo?')) return;

    try {
      const groupRef = doc(db, 'groups', groupId);
      const groupDoc = await getDoc(groupRef);
      
      if (groupDoc.exists()) {
        const groupData = groupDoc.data() as Group;
        const updatedMembers = groupData.members.filter(id => id !== user.uid);
        
        if (updatedMembers.length === 0) {
          await deleteDoc(groupRef);
        } else {
          await updateDoc(groupRef, {
            members: updatedMembers
          });
        }
        
        if (selectedChat?.id === groupId) {
          setSelectedChat(null);
        }
      }
    } catch (error) {
      console.error('Erro ao sair do grupo:', error);
      alert('Erro ao sair do grupo');
    }
  };

  const getStatusColor = (userId: string) => {
    const status = userStatuses[userId];
    if (!status) return 'bg-gray-500';
    
    switch (status.state) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'hidden': return 'bg-gray-500';
      case 'offline': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <Circle className="h-3 w-3 fill-green-500 text-green-500" />;
      case 'away': return <Clock className="h-3 w-3 text-yellow-500" />;
      case 'hidden': return <Eye className="h-3 w-3 text-gray-500" />;
      case 'offline': return <Circle className="h-3 w-3 fill-gray-500 text-gray-500" />;
      default: return <Circle className="h-3 w-3 fill-gray-500 text-gray-500" />;
    }
  };

  // Filtra as mensagens exibidas com base na searchQuery
  const filteredMessagesForDisplay = useMemo(() => {
    if (searchQuery.trim() === '') {
      return messages;
    }

    return messages.filter(message => {
      // Decripta a mensagem para poder buscar no texto original
      const decryptedText = selectedChat?.type === 'friend' && message.senderId !== user?.uid
        ? decryptMessage(message.text, message.senderId, user.uid || '')
        : selectedChat?.type === 'friend' && message.senderId === user?.uid
        ? decryptMessage(message.text, user.uid || '', selectedChat.id)
        : message.text;
      
      return decryptedText.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [messages, searchQuery, selectedChat, user]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <MessageCircle className="h-12 w-12 text-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex [-webkit-app-region:no-drag]">
      {/* Sidebar */}
      <div className="w-80 bg-gray-900 border-r border-gray-700 flex flex-col">
        {/* Header do usuário */}
        <div className="p-4 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.photoURL} />
                  <AvatarFallback>{user.displayName[0]}</AvatarFallback>
                </Avatar>
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-800 ${getStatusColor(user.uid)}`}></div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{user.displayName}</p>
                <p className="text-gray-400 text-sm truncate">{user.userID}</p>
                {/* Renderiza os emblemas do usuário logado aqui */}
                {user.tags && user.tags.length > 0 && (
                  <div className="mt-1">
                    <UserTags tags={user.tags} size="sm" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingProfile(!editingProfile)}
                className="text-gray-400 hover:text-white hover:bg-gray-700"
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut(auth)}
                className="text-gray-400 hover:text-white hover:bg-gray-700"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Edição de perfil */}
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
              {/* Opção para silenciar notificações */}
              <div className="space-y-2">
                <Label htmlFor="mute-notifications" className="text-white text-sm flex items-center justify-between">
                  Silenciar Notificações
                  <Switch
                    id="mute-notifications"
                    checked={isMuted}
                    onCheckedChange={setIsMuted}
                  />
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
                  onClick={() => setEditingProfile(false)}
                  disabled={savingProfile}
                  className="bg-gray-600 text-white hover:bg-gray-500"
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Botão único para gerenciar conexões */}
        <div className="p-4 border-b border-gray-700 space-y-2 bg-gray-800">
          <Button
            onClick={() => setShowConnectionsModal(true)}
            className="w-full bg-white text-black hover:bg-gray-200 justify-start"
          >
            <Users className="h-4 w-4 mr-2" />
            Gerenciar Conexões
          </Button>
        </div>

        {/* Lista de amigos e grupos */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Amigos */}
          <div className="p-4">
            <h3 className="text-gray-400 text-sm font-medium mb-3">AMIGOS ({friends.length})</h3>
            <div className="space-y-2">
              {friends.map((friend) => (
                <div
                  key={friend.uid}
                  className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-gray-800 group ${
                    selectedChat?.id === friend.uid ? 'bg-gray-800' : ''
                  }`}
                  onClick={() => setSelectedChat({type: 'friend', id: friend.uid, name: friend.displayName, photo: friend.photoURL})}
                >
                  <div className="relative">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={friend.photoURL} />
                      <AvatarFallback>{friend.displayName[0]}</AvatarFallback>
                    </Avatar>
                    <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900 ${getStatusColor(friend.uid)}`}></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{friend.displayName}</p>
                    <div className="flex items-center gap-1">
                      {getStatusIcon(userStatuses[friend.uid]?.state || 'offline')}
                      <p className="text-gray-400 text-xs">
                        {userStatuses[friend.uid]?.state === 'online' ? 'Online' : 
                         userStatuses[friend.uid]?.state === 'away' ? 'Ausente' :
                         userStatuses[friend.uid]?.state === 'hidden' ? 'Oculto' : 'Offline'}
                      </p>
                    </div>
                    {/* Renderiza os emblemas do amigo aqui */}
                    {friend.tags && friend.tags.length > 0 && (
                      <div className="mt-1">
                        <UserTags tags={friend.tags} size="sm" />
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFriend(friend.uid);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Grupos */}
          <div className="p-4">
            <h3 className="text-gray-400 text-sm font-medium mb-3">GRUPOS ({groups.length})</h3>
            <div className="space-y-2">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-gray-800 group ${
                    selectedChat?.id === group.id ? 'bg-gray-800' : ''
                  }`}
                  onClick={() => setSelectedChat({type: 'group', id: group.id, name: group.name, photo: group.photoURL})}
                >
                  <div className="relative">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={group.photoURL} />
                      <AvatarFallback>{group.name[0]}</AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{group.name}</p>
                    <p className="text-gray-400 text-xs">
                      {onlineMembers[group.id] || 0} online • {group.members.length} membros
                    </p>
                  </div>
                  {/* Botões de ação do grupo: Editar e Lixeira */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation(); // Previne que clique no item do grupo
                        setEditingGroupDetails({ id: group.id, name: group.name, photoURL: group.photoURL });
                        setNewGroupPhotoName(group.name);
                        setNewGroupPhotoURL(group.photoURL);
                      }}
                      className="text-gray-400 hover:text-white hover:bg-gray-700"
                    >
                      <Edit className="h-4 w-4" /> {/* Ícone de edição */}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation(); // Previne que clique no item do grupo
                        leaveGroup(group.id);
                      }}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Área principal do chat */}
      <div className="flex-1 flex flex-col">
        {selectedChat ? (
          <>
            {/* Header do chat */}
            <div className="p-4 border-b border-gray-700 bg-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedChat.photo} />
                    <AvatarFallback>{selectedChat.name[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-white font-medium">{selectedChat.name}</h2>
                    {selectedChat.type === 'group' && (
                      <p className="text-gray-400 text-sm">
                        {onlineMembers[selectedChat.id] || 0} online
                      </p>
                    )}
                    {selectedChat.type === 'friend' && (
                      <div className="flex items-center gap-1">
                        {getStatusIcon(userStatuses[selectedChat.id]?.state || 'offline')}
                        <p className="text-gray-400 text-sm">
                          {userStatuses[selectedChat.id]?.state === 'online' ? 'Online' : 
                           userStatuses[selectedChat.id]?.state === 'away' ? 'Ausente' :
                           userStatuses[selectedChat.id]?.state === 'hidden' ? 'Oculto' : 'Offline'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                {/* Campo de busca de mensagens (agora toggleável e à direita) */}
                <div className="relative flex items-center h-10">
                  {!showSearchInput && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowSearchInput(true)}
                      className="text-gray-400 hover:text-white"
                    >
                      <Search className="h-5 w-5" />
                      <span className="sr-only">Abrir busca</span>
                    </Button>
                  )}

                  {showSearchInput && (
                    <div className="flex items-center relative max-w-xs w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar mensagens..."
                        className="w-full pl-9 pr-8 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                        autoFocus
                        onBlur={() => {
                          if (searchQuery.trim() === '') {
                            setShowSearchInput(false);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setShowSearchInput(false);
                            setSearchQuery('');
                          }
                        }}
                      />
                      {searchQuery.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-7 text-gray-400 hover:text-white"
                        >
                          <X className="h-4 w-4" />
                          <span className="sr-only">Limpar busca</span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-gray-900">
              {filteredMessagesForDisplay.map((message) => {
                const isOwn = message.senderId === user.uid;
                const displayText = selectedChat.type === 'friend' && !isOwn
                  ? decryptMessage(message.text, message.senderId, user.uid)
                  : selectedChat.type === 'friend' && isOwn
                  ? decryptMessage(message.text, user.uid, selectedChat.id)
                  : message.text;

                return (
                  <div
                    key={message.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex items-start space-x-2 max-w-xs lg:max-w-md ${isOwn ? 'flex-row-reverse space-x-reverse' : ''}`}>
                      {!isOwn && selectedChat.type === 'group' && (
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={message.senderPhoto} />
                          <AvatarFallback>{message.senderName[0]}</AvatarFallback>
                        </Avatar>
                      )}
                      <div className={`rounded-lg p-3 ${
                        isOwn 
                          ? 'bg-white text-black' 
                          : 'bg-gray-800 text-white'
                      }`}>
                        {!isOwn && selectedChat.type === 'group' && (
                          <p className="text-xs text-gray-400 mb-1">{message.senderName}</p>
                        )}
                        <p className="text-sm">{displayText}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input de mensagem */}
            <div className="p-4 border-t border-gray-700 bg-gray-800">
              <div className="flex space-x-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-gray-700 border-gray-600 text-white"
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                />
                <Button onClick={sendMessage} className="bg-white text-black hover:bg-gray-200">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-white mb-2">Selecione um chat</h3>
              <p className="text-gray-400">Escolha um amigo ou grupo para começar a conversar</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal unificado para gerenciar conexões */}
      {showConnectionsModal && (
        <Dialog open={showConnectionsModal} onOpenChange={setShowConnectionsModal}>
          <DialogContent className="w-full max-w-md bg-gray-900 border border-gray-700 p-0">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="text-white">Gerenciar Conexões</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="addFriend" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4 bg-gray-800">
                <TabsTrigger value="addFriend" className="text-white data-[state=active]:bg-gray-700">Adicionar Amigo</TabsTrigger>
                <TabsTrigger value="createGroup" className="text-white data-[state=active]:bg-gray-700">Criar Grupo</TabsTrigger>
              </TabsList>

              <TabsContent value="addFriend" className="p-6 pt-0">
                <div className="space-y-4">
                  <div>
                    <Label className="text-white text-sm">ID do usuário</Label>
                    <Input
                      value={addFriendID}
                      onChange={(e) => setAddFriendID(e.target.value)}
                      placeholder="del#1234"
                      className="mt-1 bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                    />
                    <p className="text-gray-400 text-xs mt-1">
                      Digite o ID único do usuário (formato: del#1234)
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={addFriend} className="flex-1 bg-white text-black hover:bg-gray-200">
                      Adicionar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowConnectionsModal(false)}
                      className="flex-1 border-gray-600 text-white hover:bg-gray-800"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="createGroup" className="p-6 pt-0">
                <div className="space-y-4">
                  <div>
                    <Label className="text-white text-sm">Nome do grupo</Label>
                    <Input
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="Nome do grupo"
                      className="mt-1 bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                    />
                  </div>
                  <div>
                    <Label className="text-white text-sm">Foto do grupo (URL)</Label>
                    <Input
                      value={groupPhotoURL}
                      onChange={(e) => setGroupPhotoURL(e.target.value)}
                      placeholder="URL da foto"
                      className="mt-1 bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-white text-sm">Selecionar amigos</Label>
                    <div className="mt-2 space-y-2 max-h-40 overflow-y-auto pr-2 scrollbar-hide">
                      {friends.map((friend) => (
                        <div key={friend.uid} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`group-friend-${friend.uid}`}
                            checked={selectedFriendsForGroup.includes(friend.uid)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedFriendsForGroup([...selectedFriendsForGroup, friend.uid]);
                              } else {
                                setSelectedFriendsForGroup(selectedFriendsForGroup.filter(id => id !== friend.uid));
                              }
                            }}
                            className="rounded"
                          />
                          <label htmlFor={`group-friend-${friend.uid}`} className="text-white text-sm flex items-center space-x-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={friend.photoURL} />
                              <AvatarFallback>{friend.displayName[0]}</AvatarFallback>
                            </Avatar>
                            <span>{friend.displayName}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button 
                      onClick={createGroup} 
                      disabled={!groupName.trim() || selectedFriendsForGroup.length === 0}
                      className="flex-1 bg-white text-black hover:bg-gray-200"
                    >
                      Criar Grupo
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowConnectionsModal(false)}
                      className="flex-1 border-gray-600 text-white hover:bg-gray-800"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal para editar grupo (nome e foto) */}
      {editingGroupDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4 bg-gray-900 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white text-lg font-medium">Editar Grupo</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingGroupDetails(null);
                    setNewGroupPhotoName('');
                    setNewGroupPhotoURL('');
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-4">
                <div className="text-center">
                  <Avatar className="h-20 w-20 mx-auto mb-4">
                    <AvatarImage src={newGroupPhotoURL} />
                    <AvatarFallback>
                      {editingGroupDetails?.name[0] || groups.find(g => g.id === editingGroupDetails?.id)?.name[0]}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div>
                  <Label className="text-white text-sm">Nome do grupo</Label>
                  <Input
                    value={newGroupPhotoName}
                    onChange={(e) => setNewGroupPhotoName(e.target.value)}
                    placeholder="Nome do grupo"
                    className="mt-1 bg-gray-800 border-gray-600 text-white"
                  />
                </div>
                <div>
                  <Label className="text-white text-sm">URL da foto do grupo</Label>
                  <Input
                    value={newGroupPhotoURL}
                    onChange={(e) => setNewGroupPhotoURL(e.target.value)}
                    placeholder="URL da nova foto"
                    className="mt-1 bg-gray-800 border-gray-600 text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={updateGroupDetails}
                    disabled={!newGroupPhotoName.trim() || !newGroupPhotoURL.trim()}
                    className="flex-1 bg-white text-black hover:bg-gray-200"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Salvar
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingGroupDetails(null);
                      setNewGroupPhotoName('');
                      setNewGroupPhotoURL('');
                    }}
                    className="flex-1 bg-gray-600 text-white hover:bg-gray-500"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancelar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}