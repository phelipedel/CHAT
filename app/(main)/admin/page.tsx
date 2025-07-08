// project/app/(main)/page.tsx

// ... nas importações, adicione o Label
import { Label } from '@/components/ui/label';

// ... dentro do componente ChatPage

  const updateProfile = async () => {
    if (!user) return;

    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: newDisplayName,
        photoURL: newPhotoURL,
        statusMode: statusMode, // Adicione a atualização do status
      });

      setUser({
        ...user,
        displayName: newDisplayName,
        photoURL: newPhotoURL,
        statusMode: statusMode, // Atualize o estado local também
      });
      setEditingProfile(false);
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      alert('Erro ao salvar perfil. Tente novamente.');
    }
    setSavingProfile(false);
  };

// ... no JSX, dentro do `div` com `editingProfile`

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