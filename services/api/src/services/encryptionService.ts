import crypto from 'node:crypto';

export interface EncryptedPayload {
  encryptedResponse: Buffer;
  encryptionIv: Buffer;
  encryptionTag: Buffer;
  keyVersion: number;
}

export class EncryptionService {
  private primaryKey: Buffer;
  private keyVersion: number;

  constructor(secret: string, keyVersion: number = 1) {
    if (!secret || secret.length < 32) {
      throw new Error('IDEMPOTENCY_REPLAY_SECRET must be at least 32 characters long.');
    }
    // Derive exact 256-bit key from secret
    this.primaryKey = crypto.createHash('sha256').update(secret, 'utf8').digest();
    this.keyVersion = keyVersion;
  }

  /**
   * Encrypts a JSON-serializable payload using AES-256-GCM.
   * Generates a fresh 96-bit IV per call and binds to the provided AAD (scope:key_hash).
   */
  public encryptPayload(payload: unknown, aadString: string): EncryptedPayload {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.primaryKey, iv);

    const aad = Buffer.from(aadString, 'utf8');
    cipher.setAAD(aad);

    const jsonString = JSON.stringify(payload);
    const encrypted = Buffer.concat([cipher.update(jsonString, 'utf8'), cipher.final()]);

    const tag = cipher.getAuthTag();

    return {
      encryptedResponse: encrypted,
      encryptionIv: iv,
      encryptionTag: tag,
      keyVersion: this.keyVersion,
    };
  }

  /**
   * Decrypts an AES-256-GCM payload, verifying the AAD and 128-bit authentication tag.
   */
  public decryptPayload<T = unknown>(
    encrypted: Buffer,
    iv: Buffer,
    tag: Buffer,
    aadString: string,
    _keyVersion: number = 1,
  ): T {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.primaryKey, iv);

    const aad = Buffer.from(aadString, 'utf8');
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return JSON.parse(decrypted.toString('utf8')) as T;
  }
}
