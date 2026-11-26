# Rapport — lot LAURA-BUGS (#4540, #4539, #4543, #4408)

Branche `claude/laura-bugs-2510` (base origin/main f3b199c1). Aucun code produit : les quatre points sont DÉJÀ sur main.

- #4540 — livré : `0d388359` + fusion `4b3da4e6` (exonération du plafond au tour échoué, marqueurs `chat_stream_failed:*`, « Relancer »). Cause racine du flux cassé au 1er tour : non reproductible sans prod/Sentry (voir `n-laura-chat-2510-rapport.md`).
- #4539 — livré : `c0bec3e4` (`?new=` ouvre un fil vierge, composeur focalisé, dossier choisi après). Rien à refaire.
- #4543 — livré à moitié : `39e6b620` (le bloc dit « non renseigné » quand la liste est vide). Cause racine trouvée ici : AUCUN code (ia/api) n'écrit `raw_analysis.unknowns` ; le bloc est donc toujours vide en prod, alors que la synthèse (`priorityJustification`, prose) nomme des inconnues. Unifier = faire émettre `unknowns` par le moteur d'analyse (modèle de sortie + prompt + empreinte `UPDATE_PROMPT_GOLDEN=1`). NON fait ici : hors périmètre sûr sans accès modèle.
- #4408 — pas de régression sur main : `b112f769`, `c20f216e` ont posé `purchasing_process=light` (liste fermée, appliqué en code, groupes « Écartés : gros process achat » nommés). 16 tests verts (`test_4408_*`, `test_4438_4408_*`), 42 verts avec `test_prompt_fingerprint` + `test_laura_acts`. Pas de test rouge possible sans inventer. Limite connue : le paramètre est posé par le modèle ; aucune lecture déterministe de la phrase dans `read_request`.

Arbitrage nommé : je n'ai pas réécrit ce qui est livré. Environnement : `.venv` ia refait en Python 3.12 (3.11 par défaut échoue sur la syntaxe PEP 695).
