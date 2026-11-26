# Lot 760 — CONTACTS 6/6 Enrichissement : « introuvable » dit clairement

Périmètre : apps/api/src/modules/contacts/contacts.service.ts, packages/contracts/src/schemas/enrichment-coordinates*.ts

## Livré

- Une recherche de mobile a une FIN : `settleStalePendingCoordinates` (contracts) — « en recherche » > 6 h se lit « introuvable » si une source a répondu, « inconnu » sinon (un timeout n'est pas un échec). Servi par la liste /contacts.

## Prouvé déjà livré (aucun code)

- #4586 : `writableContactName` (crm-import:597, csv-import:244, import-writer), `displayedContactName`, backfill `contact-email-name-backfill.service.ts`.
- #4600 : `whyEmailIsNotIdentity` / `SharedEmailGroup` (contact-duplicate-proposals.ts:61-185), admin `identity-duplicates.ts:140`.
- #4599 : `placeholder-email.ts`, prompt `bellum_contacts.py:86`. #4928 : `guard_search_hits` phase2_contacts.py:979.
- Filtres with_email / with_phone / missing_details : contacts.service.ts:3227.

## Droits

Aucune surface d'accès touchée.
