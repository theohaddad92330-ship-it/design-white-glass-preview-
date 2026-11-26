# Rapport fix CI #5123

Branche `claude/integration-vague4-01-11`. Le code est dans le commit `8ce45cc8` (message « docs: rapport… » : commitlint a refusé le scope `ci`, pas de réécriture sans rebase).

1. GA-33 : `AtsCard.tsx`, `AudienceBuilderBlock.tsx` -> `text-[var(--danger-soft-text)]` ; theme-parity 14/14 vert.
2. GA-07 : `crm-sync.service.ts` n'importe plus `OutboundWriteService` (jeton `CRM_SYNC_WRITE_GATE`, interface locale) ; plafond inchangé (355) ; module-boundaries + crm-sync.service.spec verts (21 tests).
3. Semis SNCF (garde #4182.5) : offre COO `sncf-coo-1` -> `requester.status = 'a_identifier'` ; spec vert.
   tsc web : sans erreur. tsc API : seules erreurs `@bellum/email` introuvable (paquet non construit dans la VM, hors périmètre).
   Non fait : `pnpm ci:local` non lancé.
4. #4714.3 : `CrmSyncModule` fournit `{ provide: CRM_SYNC_WRITE_GATE, useExisting: OutboundWriteService }` (dc9f66b1) ; `crm-sync.module.spec.ts` rouge -> vert, avec crm-sync.service.spec + module-boundaries (22 tests verts).
