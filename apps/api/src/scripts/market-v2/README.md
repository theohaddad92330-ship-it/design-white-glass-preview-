# Pack marché v2.1 — schéma de l'import (lot 783)

`market-v2-schema.json` est GÉNÉRÉ le 03/11/2026 depuis `TABLES_DICTIONARY.csv` et `DATA_DICTIONARY.csv` du pack
`BELLUM_MARKET_MEMORY_v2` (Drive « BELLUMAI - Team / 01 / CRM BASE DE DONNÉES (THÉO) / MARKET MEMORY », 6 parties du 09/10/2026).
Il ne contient AUCUNE valeur de donnée : par table, le dossier de sensibilité, le volume, l'en-tête CSV exact et, par
colonne, la description tronquée, le taux de remplissage et le drapeau `pii`.

Le pack lui-même (≈ 605 Mo décompressé, 139 tables, 2 338 468 lignes) reste hors dépôt, chez Louis. Format : `;`,
UTF-8 avec BOM, listes internes séparées par `|`.

Décisions de Louis du 03/11/2026 :

- tout est importé, **identités comprises, brutes** (noms, e-mails, mobiles, LinkedIn), mais **rien d'identifiant ne
  s'affiche** (décision du 02/11 maintenue) ;
- le CRM interne Belloum (`data_restricted_internal_crm/`) va dans la **base commune** comme le reste.

## Importer (lot 783, #5205)

Stockage (migration `1796900104000-MarketV2Rows`, base commune, RLS sans politique) :

| Table                      | Contenu                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `market_v2_datasets`       | une ligne par (version, table) CHARGÉE ; version = sha256 de `MANIFEST.csv` ; volumes    |
| `market_v2_rows`           | une ligne CSV par ligne ; cellules NON pii en `data jsonb` ; `account_id` extrait        |
| `market_v2_row_identities` | le COFFRE : cellules `pii=1` (+ `PII_FLAG_CORRECTIONS`) ; aucun lecteur hors l'importeur |

```sh
# une table, à blanc (aucune connexion base)
pnpm --filter @bellum/api ingest:market-v2 <dossier BELLUM_MARKET_MEMORY_v2> --dry-run --only=accounts
# tout le pack ; relancer la même commande reprend après une coupure, un rejeu ne duplique rien
pnpm --filter @bellum/api ingest:market-v2 <dossier BELLUM_MARKET_MEMORY_v2>
```

Le dossier attendu : les 6 parties décompressées dans UN dossier, `MANIFEST.csv` à sa racine, les CSV à leur chemin
du schéma (`data/…`, `refs/…`, `data_restricted_pii/…`). Un en-tête différent du schéma arrête tout AVANT la première
écriture.

## Script unique `import:tout` (geste de Louis)

Enchaîne `ingest:market-v2` → `ingest:market-paths-v2` → `ingest:common-account-links` (lot 793, référentiel pivot BM-A ↔ DF ↔ groupe) → `ingest:market-memory` (pack v1, remplit `market_person_paths`) →
`ingest:orion-accounts` (10) → `ingest:orion-needs` (24 puis 25) → `ingest:orion-rag-chunks` (50) → couverture lue
en base. S'arrête à la première étape en échec ; rapport de volumes par étape. Prérequis : la migration est passée,
et `MARKET_MEMORY_PERSON_HASH_KEY` est posée (sans elle, le pack v1 refuse d'importer les parcours — no-op strict).

D'abord à blanc (v2 et v1 lus et comptés ; ORION et couverture non lancés, ils n'ont pas de mode à blanc) :

```sh
cd apps/api
railway run --service belllum-backend-service --environment production -- \
  pnpm run import:tout "<…>/BELLUM_MARKET_MEMORY_v2" "<…>/bellum-data-freelances-2022" "<…>/ORION_DATAPACK_V12" --dry-run
```

Puis pour de vrai, la même commande sans `--dry-run`.
