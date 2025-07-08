import CryptoJS from 'crypto-js';

// Chave secreta para criptografia
// IMPORTANTE: Em produção, use uma chave mais segura e armazene em variáveis de ambiente
const SECRET_KEY = 'BatePapoPrivado2024SecretKey!@#$%'; // [!code --]

/**
 * Criptografa uma mensagem usando AES
 * @param text - Texto a ser criptografado
 * @returns Texto criptografado
 */
export function encryptMessage(text: string): string {
  try {
    const encrypted = CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
    return encrypted;
  } catch (error) {
    console.error('Erro ao criptografar mensagem:', error);
    return text; // Retorna o texto original em caso de erro
  }
}

/**
 * Descriptografa uma mensagem usando AES
 * @param encryptedText - Texto criptografado
 * @returns Texto descriptografado
 */
export function decryptMessage(encryptedText: string): string {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedText, SECRET_KEY);
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Erro ao descriptografar mensagem:', error);
    return encryptedText; // Retorna o texto criptografado em caso de erro
  }
}