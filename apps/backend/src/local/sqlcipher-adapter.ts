import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";
import { keyToHex } from "./key-derivation";

/** Build a Prisma driver-adapter factory for an encrypted SQLCipher file. */
export function buildSqliteAdapter(opts: { path: string; key: Buffer }): PrismaBetterSQLite3 {
  // The shim (aliased `better-sqlite3`) reads this to key the connection.
  process.env.RXPOS_SQLCIPHER_KEY_HEX = keyToHex(opts.key);
  return new PrismaBetterSQLite3({ url: "file:" + opts.path });
}
