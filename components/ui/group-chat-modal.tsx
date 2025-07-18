'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Users } from 'lucide-react';

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

interface GroupChatModalProps {
  friends: Friend[];
  onClose: () => void;
  onCreateGroup: (selectedFriends: string[], groupName: string) => void;
}

export function GroupChatModal({ friends, onClose, onCreateGroup }: GroupChatModalProps) {
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');

  const toggleFriend = (friendUID: string) => {
    setSelectedFriends(prev => 
      prev.includes(friendUID) 
        ? prev.filter(uid => uid !== friendUID)
        : [...prev, friendUID]
    );
  };

  const handleCreateGroup = () => {
    if (selectedFriends.length < 1) {
      alert('Selecione pelo menos 1 amigo para criar um grupo');
      return;
    }
    
    if (!groupName.trim()) {
      alert('Digite um nome para o grupo');
      return;
    }

    onCreateGroup(selectedFriends, groupName.trim());
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Criar Grupo</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-gray-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-sm text-gray-300 mb-2">Nome do Grupo</label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Digite o nome do grupo..."
              className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Selecionar Amigos ({selectedFriends.length} selecionados)
            </label>
            
            {friends.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Nenhum amigo disponível</p>
                <p className="text-gray-600 text-xs">Adicione amigos primeiro</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {friends.map((friend) => (
                  <div
                    key={friend.uid}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedFriends.includes(friend.uid)
                        ? 'bg-purple-600 bg-opacity-20 border border-purple-500'
                        : 'hover:bg-gray-700'
                    }`}
                    onClick={() => toggleFriend(friend.uid)}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={friend.photoURL} />
                      <AvatarFallback className="bg-gray-700 text-white text-sm">
                        {friend.displayName?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h4 className="text-white font-medium text-sm">{friend.displayName}</h4>
                      <p className="text-gray-400 text-xs">{friend.userID}</p>
                    </div>
                    {selectedFriends.includes(friend.uid) && (
                      <div className="w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-700 flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-gray-600 text-white hover:bg-gray-700"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCreateGroup}
            disabled={selectedFriends.length < 1 || !groupName.trim()}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
          >
            Criar Grupo
          </Button>
        </div>
      </div>
    </div>
  );
}