# RX POS --- Development, Build, Deployment & Desktop Setup Guide

RX POS is a multi-platform Point of Sale application with a cloud
backend and an offline-capable Electron store node.

## Architecture

``` text
RX POS
├── Cloud Backend
│   ├── Node.js / TypeScript / Express
│   ├── Prisma / PostgreSQL
│   ├── Redis / Socket.IO
│   └── Cloud deployment
├── Frontend SPA
│   ├── React / TypeScript / Vite
│   └── PWA
├── Desktop
│   ├── Electron / electron-builder
│   ├── NSIS installer
│   └── Offline store-node
├── Offline Data
│   ├── Prisma SQLite
│   ├── SQLCipher
│   └── better-sqlite3-multiple-ciphers
└── Shared Package
    └── rx-pos-shared
```

## Repository Structure

``` text
OneRxPos-offline/
├── apps/
│   ├── backend/
│   ├── frontend/
│   └── desktop/
├── packages/
│   └── shared/
├── package.json
├── package-lock.json
└── README.md
```

Generated directories should not be manually edited:

``` text
apps/backend/dist
apps/frontend/dist
apps/desktop/out
apps/desktop/.staging
apps/desktop/dist-desktop
packages/shared/dist
```

## Requirements

Current verified local environment:

``` text
Node.js v22.23.1
npm 10.9.8
```

Also install Git, PostgreSQL, and Redis as required by the selected
runtime.

``` bash
node -v
npm -v
```

## Install

``` bash
git clone <repository-url>
cd OneRxPos-offline
npm install
```

Use `npm ci` for a clean CI installation.

Do not automatically run `npm audit fix --force` on production branches
because breaking dependency upgrades may be introduced.

## Shared Package

The backend imports `rx-pos-shared`.

Build it with:

``` bash
npm run build --workspace=rx-pos-shared
```

Verify:

``` text
packages/shared/dist/index.d.ts
```

If TypeScript reports `Cannot find module 'rx-pos-shared'`, build the
shared package and verify the backend path mappings.

## Backend

Backend directory:

``` text
apps/backend
```

Cloud mode:

``` env
DATA_BACKEND=postgres
```

Desktop store-node mode:

``` env
DATA_BACKEND=sqlite
```

Generate Prisma clients:

``` bash
npm run db:generate --workspace=rx-pos-backend
npm run db:generate:sqlite --workspace=rx-pos-backend
```

Build:

``` bash
npm run build --workspace=rx-pos-backend
```

The backend pipeline builds shared code, generates Prisma clients,
compiles TypeScript, runs `tsc-alias`, and copies required Prisma engine
binaries.

## Environment Variables

Example variable names:

``` env
NODE_ENV=development
PORT=5000
DATA_BACKEND=postgres
DATABASE_URL=
REDIS_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
SYNC_TOKEN_SECRET=
LICENSE_TOKEN_SECRET=
PIN_PEPPER_SECRET=
POS_OVERRIDE_SECRET=
LOCAL_DB_MASTER_KEY=
LOCAL_DB_PATH=
SYNC_DEVICE_ID=
SETUP_ACCESS_CODE=
SYNC_CLOUD_URL=
```

Never commit real production secrets.

Never package cloud database credentials, Redis credentials, AWS secret
keys, payment private keys, SMTP passwords, or signing credentials into
the frontend or Electron renderer.

Anything shipped to a customer computer must be treated as inspectable.

## Frontend

Frontend directory:

``` text
apps/frontend
```

Environment implementation:

``` text
apps/frontend/src/shell/env/
├── env.vite.ts
├── index.ts
└── types.ts
```

Build the SPA:

``` bash
npm run build:spa --workspace=rx-pos-frontend
```

Expected output:

``` text
apps/frontend/dist
```

The PWA verification should report:

``` text
PWA build verification passed
```

Verify the cloud API URL in a built bundle:

``` powershell
Get-ChildItem .\apps\frontend\dist\assets\*.js |
Select-String -Pattern "onerxpos-backend.onrender.com" |
Select-Object Path, LineNumber
```

Frontend API URLs are public configuration and are not secrets.

## Cloud Backend

Cloud health endpoint:

`https://onerxpos-backend.onrender.com/api/health`

A healthy response should contain `success: true` and `status: ok`.

Example deployment build command:

``` bash
npm install --include=dev && npm run db:generate && npm run build
```

The deployment start command must target a package that actually defines
a start script. Do not use `npm run start` at the monorepo root unless
the root package defines it.

Check available scripts:

``` bash
npm run
```

Use the backend workspace start command configured by
`apps/backend/package.json`.

## Redis

Local development may use local Redis.

A cloud backend must not use `localhost` or `127.0.0.1` for Redis unless
Redis runs on the same cloud host.

Configure a cloud-accessible Redis connection:

``` env
REDIS_URL=<redis-connection-string>
```

Never expose the Redis credential in frontend code.

## Electron Desktop

Desktop directory:

``` text
apps/desktop
```

Packaging flow:

``` text
Frontend SPA
↓
Electron build
↓
Native module preparation
↓
Backend production staging
↓
electron-builder
↓
NSIS installer or unpacked app
```

The custom Node build wrapper uses a separate `cwd` for each step to
work across PowerShell, cmd.exe, and POSIX shells.

## Electron Build Modes

For packaged-runtime debugging, use the project's directory build flow
that invokes:

``` text
electron-builder --dir
```

Output:

``` text
apps/desktop/dist-desktop/win-unpacked
```

Run:

``` powershell
& ".\apps\desktop\dist-desktop\win-unpacked\RX POS.exe"
```

For real installation testing:

``` bash
npm run build:desktop
```

Test the NSIS installer on a clean or secondary Windows computer.

## electron-builder

Configuration:

``` text
apps/desktop/electron-builder.yml
```

Application identity:

``` yaml
appId: com.onerx.rxpos
productName: RX POS
```

The project uses a custom Electron-compatible native module pipeline,
so:

``` yaml
npmRebuild: false
```

must remain unless the native architecture is redesigned.

Packaged resources:

``` text
frontend/dist          -> resources/renderer
desktop/.staging/backend -> resources/backend
desktop/native         -> resources/native
desktop/scripts        -> resources/scripts
```

Important loose runtime scripts:

``` text
electron-native-require-hook.cjs
push-sqlite-schema-oneshot.cjs
```

## Windows CPU Architecture

Standard 64-bit Intel and AMD Windows processors both use Electron
`x64`.

``` text
Intel 64-bit -> x64
AMD 64-bit   -> x64
```

Example:

``` yaml
win:
  target:
    - target: nsis
      arch:
        - x64
```

AMD does not require a separate `amd64` target.

Windows ARM64 is a separate architecture and should only be enabled
after every native dependency is built and tested for ARM64.

## macOS

Intel Mac uses `x64`.

Apple Silicon uses `arm64`.

Do not claim Apple Silicon support until SQLCipher and all native
Electron modules are built and tested for macOS ARM64.

Final signed and notarized macOS builds should be produced on macOS or
an appropriate macOS CI runner.

## Native SQLCipher Module

The offline backend uses:

``` text
better-sqlite3-multiple-ciphers
```

The Electron-compatible native copy is under:

``` text
apps/desktop/native
```

`electron-native-require-hook.cjs` redirects the backend native require
to this Electron ABI-compatible copy.

Do not use a plain Node ABI build inside Electron.

Do not copy a Windows `.node` binary into a macOS package.

Do not use an x64 native binary for ARM64.

## Offline Database

The store node uses encrypted SQLite with SQLCipher.

The key is derived from a master secret and device ID. The project uses
PBKDF2-SHA256 and a 32-byte key.

The database uses WAL and foreign keys.

Never write runtime data under:

``` text
C:\Program Files\RX POS
```

Correct runtime layout:

``` text
%APPDATA%\rx-pos-desktop\
└── store-node\
    ├── data\
    │   ├── store-node.db
    │   ├── store-node.db-wal
    │   └── store-node.db-shm
    ├── logs\
    │   └── store-node-boot.log
    └── runtime\
```

Electron obtains the writable root with:

``` ts
app.getPath("userData")
```

Application resources stay under `Program Files`; database, logs, WAL,
and runtime state stay under AppData.

## Schema Push Flow

First launch:

``` text
Electron starts
↓
Resolve app.getPath("userData")
↓
Create store-node runtime directories
↓
Load/create per-installation secrets
↓
Derive SQLCipher key
↓
Spawn schema-push child
↓
Set DATA_BACKEND=sqlite
↓
Set LOCAL_DB_PATH to absolute AppData path
↓
Require backend sqlite-push module
↓
Push SQLite schema
↓
Start local store-node backend
↓
Check /api/health
↓
Open renderer
```

Schema-push script:

``` text
apps/desktop/scripts/push-sqlite-schema-oneshot.cjs
```

Before requiring `dist/local/sqlite-push.js`, it must set:

``` js
process.env.DATA_BACKEND = "sqlite";
process.env.LOCAL_DB_PATH = dbPath;
```

Backend modules may initialize config or Prisma during `require()`.

If `LOCAL_DB_PATH` is missing, a relative `data` path may resolve inside
the packaged backend and cause an `EPERM` error.

## EPERM Program Files Error

Example:

``` text
EPERM: operation not permitted, mkdir
C:\Program Files\RX POS\resources\backend\data
```

Cause: the backend is attempting to create writable SQLite data in the
installed application directory.

Correct location:

``` text
C:\Users\<USER>\AppData\Roaming\rx-pos-desktop\store-node\data\store-node.db
```

Expected schema-push diagnostics:

``` text
[schema-push] dbPath=C:\Users\...\AppData\Roaming\rx-pos-desktop\store-node\data\store-node.db
[schema-push] dbPathAbsolute=true
```

The log must not show the backend `Program Files` directory as the
SQLite data location.

## Store-Node Logs

Log location:

``` text
%APPDATA%\rx-pos-desktop\store-node\logs\store-node-boot.log
```

Read it with:

``` powershell
Get-Content "$env:APPDATA\rx-pos-desktop\store-node\logs\store-node-boot.log"
```

Review logs for secrets or personal data before sharing them publicly.

## Prisma Runtime Dependencies

Be careful when reducing installer size.

The runtime graph may include:

``` text
@prisma/adapter-pg
↓
@prisma/driver-adapter-utils
↓
@prisma/debug
```

Do not exclude `@prisma/debug` or `@prisma/driver-adapter-utils` when
the packaged Prisma adapters require them.

Removing `@prisma/debug` causes:

``` text
Cannot find module '@prisma/debug'
```

A successful TypeScript build does not prove all dynamically loaded
runtime dependencies were packaged.

## Installer Size Optimization

Safe candidates for removal include source maps, tests, coverage,
documentation, examples, Git metadata, IDE metadata, TypeScript source,
unused declarations, unused Electron locales, and development-only
dependencies.

Example filters:

``` text
!**/*.map
!**/__tests__/**
!**/*.test.js
!**/*.spec.js
!**/*.ts
!**/*.tsx
!**/*.d.ts
!**/README*
!**/CHANGELOG*
!**/docs/**
!**/examples/**
!**/coverage/**
!**/.git/**
!**/.github/**
!**/.vscode/**
!**/.idea/**
```

Do not aggressively remove runtime packages based only on package names.

Measure large packages first:

``` powershell
Get-ChildItem ".\apps\desktop\.staging\backend\node_modules" -Directory |
ForEach-Object {
  $size = (
    Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue |
    Measure-Object Length -Sum
  ).Sum

  [PSCustomObject]@{
    Package = $_.Name
    SizeMB = [math]::Round($size / 1MB, 2)
  }
} |
Sort-Object SizeMB -Descending |
Select-Object -First 30
```

Optimize based on measured size and retest on a clean PC.

## Source Maps

Production TypeScript builds may disable source maps when production
diagnostics do not require them:

``` json
{
  "compilerOptions": {
    "sourceMap": false,
    "inlineSourceMap": false,
    "inlineSources": false
  }
}
```

Disabling source maps is not secret protection.

Never hardcode credentials in JavaScript or TypeScript.

## Desktop Security

Never package cloud database passwords, Redis passwords, AWS secret
keys, payment private keys, SMTP passwords, or private signing
credentials.

Treat the Electron renderer as untrusted.

Do not expose secrets through `window`, `localStorage`,
`sessionStorage`, `VITE_*`, React constants, or renderer bundles.

Vite build variables are inspectable in generated JavaScript.

Use Vite variables only for public configuration.

Generate desktop-local secrets per installation. Do not log secret
values.

Do not pass raw database encryption keys through command-line arguments.

`asar` is packaging, not encryption. Minification is not secret
protection.

## Code Signing and Smart App Control

Unsigned Windows installers may be blocked by Smart App Control or
Windows reputation systems.

Development builds may remain unsigned for controlled testing.

Production customer releases should be code signed.

Typical electron-builder signing variables:

``` text
WIN_CSC_LINK
WIN_CSC_KEY_PASSWORD
```

Never commit certificate passwords or signing credentials.

Store them in a protected CI secret manager or secure build environment.

Do not permanently disable Windows security protections as the normal
customer installation process.

## Clean Desktop Build

After backend packaging, schema-push, native module, or electron-builder
changes, perform a clean build:

``` powershell
Remove-Item ".\apps\backend\dist" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item ".\packages\shared\dist" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item ".\apps\frontend\dist" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item ".\apps\desktop\out" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item ".\apps\desktop\.staging" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item ".\apps\desktop\dist-desktop" -Recurse -Force -ErrorAction SilentlyContinue

npm run build:desktop
```

Old backend `dist` or `.staging/backend` output can cause the installer
to ship stale code.

## Verify Packaged Runtime

Verify schema-push configuration:

``` powershell
Select-String `
  -Path ".\apps\desktop\dist-desktop\win-unpacked\resources\scripts\push-sqlite-schema-oneshot.cjs" `
  -Pattern 'process.env.LOCAL_DB_PATH = dbPath'
```

Verify path diagnostics:

``` powershell
Select-String `
  -Path ".\apps\desktop\dist-desktop\win-unpacked\resources\scripts\push-sqlite-schema-oneshot.cjs" `
  -Pattern 'dbPathAbsolute'
```

Verify Prisma runtime packages:

``` powershell
Test-Path ".\apps\desktop\dist-desktop\win-unpacked\resources\backend\node_modules\@prisma\debug"

Test-Path ".\apps\desktop\dist-desktop\win-unpacked\resources\backend\node_modules\@prisma\driver-adapter-utils"
```

Run the unpacked app:

``` powershell
& ".\apps\desktop\dist-desktop\win-unpacked\RX POS.exe"
```

## Clean-PC Test Checklist

-   Install with the generated NSIS installer.
-   Launch as a normal user, not Administrator.
-   Confirm no `Program Files` write error.
-   Confirm schema push completes.
-   Confirm the encrypted SQLite database is created in AppData.
-   Confirm store-node starts.
-   Confirm `/api/health` succeeds.
-   Confirm setup status succeeds.
-   Complete first-run setup.
-   Restart RX POS.
-   Confirm the existing encrypted database opens.
-   Test offline startup.
-   Test cloud synchronization.
-   Test receipt printer integration.
-   Test barcode scanner integration.
-   Test payment terminal integration.
-   Test an upgrade over an existing installation.
-   Confirm local data is preserved.

Do not consider a build production-ready based only on the development
PC.

## Common Errors

### TypeScript moduleResolution deprecation

``` text
Option 'moduleResolution=node10' is deprecated
```

Temporary compatibility setting:

``` json
{
  "compilerOptions": {
    "ignoreDeprecations": "6.0"
  }
}
```

Plan a future migration to a supported module resolution strategy.

### Cannot find rx-pos-shared

``` text
Cannot find module 'rx-pos-shared'
```

Run:

``` bash
npm run build --workspace=rx-pos-shared
```

Then verify shared output and backend TypeScript paths.

### Missing start script

``` text
npm error Missing script: "start"
```

The deployment command is running from a package without a `start`
script.

Run:

``` bash
npm run
```

and use the backend workspace's actual start command.

### Cannot find @prisma/debug

``` text
Cannot find module '@prisma/debug'
```

Keep the required Prisma runtime dependency and rebuild `.staging` and
`dist-desktop`.

### EPERM backend data directory

``` text
EPERM: operation not permitted, mkdir
C:\Program Files\RX POS\resources\backend\data
```

Set `DATA_BACKEND=sqlite` and absolute `LOCAL_DB_PATH` before requiring
backend modules in the schema-push child.

## Recommended Workflow

Backend:

``` text
Edit backend
↓
Build shared
↓
Generate Prisma clients
↓
Build backend
↓
Run tests
```

Frontend:

``` text
Edit frontend
↓
Build SPA
↓
Verify PWA
↓
Verify API configuration
```

Desktop:

``` text
Edit desktop/backend
↓
Clean generated output
↓
Build desktop
↓
Run win-unpacked
↓
Check store-node logs
↓
Test NSIS installer
↓
Test on clean PC
```

Production:

``` text
Run tests
↓
Clean build
↓
Verify runtime dependencies
↓
Sign application
↓
Build installer
↓
Clean-PC installation test
↓
Offline test
↓
Cloud sync test
↓
Hardware test
↓
Release
```

## Production Release Checklist

-   Cloud backend health endpoint is healthy.
-   PostgreSQL is healthy.
-   Cloud Redis is healthy.
-   Prisma clients are generated.
-   Shared package is built.
-   Backend build succeeds.
-   Frontend SPA build succeeds.
-   PWA verification succeeds.
-   No production secrets exist in frontend bundles.
-   No cloud credentials exist in desktop resources.
-   Local database path points to AppData.
-   SQLCipher database opens after restart.
-   Prisma runtime dependencies are packaged.
-   Electron native module matches target ABI and architecture.
-   Store-node starts as a normal Windows user.
-   NSIS installation succeeds.
-   Production release is code signed.
-   Upgrade installation preserves data.
-   Offline mode works.
-   Cloud synchronization works.
-   Payment terminal workflow works.
-   Scanner workflow works.
-   Printer workflow works.
-   Logs do not expose secret values.

## Project Rules

1.  Never write runtime data into `Program Files`.
2.  Never commit `.env` files containing real secrets.
3.  Never expose private variables through Vite or renderer code.
4.  Never remove Prisma runtime dependencies without packaged-runtime
    testing.
5.  Keep `npmRebuild: false` while the custom native pipeline owns the
    SQLCipher native module.
6.  Standard AMD64 Windows PCs use Electron `x64`.
7.  Never ship one native binary across Windows and macOS.
8.  `asar` is not encryption.
9.  Minification is not secret protection.
10. Test installers on a clean secondary PC.
11. Inspect `store-node-boot.log` for desktop startup failures.
12. Perform a clean build after backend packaging changes.

## Debug Information

When reporting a desktop startup issue, provide:

``` text
Operating system
Windows version
CPU architecture
RX POS version
Installed or win-unpacked build
Exact error screenshot
store-node-boot.log
Whether the app ran as Administrator
Fresh install or upgrade
```

Check architecture:

``` powershell
$env:PROCESSOR_ARCHITECTURE
```

Read logs:

``` powershell
Get-Content "$env:APPDATA\rx-pos-desktop\store-node\logs\store-node-boot.log"
```

Inspect backend resources:

``` powershell
Get-ChildItem ".\apps\desktop\dist-desktop\win-unpacked\resources\backend"
```

Inspect packaged scripts:

``` powershell
Get-ChildItem ".\apps\desktop\dist-desktop\win-unpacked\resources\scripts"
```

## License

Add the final RX POS commercial or proprietary license before public
distribution.

Do not automatically add an open-source license such as MIT without
project-owner approval.
