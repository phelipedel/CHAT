import CryptoJS from 'crypto-js';

// Chave secreta para criptografia
const SECRET_KEY = 'BatePapoPrivado2024SecretKey!@#$%';

/**
 * Verifica se uma string parece ser um texto criptografado em Base64 pelo CryptoJS.
 * @param str - A string a ser verificada.
 * @returns 'true' se a string for potencialmente criptografada.
 */
function isLikelyEncrypted(str: string): boolean {
  if (typeof str !== 'string' || str.length < 16) {
    return false;
  }
  // A saída do CryptoJS.AES.encrypt com salt (padrão) começa com "U2FsdGVkX1".
  // Esta é a verificação mais confiável para evitar a descriptografia de texto puro.
  return str.startsWith('U2FsdGVkX1');
}

/**
 * Gera uma chave única para cada conversa baseada nos UIDs dos participantes.
 * @param senderId - UID do remetente
 * @param receiverId - UID do destinatário
 * @returns Chave única para a conversa
 */
function generateChatKey(senderId: string, receiverId: string): string {
  if (!senderId || !receiverId) return SECRET_KEY; // Fallback para a chave global
  const sortedIds = [senderId, receiverId].sort();
  return `${sortedIds[0]}-${sortedIds[1]}-${SECRET_KEY}`;
}

/**
 * Criptografa uma mensagem usando AES com chave específica da conversa.
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
    return text;
  }
}

/**
 * Descriptografa uma mensagem usando AES com chave específica da conversa.
 * @param encryptedText - Texto criptografado
 * @param senderId - UID do remetente
 * @param receiverId - UID do destinatário
 * @returns Texto descriptografado
 */
export function decryptMessage(encryptedText: string, senderId: string, receiverId: string): string {
  // Se o texto não parece criptografado, retorne-o como está.
  if (!isLikelyEncrypted(encryptedText)) {
    return encryptedText;
  }

  try {
    const chatKey = generateChatKey(senderId, receiverId);
    const decrypted = CryptoJS.AES.decrypt(encryptedText, chatKey);
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    
    // Se o resultado for uma string vazia, a descriptografia falhou.
    if (result) {
      return result;
    }
    
    throw new Error('Falha na descriptografia com chave da conversa, tentando chave antiga.');
  } catch (error) {
    // Tenta a descriptografia com a chave global como último recurso.
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedText, SECRET_KEY);
      const originalText = decrypted.toString(CryptoJS.enc.Utf8);
      if (originalText) return originalText;
    } catch (e) {
      console.error('Erro ao descriptografar mensagem com ambas as chaves:', e);
    }
    // Se tudo falhar, retorna o texto como está para não quebrar a interface.
    return encryptedText;
  }
}