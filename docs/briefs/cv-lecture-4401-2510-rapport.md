# Rapport CV-LECTURE-4401 (25/10)

Branche `claude/cv-lecture-4401-2510` (base origin/main). Pas de PR.
**Chaîne** : dépôt → `cv-intake.service.ts` → file `cv-auto-parse.queue.ts` → `cv-auto-parse.service.ts:readOne` → `cv-parse.service.ts:autoRead` (écrit nom/e-mail/téléphone, qualifie) → IA `routers/cv.py` `/extract` (`read_document` → `ocr.py`, Mistral, gated `OCR_API_KEY`) puis `/parse` + `_complete_identity` → `cv_identity.py` (`guess_name`, `read_contact_facts`).
**Où ça se perdait** : cause (b), l'extraction ne lisait pas le texte rendu. Les maillons a, c, d étaient déjà traités sur main (#4401 N4, .1, .2). Reste mesuré sur textes fictifs : un téléphone aux espaces insécables (U+00A0/202F/2009, sortie OCR/PDF) → aucune coordonnée ; « (+33)612345678 » tronqué en « +33)… ».
**Corrigé** : `cv_identity.py` (espaces Unicode ramenés à l'espace simple, `(+` accepté). Valeur lue inchangée, rien deviné.
**Test** : `apps/ia/tests/test_4401_3_cv_espaces_ocr.py` — rouge 5/6 → vert ; avec les tests CV existants 85 passés. Spec API `cv-auto-parse.service.spec.ts` 29 verts.
**Rattrapage (non lancé)** : `CV_CONTACT_FIX_AT` repoussée au 25/10 ; segment contacts uniquement = fiches lues avant cette date, sans e-mail NI téléphone, sans correction humaine, non archivées (`scripts/cv-completeness-catch-up.ts`, jamais au déploiement).
**Démo (règle 9)** : rien semé. Aucune table ni clé raw_analysis neuve ; les échecs de lecture vivent dans la file Redis (non seedable), déjà classés « vide à dessein » (demo-coverage.ts, lot BATCH-CV). Les consultants semés ont leurs coordonnées.
**Non fait** : je n'ai pas reproduit sur le CV réel de Remy Bourdaa (inaccessible ici, donnée personnelle) ; la cause exacte de CE fichier n'est pas prouvée — si l'OCR n'est pas configuré en prod (`OCR_API_KEY`), un scan reste sans texte, ce que l'écran dit déjà. `garde-derive-doc` non lancée (Node 20 vs 22 requis).
**Arbitrage seul** : normaliser les espaces du téléphone lu (représentation, pas invention) ; pas de seed démo d'échec.
