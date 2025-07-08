'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { isAdminUID } from '@/lib/config';
import { generateUserID } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { MessageCircle, Lock, User, Mail, Copy, Check } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newUserID, setNewUserID] = useState('');
  const [copiedID, setCopiedID] = useState(false);
  const [showUserID, setShowUserID] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        checkUserRoleAndRedirect(user.uid);
      }
    });

    return () => unsubscribe();
  }, []);

  const checkUserRoleAndRedirect = async (userId: string) => {
    try {
      const isUserAdmin = isAdminUID(userId);
      
      if (isUserAdmin) {
        router.push('/admin');
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error('Erro ao verificar papel do usuário:', error);
      router.push('/');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await checkUserRoleAndRedirect(userCredential.user.uid);
    } catch (error: any) {
      setError('Email ou senha inválidos');
      console.error('Erro no login:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const isUserAdmin = isAdminUID(userCredential.user.uid);
      const userID = generateUserID();
      
      setNewUserID(userID);
      setShowUserID(true);
      
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email: email,
        displayName: displayName || 'Usuário',
        photoURL: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
        isAdmin: isUserAdmin,
        userID: userID,
        friends: [],
        createdAt: new Date(),
      });

    } catch (error: any) {
      setError('Erro ao criar conta. Verifique os dados.');
      console.error('Erro no cadastro:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyUserID = async () => {
    if (!newUserID) return;
    
    try {
      await navigator.clipboard.writeText(newUserID);
      setCopiedID(true);
      setTimeout(() => setCopiedID(false), 2000);
    } catch (error) {
      const textArea = document.createElement('textarea');
      textArea.value = newUserID;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedID(true);
      setTimeout(() => setCopiedID(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 [-webkit-app-region:no-drag] bg-black">
      <div className="w-full max-w-md">
        {showUserID && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4">
              <div className="text-center">
                <div className="bg-green-500 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <User className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Conta Criada!</h2>
                <p className="text-gray-400 text-sm mb-4">
                  Seu ID único foi gerado. Compartilhe com amigos para que possam te adicionar:
                </p>
                <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-2xl font-mono text-green-400">{newUserID}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copyUserID}
                      className="text-gray-400 hover:text-white hover:bg-gray-700"
                      title="Copiar ID"
                    >
                      {copiedID ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {copiedID && (
                    <p className="text-green-400 text-xs mt-2">ID copiado!</p>
                  )}
                </div>
                <Button
                  onClick={() => {
                    setShowUserID(false);
                    onAuthStateChanged(auth, (user) => {
                      if (user) {
                        checkUserRoleAndRedirect(user.uid);
                      }
                    });
                  }}
                  className="bg-white text-black hover:bg-gray-200 mt-4"
                >
                  Continuar
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-white p-3 rounded-full">
              <MessageCircle className="h-8 w-8 text-black" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">
            Bate Papo Privado
          </h1>
          <p className="text-gray-400 mt-2">Chat seguro e criptografado</p>
        </div>

        <Card className="bg-gray-900 border-gray-700">
          <CardHeader className="text-center">
            <CardTitle className="text-white">Acesse sua conta</CardTitle>
            <CardDescription className="text-gray-400">
              Entre ou crie uma conta para começar a conversar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-800">
                <TabsTrigger value="login" className="text-white data-[state=active]:bg-gray-700">Entrar</TabsTrigger>
                <TabsTrigger value="signup" className="text-white data-[state=active]:bg-gray-700">Cadastrar</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-white flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-white flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Senha
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                    />
                  </div>
                  {error && (
                    <p className="text-red-400 text-sm">{error}</p>
                  )}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-white text-black hover:bg-gray-200 font-medium"
                  >
                    {loading ? 'Entrando...' : 'Entrar'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="displayName" className="text-white flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Nome de exibição
                    </Label>
                    <Input
                      id="displayName"
                      type="text"
                      placeholder="Seu nome"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-white flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-white flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Senha
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                    />
                  </div>
                  {error && (
                    <p className="text-red-400 text-sm">{error}</p>
                  )}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-white text-black hover:bg-gray-200 font-medium"
                  >
                    {loading ? 'Criando conta...' : 'Criar conta'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}