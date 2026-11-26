# Rapport — vieilles issues v5 (démo + masquage + doublons)

Branche `claude/demo-masquage-vieilles-31-10-v5` — SHA tête : 51b2acb3 (3 commits de code + brief). Pas de PR (le fil intègre).

- #4113.4 — déjà juste côté code (`langfuse_client.py:_redact_regex` rend `[secret masqué]` si ça plante ; `sentry_init.py:_mask_strings` le réutilise). Ajout de 3 tests de verrou : `apps/ia/tests/test_trace_pii_masking.py` (masque qui plante → jamais le brut, Langfuse + Sentry ; SIREN/CA/effectif/CP intacts côté Langfuse). 12 verts.
- #4106.4 — `demo-contact-density.ts` (Nicolas Ferrand, `cascadeSecondSource`) → `enrichment_coordinates` « trouvée, 2 sources » via `demo-enrichment-trace.ts` ; aucun nom de fournisseur. Garde : `demo-cascade-smtp-coverage.spec.ts`.
- #4107.4 — Camille Aubert (`smtpVerifiedEmail`) porte `email_verified: true` (`demo-seed.service.ts`). Garde `demo-contacts-badge-coverage.spec.ts` adaptée (exactement UN contact vérifié) et `readyToProcess` reclassé « seedé » dans `demo-coverage.ts` — à valider : le badge de nav « Contacts » affiche désormais 1 en démo.
- #4116.5 — déjà juste : deux avis européens EDF (URL ted.europa.eu) semés par `demoPublicTendersOf` (`demo-dataset.ts:8838`), classé seedé ; rien recodé. Garde existante : `demo-verification-public-tenders-coverage.spec.ts`.
- #4114.4 — API existante (`duplicate-proposals`) + écran existant (`ContactsDuplicateNotice`). Ajouts : table `contact_duplicate_decisions` (migration 20261031120000, RLS), `ContactDuplicateDecisionsService`, `POST /contacts/account/:id/duplicate-proposals/decision` (`records:write`, 404 si la paire n'est pas visible = mêmes droits/espace/BU), boutons « Ce sont les mêmes » / « Pas les mêmes » FR+EN. Aucune porte de fusion de personnes n'existe : la confirmation est enregistrée, rien n'est fusionné. Démo : la paire vient des contacts déjà semés (SocGen/ENGIE), table purgée au reset.
- Tests : jest api (9+11+4 specs ciblées, gardes architecture table-scope/migrations/module-boundaries, demo-coverage, demo-reset) verts ; vitest web (ContactsDuplicateNotice 5/5, theme-parity, i18n) verts.
- Non fait : `tsc --noEmit` des paquets api/web (timeout VM) ; `pnpm ci:local` non lancé. Fragment `changes/demo-masquage-vieilles-31-10-v5.yml` (changelog) à appliquer par l'intégrateur.
- Hors périmètre : aucun. Choix commitlint : scope `api`/`ia`/`web` (pas de scope `demo`).
