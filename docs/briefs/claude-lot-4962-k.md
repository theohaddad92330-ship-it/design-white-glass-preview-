# Brief — lot K (vague 3) : fiche compte — consultants du secteur, contacts par zone, contacts des ESN de rang 2 (#5017.2, #4982.1-2, #4987)

Plafond : 300 tours (à 240 : commit du vert, push, rapport, stop).
Branche : `claude/lot-4962-k` (part de origin/main, porte ce brief). PREMIER geste : `git merge origin/claude/lot-4962-a origin/claude/lot-4962-f origin/claude/lot-4962-i` (lots non encore fusionnés qui touchent tes fichiers ; lis leurs rapports `docs/briefs/claude-lot-4962-{a,f,i}-rapport.md`).
Périmètre : apps/web/src/_, apps/api/src/modules/accounts/_, apps/api/src/modules/contacts/_, apps/api/src/modules/consultants/_, apps/api/src/modules/demo/_, packages/contracts/src/_, packages/i18n/_, docs/briefs/_

## Contrat validé par Louis (31/10)

### #5017.2 — « consultants qui connaissent ce secteur » sur la fiche compte

- Compris : sur un compte, le commercial ne voit pas quels consultants ont déjà travaillé dans SON secteur ; seul `consultant-matching.ts:206` lit les secteurs.
- Je fais : une carte sur la fiche compte (onglet vue d'ensemble) : consultants de l'espace dont les secteurs SOURCÉS (lot F #5017.1 : secteurs que le CV cite, jamais déduits) recoupent le secteur du compte. Endpoint lecture (filtre `workspace_id`) + contrat + carte + semis démo (`demo-dataset.ts` + `demo-coverage.ts`). Aucune ligne pour un consultant sans secteur sourcé ; aucun consultant ⇒ la carte ne s'affiche pas (« on n'affiche pas ce qu'on n'a pas »).

### #4982 — contacts par zone

- 4982.1 : tri « zone » (proche d'abord) sur la liste des contacts (`ContactsPageContent.tsx`, n'a que `locationFilter` :46,:105). La liste est paginée côté serveur : le tri se fait EN SQL (`contacts.service.ts` ~3464, réutilise `contactGeoTier` de `contact-seller-focus.ts:60`), jamais sur la seule page chargée. Zone inconnue = en dernier.
- 4982.2 : regroupement par ville/région (PAS de carte) — vue groupée ou en-têtes de groupe dans la liste triée par zone.
- 4982.3 : rattaché à #4794 — rien à faire.

### #4987 — contacts des ESN de rang 2 sur un grand compte

- 4987.1 : dans l'onglet partenaires (`TabPartners.tsx:669`, appelant `AccountDetailTabContent.tsx:355`), pour chaque ESN de rang 2 qui EXISTE comme compte dans l'espace, ses contacts DÉJÀ en base (réutilise la lecture des contacts par compte si elle existe — cherche `account_id` dans `contacts.controller.ts` avant d'en écrire une). ESN absente de l'espace ou sans contact ⇒ « aucun contact connu » (4987.3), jamais un contact inventé.
- 4987.2 : sur un contact connu, le geste « Préparer un message » existant (réutiliser le composant de préparation, le copilote n'envoie jamais).
- Antériorité à GARDER : #2646.1 (accès nommé direct/rang 2, `TabAccess.tsx:151`), #1624.6 (rang observé ≠ « rang 2 disponible »).

## Droits

Lectures seules, toutes filtrées `workspace_id`. REFUS : la carte #5017.2 et les contacts rang 2 d'un AUTRE espace ne sortent jamais → un test API de refus par endpoint touché. Aucun menu ni route neuve.

## Je ne fais pas

Aucune collecte neuve de contacts ; aucune carte géographique ; rien sur Laura (#4794).

## Règles

TDD (rouge d'abord) ; tests ciblés seulement (≤ 5 specs par point + gardes `src/architecture` concernées + `tsc -p` du paquet touché) ; construire `packages/{contracts,utils,errors,http,observable}` si vitest l'exige ; jamais suite complète, check-types racine ni build ; jamais .github/ ni .claude/ ; trace `// #<n>.<k>` ; i18n fr+en ; push après chaque point vert ; pas de PR.

## Rapport

`docs/briefs/claude-lot-4962-k-rapport.md` (≤ 15 lignes : SHA, livré fichier:ligne, tests + résultat, hors périmètre, questions). Commit + push. STOP.
