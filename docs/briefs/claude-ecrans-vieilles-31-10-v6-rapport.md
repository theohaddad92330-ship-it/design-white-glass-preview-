# Rapport — écrans vieilles issues v6 (#4595.3 #4691.3)

Branche `claude/ecrans-vieilles-31-10-v6` — SHA 284ed779 (#4595.3), acc7b5d1 (#4691.3), plus ce rapport.

- **#4691.3 fait** : `apps/web/src/features/ats/model/ats-write-capabilities.ts:19` (écriture → scope ; OAuth2 filtre sur les scopes lus de `AtsStatus.scopes`, déjà exposé, jamais le jeton) ; `AtsCard.tsx:~60` n'affiche que les écritures permises, sinon « aucune écriture accordée » ; locales FR+EN `integrations.json` (`ats.writes`, `ats.writeNone`, `writeNotice` sans « trois choses »).
- **Écart au brief** : l'écran n'a aucune option nécessitant `actions:write` (les 3 écritures ATS = `deliveries:write` ×2, `opportunities:write`). Test sur ces deux scopes : sans `deliveries:write` « Créer une mission » / « Corriger un TJM » sont absentes, avec elles sont là.
- **Démo** : `apps/api/src/modules/demo/demo-dataset.ts:~20856` — scopes fictifs de la démo élargis (`deliveries:write opportunities:write`) pour que la carte démo garde ses écritures. Aucune entrée `demo-coverage.ts` nouvelle (même affichage, seulement filtré).
- **#4595.3 fait** : `ui/KpiTile.tsx` (null/undefined/NaN → « non mesuré » + `unmeasuredReason`, vrai 0 reste 0) ; `clients/_components/esn-directory.tsx:94`, `clients/page.tsx:41`, `teams/_deep-kpis.tsx:59` → `countOrUnmeasured` ; `analysis/[id]/_components/AnalysisHeader.tsx` + `confidence-axis.logic.ts` (axe absent = « non évalué », plus « 0/100 » STOP) ; `monitoring/_components/cockpit-panel.tsx:138` (flatMap, plus de repli 0). Cockpit : déjà juste.
- **Garde** : `src/architecture/une-valeur-absente-ne-se-rend-jamais-zero.test.ts` (rouge sur les 4 sites ci-dessus avant correction, puis vert).
- **Tests** : web `ats` + `connection-vocabulary` (22 verts) ; dashboard-manager KpiTile, confidence-axis, garde, architecture/clients/teams/monitoring/analysis verts ; `tsc --noEmit` dashboard-manager et web propres. Rouge d'abord pour chacun.
- **Non fait / à savoir** : `fournisseur-nomme-au-registre-autorise.test.ts` échoue avant et après (`@bellum/contracts` non buildé en cloud, préexistant). `pnpm ci:local` non lancé (cloud). `securite/page.tsx` `?? 0` laissé : dans un journal mesuré, un type d'événement absent est un vrai zéro.
- **Hors périmètre touché** : aucun. Fragment `changes/ecrans-vieilles-31-10-v6.yml` ajouté. Aucune PR ouverte.
