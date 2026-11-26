# Lot T — Découvrir : ESN reconnues par référentiel + offres, Decathlon visible, clé de marque, tri, « Data Nice »

Plafond : 300 tours. Brief autonome. Deux lots précédents (P #5117, Q #5121) ont déclaré ces points livrés, tests verts, et la recette prod a rendu FAIL deux fois. Ce brief part de la RÉPONSE JSON RÉELLE capturée en prod le 01/11 (ia + web ea329980eb), pas d'une hypothèse.

## Preuve prod (capture réseau, recherche « développeur Java dans les Hauts-de-France »)

- Le front appelle `POST /ia/discover/registry` DEUX fois par recherche (limit 5 puis limit 25), corps `{"filters":{"region":"32","regions":["32"],"keywords":["Java"],"technologiesObserved":["Java"]},"limit":25,"contextMode":"neutral"}`. Clés de réponse : candidates, query, degraded, recommendedSort, targetSectorFilter, listingFilter, zoneWidening, jobsPending, jobsPendingCount, skillIntermediaries, skillPendingEmployers.
- Les champs `actorKind` / `actorType` / `isEsnPeer` / `isIntermediary` ARRIVENT au front (le lot Q les a bien posés). Mais :

| ESN                    | siren     | NAF registre | actorType reçu |
| ---------------------- | --------- | ------------ | -------------- |
| EXTIA                  | 499379923 | 71.12B       | client final   |
| GROUPE LR TECHNOLOGIES | 908409972 | 71.12B       | client final   |
| DAVEO (MAGELLAN)       | 502628720 | 71.12B       | client final   |
| MAGELLAN               | 493081236 | 68.20B       | client final   |
| DAVIDSON CONSULTING    | 483898672 | 71.12B       | client final   |
| SOCIETE GESER BEST     | 383934742 | 71.12B       | client final   |
| DAVRICOURT             | 538491622 | 71.12B       | client final   |
| VIVERIS                | 340007772 | 64.20Z       | client final   |
| ICSIS                  | 797696846 | 70.10Z       | client final   |
| INFOTEL (SAPHELEC)     | 322084195 | 61.90Z       | client final   |

Seul RANDSTAD reçoit `actorKind="interim"`, `isIntermediary=true`. Le NAF du registre d'une ESN est souvent celui de l'ingénierie, d'une holding ou de l'immobilier : **un classement par NAF seul ne peut pas les sortir.**

- **Decathlon** : la recherche « Decathlon » GARDE les filtres précédents (Java, région 32) et ajoute `freetext: "Decathlon"`. L'appel limit 25 renvoie 2 candidats : DECATHLON (306138900, `brandGroup` head) et DECATHLON FRANCE (500569405, `brandGroup` member, headSiren 306138900). L'écran n'affiche qu'UNE carte, DECATHLON FRANCE, sans « + N entités » : la tête est masquée côté web, ou la réponse de l'appel limit 5 (lancé en parallèle, 5 candidats NON filtrés : EXTIA, LR TECHNOLOGIES, DAVEO, MAGELLAN, THALES) se mélange avec celle du limit 25.
- **Clé de marque fausse** : `brandGroup` regroupe SOCIETE GESER BEST (head) avec SOCIETE GENERALE (member). La clé « premier mot si ≥ 6 lettres » (`apps/ia/app/services/brand_grouping.py`) prend « SOCIETE ».
- **Tri** : à l'écran, le tri est « Taille (effectif) » ; les comptes sans secteur sont mêlés à la liste (rangs 2, 3, 6, 8, 9, 11). Le tri web écrase l'ordre IA (`_unverified_last`, lot Q). La réponse porte `recommendedSort`.
- **« Data Nice »** : traité en texte libre (`freetext=Data+Nice`), 1 compte (TREASURE DATA), AUCUNE suggestion « Chercher à Nice ? » (brief N : `SearchReadingNotice.tsx:~55`, `discover-needs-freetext.ts:~104-112, ~251`).
- Annexe : un `POST /team-research` part tout seul à chaque recherche. Dire dans la PR ce qu'il fait et ce qu'il coûte (aucune modification sauf si c'est un appel payant non voulu ; dans ce cas, le signaler sans le corriger).

## Décision Louis (QCM 02/11/2026) — classement ESN

Une entreprise est ESN ou cabinet (onglet « Autres acteurs ») par :

- **un référentiel élargi** : ESN et cabinets connus, issus de listes publiques (adhérents Numeum/Syntec, grands cabinets) — fichier de données versionné sous `apps/ia/app/data/`, source de chaque entrée citée en tête de fichier ;
- **ET un signal lu dans ses propres offres** quand le NAF est ambigu (71.12B, 71.12A, 70.22Z, 64.20Z, 70.10Z, 68.20B, 62.0x…) : mots comme « ESN », « société de conseil », « cabinet de conseil », « chez nos clients », « pour le compte de nos clients », « intercontrat », « mission chez un client », « consultant en régie ». Il faut au moins N offres concordantes (seuil nommé à un endroit).

Le motif s'affiche sur la ligne de « Autres acteurs » (« reconnue ESN : ses offres le disent » / « référencée comme ESN »). Ce n'est PAS deviner : sans référentiel ni signal d'offre, l'entreprise reste client final. Aucune source nommée dans le motif.

## Je fais

1. **Classement ESN** selon la décision, dans la fonction partagée `actor_fields` / `actor_typology.py` (un seul endroit, GA-26). Les deux chemins `/discover/registry` et `/discover/signals` passent par elle. Test de NON qui rejoue le TABLEAU ci-dessus (siren, NAF, et des offres doublées contenant « chez nos clients » pour celles qui en ont) ⇒ les 10 dans Autres acteurs ; ENEDIS, THALES, DECATHLON, ORANGE, EXOTEC restent client final. Test : une entreprise NAF 71.12B sans référentiel ni signal d'offre ⇒ client final. Motif affiché (web) + i18n fr/en.
2. **Decathlon** :
   - (a) un seul appel par recherche, ou réponses ordonnées : la réponse limit 5 ne doit jamais remplacer ni se mêler à la limit 25 d'une autre requête (jeton de requête, la dernière gagne) — test web ;
   - (b) une tête de groupe présente dans la réponse s'affiche avec « + N entités du groupe ». Si seul le membre passe les filtres web, il s'affiche avec « fait partie du groupe X ». Test avec le JSON exact ci-dessus (2 candidats) ⇒ 1 tête + 1 membre dépliable ;
   - (c) un nom d'entreprise tapé seul (« Decathlon ») NE garde PAS les filtres de techno de la recherche précédente, ou le dit (« Decathlon — filtres Java, Hauts-de-France conservés · tout effacer »). Choisir le moins surprenant et le justifier dans la PR.
3. **Clé de marque** : mots vides de forme juridique et génériques exclus de la clé (SOCIETE, GROUPE, CABINET, COMPAGNIE, ETABLISSEMENTS, SA, SAS, SARL, HOLDING, FRANCE…), liste nommée à un endroit. Test : SOCIETE GESER BEST + SOCIETE GENERALE ⇒ aucun groupe ; DECATHLON + DECATHLON FRANCE ⇒ groupe.
4. **Tri** : sans NAF/SIREN en bas QUEL QUE SOIT le tri choisi (effectif, score…) : clé de tri primaire « vérifié d'abord » dans le tri web. Test web avec le tri « Taille (effectif) ».
5. **« Data Nice »** : la suggestion « Chercher à Nice ? » s'affiche quand une commune connue termine la phrase sans marqueur. Trouver pourquoi elle ne sort pas (condition, données de communes, chemin de la barre) ; test de bout en bout sur le composant de la barre, pas seulement sur la fonction.
6. Démo : une ESN reconnue par ses offres, avec le motif, dans Autres acteurs (craft rule 9, `demo-coverage.ts`). Un test qui dit NON par point.

## Je ne fais PAS

Base commune / #4519 (lot R, PR #5127). Ma cible / paliers (lot S, PR #5125). Rester étroit sur `Discover.tsx` : ces deux PR y touchent.

Périmètre : `apps/ia/app/services/*`, `apps/ia/app/data/*`, `apps/ia/app/routers/discover.py`, `apps/ia/tests/*`, `apps/web/src/features/discover/*`, `apps/web/src/i18n/*`, `apps/web/src/test/tests-node.generated.ts`, `apps/api/src/modules/demo/*`, `packages/contracts/*`, `docs/briefs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` (contient le lot Q #5121). Push `git push origin HEAD:refs/heads/claude/decouvrir-t-esn-marque-0211` (push SIMPLE ; pre-push lancé en run_in_background puis attendu ; si check-types exige les dépendances : `pnpm --filter @bellum/contracts build`). Après chaque push, vérifier que `git ls-remote` = `git rev-parse HEAD`. Jamais main, jamais `--no-verify` / `--force`, jamais `.github/workflows`.
- PUSH APRÈS CHAQUE POINT VERT. PR PRÊTE vers main dès le premier point poussé. La PR liste honnêtement ce qui n'est PAS livré. Un point n'est livré que si son APPELANT prod est cité fichier:ligne.
- Plafond 300 tours ; à 240 : commit, push, PR, rapport, stop. Tests CIBLÉS (≤ 5 specs, pytest ciblé) ; Prettier 3.9.10 ; tout nouveau test web ⇒ une ligne dans `apps/web/src/test/tests-node.generated.ts`.
- Doctrine : jamais de donnée fictive ; jamais un SIREN deviné ; aucune source ni fournisseur nommé à l'écran ; une absence n'est jamais « 0 » ; démo seedée (craft rule 9, `demo-coverage.ts`).
- Rapport ≤ 12 lignes.
