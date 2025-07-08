import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Gerar ID único para usuários (formato: del#1435)
export function generateUserID(): string {
  const prefix = 'del';
  const number = Math.floor(Math.random() * 9999) + 1;
  return `${prefix}#${number.toString().padStart(4, '0')}`;
}

// Validar formato do ID do usuário
export function isValidUserID(id: string): boolean {
  const regex = /^[a-zA-Z]+#\d{4}$/;
  return regex.test(id);
}