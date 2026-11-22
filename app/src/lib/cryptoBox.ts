// AES-256-CTR encryption of local values (pure: the key and the random bytes are given).
// Format: "v1:<iv hex>:<ciphertext hex>". A value without the prefix is a legacy plain value.
import aesjs from 'aes-js';

export const CIPHER_PREFIX = 'v1:';

export function isEncrypted(value: string): boolean {
  return value.startsWith(CIPHER_PREFIX);
}

export function encryptValue(plain: string, key: Uint8Array, iv: Uint8Array): string {
  const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
  const bytes = ctr.encrypt(aesjs.utils.utf8.toBytes(plain));
  return `${CIPHER_PREFIX}${aesjs.utils.hex.fromBytes(iv)}:${aesjs.utils.hex.fromBytes(bytes)}`;
}

export function decryptValue(value: string, key: Uint8Array): string {
  const [, ivHex, dataHex] = value.split(':');
  if (!ivHex || dataHex === undefined) throw new Error('invalid_cipher');
  const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(aesjs.utils.hex.toBytes(ivHex)));
  return aesjs.utils.utf8.fromBytes(ctr.decrypt(aesjs.utils.hex.toBytes(dataHex)));
}
