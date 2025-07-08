import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getDatabase, ref, onDisconnect, set, onValue } from 'firebase/database';
import { APP_CONFIG } from './config';

// Inicializar Firebase (evitar múltiplas inicializações)
const app = getApps().length === 0 ? initializeApp(APP_CONFIG.FIREBASE_CONFIG) : getApps()[0];

// Exportar instâncias de autenticação e firestore
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

// Função para gerenciar status de presença do usuário
export const setupUserPresence = (userId: string) => {
  const userStatusRef = ref(rtdb, `/status/${userId}`);
  const isOfflineForDatabase = {
    state: 'offline',
    last_changed: serverTimestamp(),
  };

  const isOnlineForDatabase = {
    state: 'online',
    last_changed: serverTimestamp(),
  };

  // Configurar presença no Realtime Database
  const connectedRef = ref(rtdb, '.info/connected');
  onValue(connectedRef, (snapshot) => {
    if (snapshot.val() === false) {
      return;
    }

    onDisconnect(userStatusRef).set(isOfflineForDatabase).then(() => {
      set(userStatusRef, isOnlineForDatabase);
    });
  });

  // Atualizar status no Firestore também
  const userDocRef = doc(db, 'users', userId);
  onValue(userStatusRef, (snapshot) => {
    if (snapshot.exists()) {
      const status = snapshot.val();
      updateDoc(userDocRef, {
        status: status.state,
        lastSeen: status.last_changed
      }).catch(console.error);
    }
  });
};

// Função para adicionar logs do sistema
export const addSystemLog = async (level: 'INFO' | 'ERROR' | 'WARNING', message: string, details?: any) => {
  try {
    const { addDoc, collection } = await import('firebase/firestore');
    await addDoc(collection(db, 'logs'), {
      level,
      message,
      details: details || null,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Erro ao adicionar log:', error);
  }
};
export default app;