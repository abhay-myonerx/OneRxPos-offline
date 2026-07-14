"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptEvent = encryptEvent;
exports.decryptEvent = decryptEvent;
const node_crypto_1 = require("node:crypto");
const IV_BYTES = 12;
const TAG_BYTES = 16;
function encryptEvent(plaintext, key) {
    const iv = (0, node_crypto_1.randomBytes)(IV_BYTES);
    const cipher = (0, node_crypto_1.createCipheriv)("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, ct, tag]).toString("base64url");
}
function decryptEvent(wire, key) {
    const buf = Buffer.from(wire, "base64url");
    if (buf.length < IV_BYTES + TAG_BYTES)
        throw new Error("decryptEvent: ciphertext too short");
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(buf.length - TAG_BYTES);
    const ct = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
    const decipher = (0, node_crypto_1.createDecipheriv)("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
//# sourceMappingURL=event-crypto.js.map