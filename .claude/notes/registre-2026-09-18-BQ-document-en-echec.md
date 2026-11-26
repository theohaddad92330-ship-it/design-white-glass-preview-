# Lot BQ — un document qui n'aboutit pas ne doit pas rester « en analyse » indéfiniment

base : `7b9083854909461927b030685f83e598faa76607` — 18/09/2026
branche : `fix/un-document-qui-echoue-le-dit-18-09`
issue : #2542 (retour `beta-client`, call de Ludovic Marx, 17/09/2026)

⚠️ Le PDF de Ludovic n'est pas dans le dépôt : rien ici ne prétend reproduire son cas exact. Ce
registre trace la chaîne du dépôt d'un dossier de compétences à son extraction — route → file →
worker → moteur → écriture du résultat — et nomme, saut par saut, qui met l'état à autre chose
qu'« en analyse » quand ça échoue. La colonne **preuve** cite l'APPELANT (fichier:ligne), pas
seulement la fonction.

## Colonnes

numéro · demande en huit mots · sujet · mesure · état · preuve

## Les trois points de l'issue

| numéro | demande en huit mots | sujet | mesure | état | preuve |
|---|---|---|---|---|---|
| 2542.1 | Une progression visible et une limite de temps bornée | Dépôt + lecture d'un CV | Le bornage RÉEL existe côté serveur (`HttpClient` défaut 30 s × 3 tentatives), mais un appel Claude coûteux (`cvParse`) l'héritait à tort — retard perceptible avant tout échec. La progression VISIBLE côté dépôt (barre d'étapes) existe déjà sur une branche sœur non fusionnée sur `main` ; sur `main`, l'écran de revue n'a qu'un texte statique « Je lis le CV… », sans étape ni pourcentage inventé (conforme GA-25, mais minimal) | déjà là | progression visible portée par la branche sœur `feat/normalisation-expertise-et-progression-cv-18-09` (non fusionnée) ‖ bornage serveur : `apps/web/src/features/consultants/view/parse/CvReviewPanel.tsx:83-89` (texte statique, avant ce lot) ; borne corrigée par ce lot : `apps/api/src/modules/ia/ia.client.ts:1419-1436` (`cvParse`, `maxAttempts: 1`, `timeoutMs: 60_000`) ‖ branche `fix/un-document-qui-echoue-le-dit-18-09` ‖ **EN PRODUCTION** — la branche citée est ancêtre confirmé du commit SERVI `474fcfa31` (`git merge-base --is-ancestor`), vérifié le 18/09/2026. Le point n'est plus « livré sur une branche » : il est en production. |
| 2542.2 | Erreur lisible qui dit pourquoi, et un moyen de réessayer | Dépôt + lecture d'un CV | Le message nommé existait déjà (commit `6b8d86691`, veille de ce lot) ; il manquait (a) un geste de reprise à l'écran et (b) l'honnêteté du délai avant cet échec (retry serveur qui le retardait) | déjà là | bouton : `apps/web/src/features/consultants/view/parse/CvReviewPanel.tsx:94-98` (`refetch()`) ; latence corrigée : `apps/api/src/modules/ia/ia.client.ts:1419-1436` ‖ branche `fix/un-document-qui-echoue-le-dit-18-09` ‖ SUR ORIGIN/MAIN — `fix/un-document-qui-echoue-le-dit-18-09` est ancêtre confirmé de `474fcfa31`, servi en production. Vérifié le 18/09/2026. |
| 2542.3 | Un document jamais traité ne reste pas bloqué | Dépôt + lecture d'un CV | Structurellement garanti : AUCUNE file BullMQ pour le CV (contrairement à `analysis.worker.ts`) — un dépôt est un aller-retour HTTP synchrone unique, rien n'est écrit en base avant que l'extraction réussisse. Le trou réel trouvé : une extraction PARTIELLE (page non décodée) était mesurée par le moteur puis jetée avant l'écran — un champ « non trouvé » devenait indiscernable d'un champ confirmé absent (GA-18/GA-19) | déjà là | chaîne complète : `apps/ia/app/routers/cv.py:93-124` → `apps/api/src/modules/consultants/cv-intake.service.ts:361-399` → `apps/api/src/database/entities/consultant.entity.ts` (`cv_extraction_partial`) → `apps/api/src/modules/consultants/cv-parse.service.ts:176-184` → `apps/web/src/features/consultants/view/parse/CvReviewPanel.tsx:134-142` ‖ branche `fix/un-document-qui-echoue-le-dit-18-09` ‖ SUR ORIGIN/MAIN — `fix/un-document-qui-echoue-le-dit-18-09` est ancêtre confirmé de `474fcfa31`, servi en production. Vérifié le 18/09/2026. |

## La carte des points muets — chaîne complète, saut par saut

Dépôt interactif : navigateur → `POST /talents/intake` → `CvIntakeService.intake` → `IaClient.cvExtract`
→ FastAPI `/cv/extract` → `extract_document_text` (+ OCR optionnel) → écriture `consultants`/`consultant_documents`.
Lecture/revue : navigateur → `POST /consultants/:id/parse` → `CvParseService.propose` → `IaClient.cvParse`
→ FastAPI `/cv/parse` (Claude) → validation citations → écran de revue.

| numéro | demande en huit mots | sujet | mesure | état | preuve |
|---|---|---|---|---|---|
| 2542.M1 | Navigateur : aucune limite de temps côté client | `apps/web/src/lib/api.ts` (`apiFetch`, tout appel) | Aucun `AbortSignal`/timeout par défaut dans `apiFetch` ; un appelant qui ne passe pas `signal` n'a AUCUNE borne — confirmé pour `intake`/`parseCv` (aucun des deux ne passe `signal`). Un fetch réellement gelé (proxy d'entreprise muet, onglet en veille) laisse « Je lis le CV… » indéfiniment, quel que soit le bornage serveur | muet — non corrigé | `apps/web/src/lib/api.ts:231-243` (aucun `signal` par défaut) ; appelants sans signal : `apps/web/src/features/consultants/api.ts:212-219` (`parseCv`) |
| 2542.M2 | Pas de précédent dépôt pour un délai client inventé | (raison de ne pas corriger M1) | Aucun `AbortSignal.timeout` nulle part dans `apps/web` avant ce lot (recherché explicitement) — corriger M1 aurait posé un chiffre SANS précédent, contrairement à la règle du brief (« dis d'où vient le chiffre »). Portée : correctif transverse à TOUT `apiFetch`, pas seulement le CV — hors périmètre d'un lot borné | muet — non corrigé à dessein | recherche : `grep -rn "AbortSignal.timeout" apps/web/src` → 0 résultat hors ce lot |
| 2542.M3 | `cvExtract` hérite un budget plus court que l'OCR | `apps/api/src/modules/ia/ia.client.ts:1404-1410` (`cvExtract`) | `cvExtract` n'a PAS de `timeoutMs` explicite → défaut `HttpClient` = 30 s/tentative. L'OCR qu'il peut déclencher côté IA a son propre budget de 60 s (`apps/ia/app/services/ocr.py:42`, `_TIMEOUT_S = 60.0`). Si l'OCR répond légitimement entre 30 s et 60 s, NestJS a déjà abandonné et RETENTE — un allongement caché, pas un silence (depuis `6b8d86691` tout rejet est nommé), mais **c'est le candidat le plus plausible à la cause RÉELLE du cas de Ludovic** : son call a eu lieu AVANT ce commit (17/09, veille), donc à cet instant précis un rejet non identifié remontait tel quel — cohérent avec « aucune erreur » observée en direct | livré | `apps/api/src/modules/ia/ia.client.ts:56-66,1426-1444` (`CV_OCR_TIMEOUT_MS = 90_000`, `cvExtract`) vs `apps/ia/app/services/ocr.py:42-45` ; test numérique qui lit le délai réel donné à la couche HTTP : `apps/api/src/modules/ia/cv-extract-timeout.spec.ts` (branche `fix/le-delai-du-cv-tient-la-lecture-optique-18-09`) |
| 2542.M4 | Pas de test fiable pour un délai numérique exact | (raison de ne pas corriger M3) | Ce fichier de tests ne vérifie JAMAIS un `timeoutMs` numérique exact (grep sur tout `ia.client.spec.ts` : seuls `maxAttempts`/présence de signal sont testés, jamais une valeur ms) — un correctif sans rouge prouvé aurait été posé sur la foi d'une lecture, pas d'une mesure vérifiable dans ce lot | muet — non corrigé à dessein | `apps/api/src/modules/ia/ia.client.spec.ts:1229-1244` (seul témoin de budget existant : présence d'un `AbortSignal`, jamais sa durée) |
| 2542.M5 | Import ZIP en lot : durée totale non bornée | `apps/api/src/modules/consultants/cv-batch-import.service.ts:38-83` (`importZip`) | Chaque fichier est borné (même chemin que #2542.2/.3), mais la BOUCLE ne l'est pas : jusqu'à `CV_ZIP_MAX_ENTRIES` fichiers dans UN SEUL aller-retour HTTP, sans progression ni rapport partiel si la requête ou le process meurt en cours de lot. Hors périmètre : c'est le lot N (#2568/#2569), pas le dépôt d'un document unique visé par #2542 | muet — non corrigé, hors périmètre | `apps/api/src/modules/consultants/cv-batch-import.service.ts:62-73` (boucle `for` sans bornage de durée totale) |
| 2542.M6 | Aucune file BullMQ : rien ne peut rester « analyzing » | `apps/api/src/modules/consultants/cv-intake.service.ts`, `cv-parse.service.ts` | Vérifié par recherche explicite (`InjectQueue`, `@Process`) : ZÉRO file pour le CV, contrairement à l'analyse de compte (`analysis.worker.ts` + `StuckAnalysisReaper`). Le dépôt/la lecture sont un aller-retour HTTP synchrone unique — structurellement, aucune ligne ne peut rester bloquée en base au sens de `StuckAnalysisReaper`. C'est pourquoi ce lot ne réplique PAS ce faucheur pour le CV : il n'y a rien à faucher | déjà là (garanti par construction) | recherche : `grep -rln "BullMQ\ @Process" apps/api/src/modules/consultants` → 0 résultat ; précédent lu : `apps/api/src/modules/analysis/stuck-analysis.reaper.ts:28-65` |
| 2542.M7 | Le précédent `unknown` ne s'applique pas littéralement ici | `analysis.worker.ts:373-478` (`classifyAnalysisFailureOutcome`) | Le précédent doctrinal (« un timeout n'est pas un échec : `unknown` arrête la reprise ») distingue une requête PARTIE sans réponse d'un échec définitif, pour arbitrer un REMBOURSEMENT et une REPRISE côté file. Le CV n'a ni file ni remboursement à ce jour ; la doctrine appliquée ici est sa cousine directe — un SEUL essai serveur sur un appel coûteux, la reprise reste un geste HUMAIN (bouton), jamais automatique — même principe, mécanisme différent parce que le CV n'écrit rien avant succès | déjà là (principe repris, pas copié à l'identique) | `apps/api/src/modules/ia/ia.client.ts:1416-1425` (ce lot) vs `apps/api/src/modules/analysis/analysis.worker.ts:456-478` |
| 2542.M8 | `cv-intake.service.ts` : rejet nommé AVANT ce lot | `apps/api/src/modules/consultants/cv-intake.service.ts:361-399` (`extract`) | Déjà livré au commit `6b8d86691` (veille) : tout rejet de `this.ia.cvExtract` devient `ServiceUnavailableException` nommé, jamais une exception technique brute | déjà là (avant ce lot) | `apps/api/src/modules/consultants/cv-intake.service.ts:378-385` |
| 2542.M9 | `cv-parse.service.ts` : rejet nommé AVANT ce lot | `apps/api/src/modules/consultants/cv-parse.service.ts:148-157` (`propose`) | Même commit `6b8d86691` : tout rejet de `this.ia.cvParse` devient `ServiceUnavailableException` nommé | déjà là (avant ce lot) | `apps/api/src/modules/consultants/cv-parse.service.ts:148-157` |
| 2542.M10 | `/cv/extract` calculait le signal partiel, le jetait | `apps/ia/app/routers/cv.py:93-99` (avant ce lot) | `extract_document_text` rend déjà `ExtractedDocument.partial` (#1954.16/.30, livré pour `/rag/ingest`) ; `/cv/extract` ne lisait que `.text` — signal calculé puis jeté avant même de quitter le service IA | corrigé par ce lot | `apps/ia/app/routers/cv.py:93-124` |
| 2542.M11 | Le signal partiel ne survivait pas à l'enveloppe HTTP | `apps/api/src/modules/consultants/cv-intake.service.ts` (`extract`, avant ce lot) | Même défaut côté API : `readExtractedText` lisait `.text`, personne ne lisait `.partial` — un dossier lu à moitié devenait indiscernable d'un dossier lu en entier dès la sortie du service IA | corrigé par ce lot | `apps/api/src/modules/consultants/cv-intake.service.ts:462-468` (`readExtractionPartial`, nouveau), appelé `cv-intake.service.ts:404` |
| 2542.M12 | `/rag/ingest` a le même signal, jamais lu côté API | `apps/api/src/modules/rag/rag.controller.ts` | Même mécanisme que M10 pour l'ingestion RAG (pas le CV) : `/rag/ingest` rend déjà `data.partial` (#1954.16/.30) mais AUCUN appelant NestJS ne le lit (`rag.controller.ts`, `ia.client.ts`) — un document RAG partiellement lu n'est nommé nulle part côté écran. Hors périmètre strict de #2542 (ce n'est pas un CV), signalé parce que trouvé en lisant le PRÉCÉDENT que ce lot réutilise | muet — non corrigé, hors périmètre | `grep -n "partial" apps/api/src/modules/rag/rag.controller.ts` → 0 résultat |
| 2542.M13 | Extraction CPU pypdf : borne de durée non mesurée | `apps/ia/app/services/document_text.py` (pypdf, page par page) | Aucune limite de TEMPS CPU sur la boucle de lecture pypdf (seulement des bornes de VOLUME : `_MAX_TEXT_CHARS`, `_MAX_XLSX_ROWS`). Un PDF pathologique (des milliers de pages, ou un objet PDF récursif) pourrait bloquer l'event loop FastAPI sans qu'aucun timeout HTTP amont ne le voie avant le budget réseau — non mesuré, non reproduit, noté par prudence | muet — non mesuré | `apps/ia/app/services/document_text.py:60-70` (bornes de volume, aucune de durée) |

## Ce que ce lot a livré (résumé, détail dans les commits)

1. `apps/ia/app/routers/cv.py` — `/cv/extract` nomme une lecture partielle (`data.partial`).
2. `apps/api/.../consultant.entity.ts`, `consultant-document.entity.ts`, migration
   `1795702850133-ConsultantDocumentExtractionPartial.ts` — le signal survit en base, sur la fiche
   ET sur le document (même patron que `captured_at`/`cv_captured_at`).
3. `apps/api/.../cv-intake.service.ts`, `cv-parse.service.ts` — le signal traverse les trois points
   d'écriture (création, rattachement, mise à jour automatique) et ressort dans `CvParseProposal`.
4. `apps/web/.../CvReviewPanel.tsx` — bandeau « lecture partielle », bouton Réessayer (geste humain,
   jamais une reprise automatique).
5. `apps/api/.../ia.client.ts` — `cvParse` : un seul essai (comme `rewriteCv`/`battlecard`), au lieu
   d'hériter 3 tentatives de 30 s sur un appel Claude coûteux.
6. Démo : Samir Ouazani (`DEMO_CV_IMPORT_CONSULTANTS`) — le seul état persistant qui montre une
   lecture n'ayant pas pleinement abouti (un échec TOTAL n'écrit rien, par construction).
7. Changelog FR+EN : `2026-09-18-un-document-qui-echoue-le-dit`.

## Sur le cas de Ludovic Marx

Pas de PDF pour le reproduire, donc pas de cause CERTAINE. Le candidat le plus plausible mesuré
dans cette chaîne est **2542.M3** : au moment de son call (17/09, avant le commit `6b8d86691` du
soir même), un rejet de `cvExtract` — y compris un abandon NestJS à 30 s pendant qu'un OCR
légitimement en cours pouvait aller jusqu'à 60 s — remontait comme une exception technique brute,
sans cause nommée, jusqu'à un 500 générique : exactement « aucune erreur » à l'écran. Ce lot n'a
pas pu vérifier ce scénario contre son fichier réel ; il rend en revanche ce type de silence
IMPOSSIBLE pour tout document futur (M8/M9, déjà là depuis `6b8d86691`) et corrige un second
silence trouvé en chemin (M10/M11, la lecture partielle) qui n'a pas de lien démontré avec son cas
précis mais couvre la même famille de symptôme (« pdf pas traité ? »).
