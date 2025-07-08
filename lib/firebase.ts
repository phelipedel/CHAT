import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { APP_CONFIG } from './config';

// Inicializar Firebase (evitar múltiplas inicializações)
const app = getApps().length === 0 ? initializeApp(APP_CONFIG.FIREBASE_CONFIG) : getApps()[0];

// Exportar instâncias de autenticação e firestore
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;