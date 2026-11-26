# Brief #2257.35 — Laura distingue les travaux facultatifs (contrat validé par Louis le 31/10/2026)

COMPRIS : quand Laura décompose une demande en étapes, elle distingue les travaux facultatifs (utiles mais non
nécessaires au résultat demandé) des travaux nécessaires. Existant : `intent_router.py` (`steps`, `produces_now`,
`awaits_validation`) lu par `commercial_intent.py` ; aucune notion de « facultatif ».

JE FAIS : (1) champ `optional: bool` (défaut false) par étape dans le contrat du routeur d'intention (Python + Zod
si existant), avec raison courte ; (2) un travail facultatif n'est JAMAIS lancé sans geste utilisateur et ne bloque
jamais le résultat principal ; (3) là où le plan d'étapes s'affiche déjà, mention « Facultatif » / « Optional »,
changement minimal ; (4) tests : étape facultative → champ posé, non lancée d'office ; contrôle négatif ; (5) démo :
une étape facultative semée si le plan est semé (demo-coverage.ts).

JE NE FAIS PAS : aucun fichier de /chat Laura V8 (#5032-#5048) : pied de réponse, composeur, en-tête, panneau de fils,
ScopeDialog, ToolsSourcesMenu. Si l'affichage n'est que là : API + contrat seulement, fichier d'affichage nommé au
rapport. Aucun prompt réécrit au-delà de la consigne du champ ; aucun nouvel outil. Garde #2257, #4468.

Périmètre : apps/ia/app/** · apps/ia/tests/** · packages/contracts/src/** · apps/web/src/features/chat/** (hors
fichiers nommés) · locales FR+EN · apps/api/src/modules/demo/** · CHANGELOG* · docs/briefs/**
