// Bare `better-sqlite3` requires resolve here (package.json alias) so the Prisma
// better-sqlite3 adapter transparently gets a SQLCipher-keyed connection. Key hex
// is provided out-of-band via RXPOS_SQLCIPHER_KEY_HEX so the Prisma CLI subprocess
// (db push) keys the file too. When the var is unset this is a plain ciphers DB.
const Database = require("better-sqlite3-multiple-ciphers");
class SqlcipherDatabase extends Database {
  constructor(filename, options) {
    super(filename, options);
    const keyHex = process.env.RXPOS_SQLCIPHER_KEY_HEX;
    if (keyHex) {
      this.pragma("cipher='sqlcipher'");
      this.pragma(`key="x'${keyHex}'"`);
    }
    this.pragma("journal_mode = WAL");
    this.pragma("foreign_keys = ON");
  }
}
module.exports = SqlcipherDatabase;
module.exports.default = SqlcipherDatabase;
