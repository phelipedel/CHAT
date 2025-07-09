import CryptoJS from 'crypto-js';

// Chave secreta para criptografia
const SECRET_KEY = 'BatePapoPrivado2024SecretKey!@#$%';

/**
 * Gera uma chave única para cada conversa baseada nos UIDs dos participantes
 * @param senderId - UID do remetente
 * @param receiverId - UID do destinatário
 * @returns Chave única para a conversa
 */
function generateChatKey(senderId: string, receiverId: string): string {
  // Ordena os UIDs para garantir que a chave seja a mesma, independentemente de quem envia
  const sortedIds = [senderId, receiverId].sort();
  // Concatena com a chave secreta principal para gerar uma chave única por chat
  return `${sortedIds[0]}-${sortedIds[1]}-${SECRET_KEY}`;
}

/**
 * Criptografa uma mensagem usando AES com chave específica da conversa
 * @param text - Texto a ser criptografado
 * @param senderId - UID do remetente
 * @param receiverId - UID do destinatário
 * @returns Texto criptografado
 */
export function encryptMessage(text: string, senderId: string, receiverId: string): string {
  try {
    const chatKey = generateChatKey(senderId, receiverId);
    const encrypted = CryptoJS.AES.encrypt(text, chatKey).toString();
    return encrypted;
  } catch (error) {
    console.error('Erro ao criptografar mensagem:', error);
    return text; // Retorna o texto original em caso de erro
  }
}

/**
 * Descriptografa uma mensagem usando AES com chave específica da conversa
 * @param encryptedText - Texto criptografado
 * @param senderId - UID do remetente
 * @param receiverId - UID do destinatário
 * @returns Texto descriptografado
 */
export function decryptMessage(encryptedText: string, senderId: string, receiverId: string): string {
  try {
    const chatKey = generateChatKey(senderId, receiverId);
    const decrypted = CryptoJS.AES.decrypt(encryptedText, chatKey);
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (result) {
      return result;
    }
    
    // Se falhar, continua para tentar com a chave antiga (compatibilidade com mensagens antigas)
  } catch (error) {
    // Continua para tentar com a chave global se houver erro na primeira tentativa
  }
  
  // Se a descriptografia falhar, tenta com a chave antiga (compatibilidade com mensagens antigas)
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedText, SECRET_KEY);
    const originalText = decrypted.toString(CryptoJS.enc.Utf8);
    if (originalText) return originalText;
  } catch (e) {
    // Só registra erro se ambas as tentativas falharem
  }
  
  console.error('Erro ao descriptografar mensagem com ambas as chaves - retornando texto original');
  return encryptedText; // Retorna o texto criptografado em caso de erro
}