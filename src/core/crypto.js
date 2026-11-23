const KEY_SALT = new TextEncoder().encode('zp-hybrid-e2ee-v1');
const keyCache = new Map();

async function deriveAesKey(passphrase) {
  const cached = keyCache.get(passphrase);
  if (cached) return cached;

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: KEY_SALT,
      iterations: 60000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  keyCache.set(passphrase, aesKey);
  return aesKey;
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export async function encryptEnvelopePayload(passphrase, payload) {
  const key = await deriveAesKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const ciphertext = toBase64(new Uint8Array(encrypted));
  return {
    iv: toBase64(iv),
    ciphertext,
    payloadBytes: ciphertext.length,
  };
}

export async function decryptEnvelopePayload(passphrase, ivB64, ciphertextB64) {
  const key = await deriveAesKey(passphrase);
  const iv = fromBase64(ivB64);
  const cipherBytes = fromBase64(ciphertextB64);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBytes
  );
  const json = new TextDecoder().decode(decrypted);
  return JSON.parse(json);
}
