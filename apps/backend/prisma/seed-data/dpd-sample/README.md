# DPD sample extract (Phase 2.1)

A faithful **mini-extract** of Health Canada's Drug Product Database (DPD),
used by the DPD importer for dev/tests (`npm run import:dpd` with no argument
defaults to this directory). It mirrors the real DPD "extract" layout: a set of
**comma-delimited, header-less** files joined by the internal `DRUG_CODE` key.

Files (same names/shape as the public DPD extract, trimmed to a handful of
columns per row — the importer only reads the columns it needs, indexed by the
`DPD_COLUMNS` map in `src/modules/drug/dpd-import.service.ts`):

| File          | Grain          | Key        |
|---------------|----------------|------------|
| `drug.txt`    | one per DIN    | DRUG_CODE  |
| `ingred.txt`  | many per DIN   | DRUG_CODE  |
| `form.txt`    | one per DIN    | DRUG_CODE  |
| `route.txt`   | one per DIN    | DRUG_CODE  |
| `schedule.txt`| many per DIN   | DRUG_CODE  |
| `status.txt`  | many per DIN   | DRUG_CODE  |
| `comp.txt`    | one per DIN    | DRUG_CODE  |

The 14 DINs span **all four** schedule categories (NARCOTIC, NEEDS_RX,
BEHIND_COUNTER, OPEN). DINs / brand names are real; the extract is abbreviated.

> The `DPD_COLUMNS` field→index map in the importer is modelled on the DPD
> layout but **MUST be verified against Health Canada's DPD "Read Me"** before a
> real national import (that verification is an ops follow-up).
