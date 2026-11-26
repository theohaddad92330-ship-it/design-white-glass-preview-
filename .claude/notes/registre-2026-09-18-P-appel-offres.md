# Registre — LOT P, appel d'offres → besoin en prévisualisation (#2571)

base : 4de833423 — 18/09/2026
Source : retour CLIENT (François Thomas, call bêta du 17/09/2026)
Branche : `feat/appel-offres-vers-besoin-18-09`

MESURE PRÉALABLE — #1097 (`rfp-to-need.ts`, `rfp.controller.ts:81-98`,
`ProjectPipelineService.addNeed`) transforme déjà un AO analysé en besoin,
mais ÉCRIT DIRECTEMENT dès `POST /rfp/:id/need` — aucune étape de
prévisualisation, aucune inconnue nommée, aucune prochaine décision. C'est
exactement le défaut que #2571 vise. Le patron « preview figée server-side »
existe ailleurs (CRM `outbound-write-preview.ts`) mais suppose une source qui
peut changer sous l'utilisateur ; ici la source (le dossier RFP déjà analysé)
est stable, donc une lecture PURE recalculée à chaque appel est honnête et
suffit — pas de nouvelle table. `needNextAction` (`need-next-action.ts`) est
déjà écrit et testé pour la « prochaine décision » : réutilisé tel quel via
`useOpenNeed` + `<NextAction>`, aucune dérivation nouvelle.

| id | demande en huit mots | zone | existant (appelant fichier:ligne) | état | preuve en recette |
|---|---|---|---|---|---|
| 2571.1 | extraire critères ET inconnues, jamais deviner | api:rfp, contracts | `rfp.requirements`/`issuer`/`due_at`/`lots` déjà extraits par #1097 (aucun second extracteur) ; nouveau `previewNeedFromRfp` (`rfp-to-need.ts`) + `rfpNeedPreviewSchema`/`RfpNeedCriterion`/`RfpNeedUnknown` (`packages/contracts/src/schemas/rfp.ts`) | déjà là | `rfp-to-need.spec.ts` (6 tests) : émetteur/échéance/lots/exigences non ambiguës en critères, compétences ET échéance/émetteur absents en inconnues NOMMÉES, exigence `ambiguous` en inconnue avec son texte source |
| 2571.2 | proposer en prévisualisation, pas de création silencieuse | api:rfp | nouveau `GET /rfp/:id/need-preview` (`rfp.controller.ts:previewNeed`) — LECTURE pure ; `POST /rfp/:id/need` (#1097, inchangé) reste la SEULE porte d'écriture, commentée en ce sens | déjà là | `rfp.controller.spec.ts` : lire la prévisualisation n'appelle jamais `pipeline.addNeed` ; confirmer avec un `projectId` explicite l'appelle une fois |
| 2571.3 | lancer le rapprochement, nommer la prochaine décision | web:open-needs, web:rfp | réutilise `needNextAction` (déjà éprouvé sur 6 écrans) via `useOpenNeed` + `<NextAction>` (`NeedFromRfpPreview.tsx:152`) — aucune dérivation nouvelle ; comme `needFromRfp` ne dérive jamais de compétences, la décision nommée est déterministiquement « typer les compétences ». LA PASSERELLE qui manquait pour l'atteindre a été livrée par le lot #2565/#2571 (branche `feat/ecrans-manquants-facture-et-passerelle-ao-18-09`) : `apps/web/src/features/rfp/view/RfpPage.tsx:NeedFromRfpCard` (`<Link to="/projects/needs" search={{ fromRfp: rfpId }}>`, libellé `need.preview.cta`) — `git grep -rn "fromRfp" -- apps/web/src/features/rfp` rendait ZÉRO avant ce lot | recetté | *(code)* `RfpPage.test.tsx` — describe `#2571.3`, « emmène vers /projects/needs?fromRfp=<id> — jamais un besoin créé directement au clic » vert. 18/09 (lot AO) : la recette ÉCRAN était NON VÉRIFIABLE faute d'un `rfpId` atteignable — dépendait de 2571.5. #2571.5 sème désormais UN dossier (`demo-seed.service.ts:701`), donc `/projects/needs?fromRfp=<id>` a un id réel à recevoir ; le lien de prochaine action lui-même reste `NeedFromRfpPreview.tsx:152`, inchangé et déjà testé (`NeedFromRfpPreview.test.tsx`). Recette ÉCRAN navigateur non refaite ici (agent recetteur à part). ‖ RECETTÉ 18/09 en production (d6c8f4074) : « Prévisualiser le besoin proposé » → location.href vérifié `/projects/needs?fromRfp=fb4b0664-…` ; écran « Rien n'existe tant que tu n'as pas confirmé » + « Rattacher à un projet… / Confirmer / Annuler » — aucun besoin créé au clic |
| 2571.4 | garde-fou — jamais de besoin confirmé automatique | api:rfp | `rfp.controller.spec.ts` : import/analyse (`create`) et décision bid/no-bid (`decide`) n'appellent JAMAIS `pipeline.addNeed` — seul `createNeed` (clic explicite + projet choisi) écrit | déjà là | Test rouge vérifié : `pipeline.addNeed` ajouté dans `create()` fait tomber le test |
| 2571.5 | semis de démo : AO en prévisualisation, inconnues nommées | api:demo | RÉFUTÉ en recette le 18/09 (`/rfp` : « Aucun appel d'offres importé », `rfps` classé « vide à dessein » sans qu'aucune ligne n'existe) — corrigé : nouveau `DemoSeedService.seedRfp` (`demo-seed.service.ts:1689`), appelé par `seedWorkspace` (`demo-seed.service.ts:701`), construit sur `demoRfpAnalysis` (`demo-scripts.ts`, émetteur + échéance + 4 exigences classées + 1 volontairement `ambiguous`) ; `rfps` déplacé de `DEMO_INTENTIONALLY_EMPTY` vers `DEMO_SEEDED_TABLES` (`demo-coverage.ts:1123`) | recetté | `demo-seed.service.spec.ts:676-717` (4 tests : un dossier semé, prévisualisation nomme `skills` ET `ambiguous_requirement`, idempotent) ; rouge→vert vérifié à la main (ligne `await this.seedRfp(...)` commentée → 2 tests rougissent, restaurée → verts) ; `demo-coverage.spec.ts` (garde générale + marqueur `rfps: 'this.rfps.save'`, ligne 198) verte. Recette ÉCRAN navigateur non refaite ici (agent recetteur à part). ‖ RECETTÉ 18/09 en production (d6c8f4074) : /rfp → « Consultation infrastructure cloud (démo) », exigence reconnue « Stack React / Node.js / PostgreSQL », exigence ambiguë « Pénalités de retard et réversibilité » avec « Le document ne précise ni le plafond de pénalités ni le format de réversibilité » |

## Fichiers touchés

- `packages/contracts/src/schemas/rfp.ts` — `rfpNeedCriterionSchema`, `rfpNeedUnknownSchema`, `rfpNeedPreviewSchema` + types
- `apps/api/src/modules/rfp/rfp-to-need.ts` — `previewNeedFromRfp`
- `apps/api/src/modules/rfp/rfp-to-need.spec.ts` — 6 tests TDD
- `apps/api/src/modules/rfp/rfp.controller.ts` — `GET :id/need-preview`
- `apps/api/src/modules/rfp/rfp.controller.spec.ts` (nouveau) — garde-fou #2571.4, 4 tests
- `apps/api/src/modules/demo/demo-coverage.ts` — commentaire `rfps` étendu
- `apps/web/src/routes/projects/needs.tsx` — `?fromRfp=<id>`
- `apps/web/src/features/projects/open-needs/api.ts` — `rfpNeedPreviewApi`
- `apps/web/src/features/projects/open-needs/hooks/useRfpNeedPreview.ts` (nouveau)
- `apps/web/src/features/projects/open-needs/view/NeedFromRfpPreview.tsx` (nouveau) + `.test.tsx` (nouveau, 4 tests)
- `apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx` — branchement `fromRfp`
- `apps/web/src/i18n/locales/{fr,en}/projects.json` — clés `needFromRfp.*`

### Lot AO (18/09, #2571.5/#2571.3, ferme la beta-client #2571)

- `apps/api/src/modules/demo/demo-dataset.ts` — `DEMO_RFP` (titre)
- `apps/api/src/modules/demo/demo-scripts.ts` — inchangé, RÉUTILISÉ (`demoRfpAnalysis`)
- `apps/api/src/modules/demo/demo-seed.service.ts` — `seedRfp` (+ repo `RfpEntity` injecté), appelé depuis `seedWorkspace`
- `apps/api/src/modules/demo/demo-seed.service.spec.ts` — 3 tests TDD (#2571.5) + mock repo `rfps`
- `apps/api/src/modules/demo/demo-pipe-dates-and-placements.spec.ts` — mock repo `rfps` ajouté (construction directe de `DemoSeedService`, cassée sans lui)
- `apps/api/src/modules/demo/demo.module.ts` — `RfpEntity` enregistrée dans `TypeOrmModule.forFeature`
- `apps/api/src/modules/demo/demo-coverage.ts` — `rfps` déplacé de `DEMO_INTENTIONALLY_EMPTY` vers `DEMO_SEEDED_TABLES`
- `apps/api/src/modules/demo/demo-coverage.spec.ts` — marqueur `rfps: 'this.rfps.save'` dans `REPOSITORY_BACKED`

## Ce qui n'est pas fait

- ~~Aucune wiring depuis `/rfp`~~ — FERMÉ par `feat/ecrans-manquants-facture-et-passerelle-ao-18-09` (18/09, lot AV) : `RfpPage.tsx` émet maintenant `fromRfp`.
- Wiring depuis le mailbox (`ThreadDrawer.tsx`, déjà câblé vers `/rfp` pour `tender`) vers `/projects/needs?fromRfp=<id>` — toujours hors périmètre (`apps/web/src/features/mailbox/**` non listé dans ce chantier).
- Recette ÉCRAN navigateur non faite (agent recetteur à part, un à la fois) : #2571.3 et #2571.5 sont désormais vérifiés en logique/unitaire ET le dossier est réellement SEMÉ (preuve `demo-seed.service.spec.ts`) ET la passerelle `/rfp` → `?fromRfp=` est câblée — mais personne n'a encore ouvert `/rfp` dans un navigateur sur cette intégration.
- Pas de changelog FR/EN dédié au semis : le semis seul ne change aucun comportement utilisateur RÉEL (il rend visible en DÉMONSTRATION une capacité déjà couverte par l'entrée changelog existante de #2571, `packages/contracts/src/changelog/entries.ts`).
