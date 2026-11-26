# DEPS-FAILLES-4554 — rapport (25/10/2026)

**Constat : rien à monter, le lot est déjà livré sur `origin/main` (bc41731c).** Aucune dépendance modifiée ici.

- `pypdf` 6.21.2 : `apps/ia/pyproject.toml` + `requirements.txt` (déjà posé).
- `happy-dom` ^21.0.4 (lock : 21.0.4) ; `undici` ^8.12.2 (lock : 8.12.3) dans `packages/http` et `apps/api`.
- `multer` 2.5.0 et `body-parser` 2.4.0 : `pnpm.overrides` racine + lock (commit dc63a454, #4554).
- `zod` : PAS migré (réservé à Louis, #4560). Exception NOMMÉE et bornée déjà en main (ab5e179c) :
  `auditConfig.ignoreGhsas` = `GHSA-mrhx-c7xc-m3w5` (zod) + `GHSA-vfj7-8cjw-p6xm` (braces, cf. `docs/securite-avis-dependances.md`).

## Audit (`pnpm audit --prod --audit-level=high`, sur main, ce jour)

APRÈS : `42 vulnerabilities found — 6 low | 34 moderate | 2 high (1 ignored)` ; code de sortie **0**.
AVANT (6 high du matin) : non reproductible, les correctifs sont déjà fusionnés.

## À savoir

- Le brief demandait « zod seul reste, gate rouge » : faux aujourd'hui. Le gate est VERT car zod (et braces) sont ignorés
  par une exception existante posée avant ce lot ; je n'y ai pas touché. Le gate redeviendra sans exception quand #4560 sera livré.
- Tests happy-dom/undici/pypdf non relancés : aucun changement de code ; `.venv` IA absent de la VM.
- Arbitrage : ne rien inventer, rapport seul.
