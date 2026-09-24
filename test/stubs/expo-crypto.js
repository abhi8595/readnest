/** Node crypto adapter for expo-crypto (digest + UUID). */
const crypto = require('crypto');

const CryptoDigestAlgorithm = { SHA256: 'SHA256', SHA512: 'SHA512', MD5: 'MD5', SHA1: 'SHA1' };
const CryptoEncoding = { HEX: 'hex', BASE64: 'base64' };

async function digestStringAsync(algorithm, message, { encoding } = {}) {
  const algo = String(algorithm).toLowerCase().replace('-', '');
  const out = encoding === CryptoEncoding.BASE64 || encoding === 'base64' ? 'base64' : 'hex';
  return crypto.createHash(algo).update(message, 'utf8').digest(out);
}

function randomUUID() {
  return crypto.randomUUID();
}

module.exports = { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync, randomUUID };
