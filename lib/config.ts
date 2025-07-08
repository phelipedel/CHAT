// Configurações da aplicação
export const APP_CONFIG = {
  // UID do usuário administrador principal
  ADMIN_UID: 'bBkztsKYlYY2BNK7UyyZ6gwNhxC2',
  
  // Configurações do Firebase
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyDFp23a4SlbUAG0eDQlKh9vooEr2HUFv7o",
    authDomain: "chatprivado-aa942.firebaseapp.com",
    projectId: "chatprivado-aa942",
    storageBucket: "chatprivado-aa942.appspot.com",
    messagingSenderId: "887373919024",
    appId: "1:887373919024:web:8419695fbeaf3957eccef5",
    // Adicione a URL do seu Realtime Database aqui
    databaseURL: "https://chatprivado-aa942-default-rtdb.firebaseio.com"
  },
  
  // Outras configurações
  APP_NAME: "Bate Papo Privado",
  VERSION: "1.0.0"
};

// Função para verificar se um UID é administrador
export function isAdminUID(uid: string): boolean {
  return uid === APP_CONFIG.ADMIN_UID;
}