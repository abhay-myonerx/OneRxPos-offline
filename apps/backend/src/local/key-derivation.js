"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveLocalDbKey = deriveLocalDbKey;
exports.keyToHex = keyToHex;
const node_crypto_1 = require("node:crypto");
const ITERATIONS = 210_000; // OWASP-ish PBKDF2-SHA256 floor
const KEY_BYTES = 32; // AES-256
// Derive the SQLCipher / event key from the master secret + device id (salt).
// Spec §7.2: PBKDF2, device id + credential; never stored plaintext.
function deriveLocalDbKey(masterKey, deviceId) {
    if (!masterKey)
        throw new Error("deriveLocalDbKey: masterKey required");
    if (!deviceId)
        throw new Error("deriveLocalDbKey: deviceId required");
    return (0, node_crypto_1.pbkdf2Sync)(masterKey, deviceId, ITERATIONS, KEY_BYTES, "sha256");
}
function keyToHex(key) {
    return key.toString("hex");
}
//# sourceMappingURL=key-derivation.js.map