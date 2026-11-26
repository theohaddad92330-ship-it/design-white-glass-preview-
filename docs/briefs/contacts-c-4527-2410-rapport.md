# Rapport — CONTACTS-C (#4527, #4503.3, #4526.4), 24/10

Branche `claude/contacts-c-2410` (base `claude/fiche-contact-2410`), sans PR.

1. **#4527.1 compte serveur — fait.** `ContactsService.channelTally` : UNE requête `COUNT(*) FILTER`, 1re page, champ `channelTally` de `GET /contacts`. Le web lit ces chiffres (`networkCounts.ts`), plus les pages chargées. Tests : `contacts.service.channel-tally.spec.ts`.
2. **#4527.2/.7 même périmètre — fait.** Population = filtres de la liste (recherche, compte, filtres, état, Recommandés) SANS `channel`/`unassigned`/`source`. Vue ≠ Tous ou « Ne pas solliciter » (rognées côté client) : aucun chiffre plutôt qu'un faux.
3. **#4527.3 — fait.** Chargement/échec/réponse incomplète ⇒ champ absent ⇒ tuile sans chiffre, jamais « 0 » (tests API + `ContactContent.channel-tally.test.tsx`).
4. **#4527.4 — fait.** Tuile et filtre `channel=with_phone` = `recordedPhoneSql` (même prédicat que `looksLikePhoneNumber`), testé.
5. **#4527.5 démo / #4527.6 tests — fait.** `DEMO_CRM_ORIGIN_CONTACT_NAMES` (3 contacts `source='crm'`), `DEMO_CONTACTS_CHANNEL_TALLY` (seedée), `demo-contacts-channel-tally-coverage.spec.ts`. Chiffres présents avec `hasNextPage`.
6. **#4503.3 — fait.** Cause : « E-mail absent » écrit en dur à côté de `CoordinateSearchState` (« E-mail disponible »). Plus d'« absent » quand la source annonce l'adresse (`ContactTableRow.tsx`). Test qui dit NON sur les deux libellés ensemble.
7. **#4526.4 puce Mon CRM — fait.** Filtre `source=mon_crm` (= `crm`+`import`, IN), compteur exact, absente si zéro (visible si active), libellée du CRM branché (`crmNameOf` repris de `claude/mon-crm-comptes-2410`, fichiers identiques) sinon « Mon CRM », dans l'URL (`source`), combinable.

Vérifs : `tsc` web 0 error TS ; `tsc` api 3 erreurs `@bellum/email` non construit (environnement) ; `src/architecture` 242 fichiers verts ; contacts.service.spec 524, perf-p5, demo-seed 138, demo-coverage verts ; contracts contact 233 verts.

## À trancher / écarts

- Choix : `source=mon_crm` est une nouvelle valeur du filtre `source` (le filtre existant était une égalité exacte).
- Tests web (QuickChips, networkCounts) écrits avec le code, pas avant ; les tests API, #4503.3 et démo : rouge d'abord.
- Test existant modifié : `demo-seed.service.spec.ts` (« tout `demo` » ⇒ `demoContactSource`), `contacts.service.perf-p5.spec.ts` (5 ⇒ 6 lectures).
- Paquets `contracts/utils/errors/…` construits localement pour lancer vitest (dist non versionné).
- La puce Mon CRM est masquée hors vue « Tous » (compteur non calculable côté serveur sinon).
