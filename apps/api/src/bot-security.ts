import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const BOT_TOKEN_PATTERN = /^\d{5,15}:[A-Za-z0-9_-]{30,}$/;
export function requireEncryptionKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('BOT_TOKEN_ENCRYPTION_KEY must be 32 random bytes encoded as base64');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) throw new Error('Invalid encryption key encoding');
  return key;
}
export function encryptBotToken(token: string, key: Buffer): Buffer {
  if (!BOT_TOKEN_PATTERN.test(token)) throw new Error('Invalid token format');
  if (key.length !== 32) throw new Error('Invalid key size');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  // Storage layout: 12-byte nonce, 16-byte authentication tag, encrypted data.
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}
export function decryptBotToken(payload: Buffer, key: Buffer): string {
  if (payload.length < 29 || key.length !== 32) throw new Error('Invalid encrypted token');
  const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
}
