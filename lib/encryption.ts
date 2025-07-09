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
  // A saída padrão do CryptoJS.AES.encrypt é um objeto que, quando convertido para string,
  // não se parece com texto comum. Uma verificação simples pode ser a ausência de espaços
  // e a presença de caracteres comuns em Base64.
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  // Esta verificação não é 100% garantida, mas ajuda a evitar a tentativa de descriptografar
  // texto puro, que é a causa do erro "Malformed UTF-8 data".
  return str.includes('U2FsdGVkX1') || base64Regex.test(str.replace(/\s/g, ''));
}


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
  // CORREÇÃO: Verifica se o texto realmente parece estar criptografado antes de tentar.
  if (!isLikelyEncrypted(encryptedText)) {
    return encryptedText;
  }

  try {
    const chatKey = generateChatKey(senderId, receiverId);
    const decrypted = CryptoJS.AES.decrypt(encryptedText, chatKey);
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (result) {
      return result;
    }
    
    throw new Error('Falha na descriptografia com chave da conversa');
  } catch (error) {
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