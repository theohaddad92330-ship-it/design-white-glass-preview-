# LOT AZ — deux bugs client, deux formes du même défaut

base : cc90f0d76 — 18/09/2026
branche : feat/normalisation-expertise-et-progression-cv-18-09

| # | Demande en huit mots | Sujet | Mesure | État | Preuve |
|---|---|---|---|---|---|
| 2549.2 | Le normaliseur de saisie libre n'a aucun appelant | `apps/web/src/features/onboarding/components/QuestionField.tsx` (`addOtherValue`, `MultiChoiceControl`) | Mesuré le 18/09 sur `cc90f0d76` : `git grep -n "normalizeExpertiseFreeText"` hors de son propre fichier/test ne trouvait AUCUN appelant (confirmé aussi sur toutes les branches en vol candidates : `fix/onboarding-client-18-09`, `feat/onboarding-activite-en-creation-18-09`). | recetté | CODE 18/09 — QuestionField.tsx:289 appelle normalizeExpertiseFreeText sur expertise_areas (appelant réel, le normaliseur n'était plus orphelin) |
| 2542.1 | Un CV bloqué en analyse ne raconte rien | `apps/web/src/features/consultants/view/CvDropZone.tsx` (`CvIntakeProgress`, `submit`) | Vérifié le 18/09 sur `cc90f0d76` : timeout déjà borné (`packages/http/src/client.ts:134-135`), erreur déjà nommée côté serveur (`cv-intake.service.ts:346-369`, commentaire déjà signé `#2542.1`) et déjà affichée en toast (`CvDropZone.tsx`, ex-ligne 95) — mais AUCUNE étape franchie n'était montrée pendant l'attente : seul le libellé du bouton changeait (`intake.working`, piloté par `intake.isPending`). Mesuré aussi : `/talents/intake` est UN SEUL aller-retour HTTP (`consultants/hooks.ts:127-138`, `useMutation` simple) — aucun flux de progression serveur (pas de Gateway Socket.IO dans `cv-intake.service.ts`, `git grep` négatif), donc le client ne peut vérifier que DEUX frontières réelles, pas les quatre du brief à la lettre (voir « ce qui contredit le brief » plus bas). | recetté | CODE 18/09 sur origin/main — CvDropZone.tsx:54-133 (phases received/processing/done/error/unknown, jamais un pourcentage inventé) rendu par ConsultantFormDialog.tsx:192 et TalentDetailPage.tsx:26 ; clés intake.progress à parité FR/EN (5 des deux côtés) |

## Gates (les deux points, à date du dernier commit de ce lot)

- `npx vitest run --dir packages/contracts --reporter=dot` → 5466 tests, vert
- `npx vitest run src/features/onboarding/components/QuestionField.test.tsx` (apps/web) → 35 tests, vert
- `npx vitest run src/features/consultants/view/CvDropZone.test.tsx` (apps/web) → 14 tests, vert
- `npx vitest run src/features/consultants src/features/search src/i18n src/architecture` (apps/web) → 2654 tests, vert
- `npx eslint` sur les 4 fichiers touchés (`QuestionField.tsx`, `QuestionField.test.tsx`, `CvDropZone.tsx`, `CvDropZone.test.tsx`) → vert
- `npx vitest run src/changelog` (packages/contracts) → 36 tests, vert
- `npx jest src/modules/consultants src/modules/demo --json --outputFile=...` (apps/api) → 127 suites, 1773 tests, vert
- `python3 tools/registres/coherence.py` → OK

## Ce que j'ai mesuré qui contredit le brief

- Le brief attribue la fonction à `#2549.2` alors que le code source (`expertise-free-text-normalization.ts:20-28`, commentaire d'en-tête) et son test (`expertise-free-text-normalization.test.ts:23`) la nomment `#2549.3` — `#2549.2` y est l'arbitrage NON câblé (secteur/métier). Les deux numéros voisins désignent la même fonction sous deux angles (`.2` = le retour Ludovic, `.3` = l'implémentation) — je garde `2549.2` comme demandé par ce brief pour le titre du point, et cite `#2549.3` dans le code là où le fichier source le nomme ainsi, pour ne pas mentir sur ce que je lis.
- Une note de registre PARALLÈLE et PLUS ANCIENNE (`.claude/notes/registre-2026-09-18-R-onboarding-creation.md`, base `4de833423`, antérieure à la fusion `cccb8a112`) déclare `#2549.3` « retenu, rien à câbler » — stale : son worktree ne voyait pas encore la fonction (fusionnée depuis dans `cc90f0d76`, base de ce lot). Ne contredit pas ce lot, juste daté avant la fusion.
- Le brief situe `CvDropZone.tsx` dans `apps/web/src/features/onboarding/components/` — le fichier RÉEL vit dans `apps/web/src/features/consultants/view/` (confirmé par `find`, un seul `CvDropZone.tsx` dans tout le dépôt). Les numéros de ligne cités (`:99`, `:169`) sont approximatifs pour la même raison (dérive normale depuis la mesure du 18/09) mais désignent bien le même bouton (`intake.working`/`intake.choose`) et le même toast d'erreur.
- Le brief demande « au minimum » quatre étapes nommées (dépôt reçu · lecture du document · extraction · fiche créée). Mesuré : `/talents/intake` est un SEUL aller-retour HTTP synchrone, sans Gateway Socket.IO ni flux serveur (`git grep -n "gateway\|socket\|emit(" apps/api/src/modules/consultants/cv-intake.service.ts` → 0 résultat). Le client ne peut donc vérifier que DEUX frontières réelles (fichier en mémoire, puis réponse du serveur) ; « lecture du document » et « extraction » sont fusionnées en UNE étape honnête (« Lecture et extraction du document en cours… ») plutôt que deux cases cochées séparément qui prétendraient savoir laquelle est franchie — exactement ce que la règle « jamais de donnée inventée » interdit. Ajouter un canal de progression serveur réel (SSE/Socket.IO) sortirait du lot borné à deux points ; je le signale comme suite possible, pas comme fait aujourd'hui.
