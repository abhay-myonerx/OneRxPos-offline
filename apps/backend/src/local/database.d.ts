import Database from "better-sqlite3-multiple-ciphers";
export type LocalDatabase = Database.Database;
export declare function openLocalDb(opts: {
    path: string;
    key: Buffer;
}): LocalDatabase;
export declare function getLocalDb(): LocalDatabase;
export declare function closeLocalDb(): void;
//# sourceMappingURL=database.d.ts.map