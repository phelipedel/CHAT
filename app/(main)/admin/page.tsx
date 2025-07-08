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
import { addSystemLog } from '@/lib/firebase';
import { generateUserID, isValidUserID } from '@/lib/utils';
import { UserTags } from '@/components/ui/user-tags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
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
  Database,
  AlertTriangle,
  FileText,
  UserCog,
  Trash
} from 'lucide-react';

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
}

interface Friend {
  uid: string;
  userID: string;
  displayName: string;
  photoURL: string;
  lastMessage?: string;
  lastMessageTime?: any;
  tags?: string[];
}

interface SystemLog {
  id: string;
  level: 'INFO' | 'ERROR' | 'WARNING';
  message: string;
  details?: any;
  timestamp: any;
  createdAt: any;
}

interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  userID: string;
  tags: string[];
  isAdmin: boolean;
  friends: string[];
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
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [clearingDatabase, setClearingDatabase] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'logs' | 'users'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const availableTags = ['ADM', 'Suporte', 'Verificado', 'Beta'];

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
      loadSystemLogs();
      loadAllUsers();
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

  // ALTERAÇÃO: Este novo useEffect garante que a seleção de amigo seja mantida.
  useEffect(() => {
    // Se um amigo está selecionado, mas ele não existe mais na lista de amigos (foi removido).
    if (selectedFriend && !friends.some(f => f.uid === selectedFriend.uid)) {
      // Seleciona o primeiro amigo da lista, ou null se não houver mais amigos.
      setSelectedFriend(friends[0] || null);
    }
    // Se nenhum amigo está selecionado, mas a lista de amigos não está vazia.
    else if (!selectedFriend && friends.length > 0) {
      setSelectedFriend(friends[0]);
    }
  }, [friends]); // Roda sempre que a lista de amigos mudar.


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
          tags: userData.tags || []
        });
        setNewDisplayName(userData.displayName);
        setNewPhotoURL(userData.photoURL);
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
            tags: []
          };
          
          await setDoc(doc(db, 'users', userId), newUserData);
          
          setUser({
            uid: userId,
            ...newUserData,
            tags: newUserData.tags || []
          });
          setNewDisplayName(newUserData.displayName);
          setNewPhotoURL(newUserData.photoURL);
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
          friendsData.push({
            uid: friendUID,
            userID: friendData.userID,
            displayName: friendData.displayName,
            photoURL: friendData.photoURL,
            tags: friendData.tags || []
          });
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

  const loadSystemLogs = () => {
    const q = query(
      collection(db, 'logs'),
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedLogs: SystemLog[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        loadedLogs.push({
          id: doc.id,
          level: data.level,
          message: data.message,
          details: data.details,
          timestamp: data.timestamp,
          createdAt: data.createdAt
        });
      });
      setLogs(loadedLogs);
    });

    return unsubscribe;
  };

  const loadAllUsers = async () => {
    try {
      const q = query(collection(db, 'users'));
      const querySnapshot = await getDocs(q);
      const users: AppUser[] = [];
      
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        users.push({
          uid: doc.id,
          email: userData.email,
          displayName: userData.displayName,
          photoURL: userData.photoURL,
          userID: userData.userID,
          tags: userData.tags || [],
          isAdmin: isAdminUID(doc.id),
          friends: userData.friends || []
        });
      });
      
      setAllUsers(users);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const clearChatHistory = async () => {
    if (!confirm('ATENÇÃO: Esta ação irá apagar TODAS as mensagens do chat. Esta ação não pode ser desfeita. Tem certeza?')) {
      return;
    }

    setClearingDatabase(true);
    try {
      const messagesQuery = query(collection(db, 'messages'));
      const messagesSnapshot = await getDocs(messagesQuery);
      
      const deletePromises = messagesSnapshot.docs.map(doc => 
        doc.ref.delete()
      );
      
      await Promise.all(deletePromises);
      
      await addSystemLog('WARNING', 'Histórico de conversas limpo pelo administrador', { 
        adminUID: user?.uid,
        adminName: user?.displayName,
        messagesDeleted: messagesSnapshot.size
      });
      
      alert(`${messagesSnapshot.size} mensagens foram deletadas com sucesso.`);
    } catch (error) {
      console.error('Erro ao limpar banco de dados:', error);
      alert('Erro ao limpar banco de dados. Tente novamente.');
    }
    setClearingDatabase(false);
  };

  const updateUserTags = async () => {
    if (!selectedUser) return;

    // Validação: apenas admins podem adicionar tag ADM
    if (selectedTags.includes('ADM') && !user?.isAdmin) {
      alert('Apenas administradores podem atribuir a tag ADM');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', selectedUser.uid), {
        tags: selectedTags
      });
      
      await addSystemLog('INFO', 'Tags de usuário atualizadas', {
        targetUser: selectedUser.displayName,
        targetUID: selectedUser.uid,
        newTags: selectedTags,
        adminUID: user?.uid,
        adminName: user?.displayName
      });
      
      // Atualizar lista local
      setAllUsers(prev => prev.map(u => 
        u.uid === selectedUser.uid 
          ? { ...u, tags: selectedTags }
          : u
      ));
      
      setSelectedUser(null);
      setSelectedTags([]);
      alert('Tags atualizadas com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar tags:', error);
      alert('Erro ao atualizar tags. Tente novamente.');
    }
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
        
        // A lógica de seleção agora é tratada pelo novo useEffect
        
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
        photoURL: newPhotoURL
      });
      
      setUser({
        ...user,
        displayName: newDisplayName,
        photoURL: newPhotoURL
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
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400">Carregando chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen [-webkit-app-region:no-drag] flex bg-black text-white">
      <div className="w-80 bg-gray-900 border-r border-gray-700 flex flex-col overflow-hidden">
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

        {/* Admin Navigation */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex gap-1">
            <Button
              variant={activeTab === 'chat' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('chat')}
              className="flex-1 text-xs"
            >
              <MessageCircle className="h-3 w-3 mr-1" />
              Chat
            </Button>
            <Button
              variant={activeTab === 'logs' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('logs')}
              className="flex-1 text-xs"
            >
              <FileText className="h-3 w-3 mr-1" />
              Logs
            </Button>
            <Button
              variant={activeTab === 'users' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('users')}
              className="flex-1 text-xs"
            >
              <UserCog className="h-3 w-3 mr-1" />
              Usuários
            </Button>
          </div>
        </div>

        {activeTab === 'chat' && (
          <>
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

        <div className="flex-1 overflow-y-auto">
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
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={friend.photoURL} />
                      <AvatarFallback className="bg-gray-700 text-white">
                        {friend.displayName?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
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
          </>
        )}

        {activeTab === 'logs' && (
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium">Logs do Sistema</h3>
                <Badge variant="secondary" className="text-xs">
                  {logs.length} registros
                </Badge>
              </div>
              
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-3 rounded-lg border-l-4 ${
                      log.level === 'ERROR' 
                        ? 'bg-red-900/20 border-red-500' 
                        : log.level === 'WARNING'
                        ? 'bg-yellow-900/20 border-yellow-500'
                        : 'bg-blue-900/20 border-blue-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge 
                        variant={log.level === 'ERROR' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {log.level}
                      </Badge>
                      <span className="text-xs text-gray-400">
                        {log.timestamp?.toDate?.().toLocaleString() || 'Agora'}
                      </span>
                    </div>
                    <p className="text-sm text-white">{log.message}</p>
                    {log.details && (
                      <pre className="text-xs text-gray-400 mt-2 overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
                
                {logs.length === 0 && (
                  <div className="text-center py-8">
                    <FileText className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">Nenhum log encontrado</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium">Gerenciar Usuários</h3>
                <Badge variant="secondary" className="text-xs">
                  {allUsers.length} usuários
                </Badge>
              </div>
              
              {/* Database Management */}
              <Card className="bg-gray-800 border-gray-700 mb-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Gerenciamento do Banco
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={clearChatHistory}
                    disabled={clearingDatabase}
                    variant="destructive"
                    size="sm"
                    className="w-full"
                  >
                    {clearingDatabase ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ) : (
                      <Trash className="h-4 w-4 mr-2" />
                    )}
                    {clearingDatabase ? 'Limpando...' : 'Limpar Histórico de Conversas'}
                  </Button>
                  <p className="text-xs text-gray-400 mt-2">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    Esta ação não pode ser desfeita
                  </p>
                </CardContent>
              </Card>
              
              {/* User Management */}
              <div className="space-y-2">
                {allUsers.map((appUser) => (
                  <div
                    key={appUser.uid}
                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={appUser.photoURL} />
                      <AvatarFallback className="bg-gray-700 text-white text-xs">
                        {appUser.displayName?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-white font-medium truncate text-sm">{appUser.displayName}</h4>
                        {appUser.tags && <UserTags tags={appUser.tags} size="sm" />}
                      </div>
                      <p className="text-gray-400 text-xs">{appUser.userID}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(appUser);
                        setSelectedTags([...appUser.tags]);
                      }}
                      className="text-gray-400 hover:text-white hover:bg-gray-600"
                    >
                      <UserCog className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User Tags Management Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <Avatar className="h-10 w-10">
                <AvatarImage src={selectedUser.photoURL} />
                <AvatarFallback className="bg-gray-700 text-white">
                  {selectedUser.displayName?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-white font-medium">{selectedUser.displayName}</h3>
                <p className="text-gray-400 text-sm">{selectedUser.userID}</p>
              </div>
            </div>
            
            <Separator className="my-4 bg-gray-700" />
            
            <div className="space-y-4">
              <div>
                <Label className="text-white text-sm font-medium">Tags do Usuário</Label>
                <div className="mt-2 space-y-2">
                  {availableTags.map((tag) => (
                    <div key={tag} className="flex items-center space-x-2">
                      <Checkbox
                        id={tag}
                        checked={selectedTags.includes(tag)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            if (tag === 'ADM' && !user?.isAdmin) {
                              alert('Apenas administradores podem atribuir a tag ADM');
                              return;
                            }
                            setSelectedTags(prev => [...prev, tag]);
                          } else {
                            setSelectedTags(prev => prev.filter(t => t !== tag));
                          }
                        }}
                        disabled={tag === 'ADM' && !user?.isAdmin}
                      />
                      <Label htmlFor={tag} className="text-white text-sm flex items-center gap-2">
                        <UserTags tags={[tag]} size="sm" />
                        {tag}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={updateUserTags}
                  disabled={selectedTags.includes('ADM') && !user?.isAdmin}
                  className="flex-1 bg-white text-black hover:bg-gray-200"
                >
                  Salvar Tags
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedUser(null);
                    setSelectedTags([]);
                  }}
                  className="flex-1 border-gray-600 text-white hover:bg-gray-800"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
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

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-800">
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