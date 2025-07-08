// Configurações da aplicação
export const APP_CONFIG = {
  // UID do usuário administrador principal
  ADMIN_UID: 'bBkztsKYlYY2BNK7UyyZ6gwNhxC2',
  
  // Configurações do Firebase
  FIREBASE_CONFIG: {
    apiKey: "your-api-key-here",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
  },
  
  // Outras configurações
  APP_NAME: "Bate Papo Privado",
  VERSION: "1.0.0"
};

// Função para verificar se um UID é administrador
export function isAdminUID(uid: string): boolean {
  return uid === APP_CONFIG.ADMIN_UID;
}