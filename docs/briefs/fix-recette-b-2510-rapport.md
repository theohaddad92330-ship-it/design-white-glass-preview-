# Rapport FIX-RECETTE-B (25/10) — branche `claude/fix-recette-b-2510`

| Point                                     | État                          | Commit                                                    |
| ----------------------------------------- | ----------------------------- | --------------------------------------------------------- |
| 1 — #4409.1/.2 sigle « OGF » (/search)    | fait par le 1er écrivain      | 2dbc7de09a (pytest `test_4409_registry_typed_sigle.py`)   |
| 2 — #4408.1 « petite structure » (/chat)  | fait par le 1er écrivain      | 5233a41285 (pytest `test_4408_contrainte_lue_en_code.py`) |
| 3 — #4396.1/#4398.1 Veille › Recrutements | fait                          | 20cc8bb0d3                                                |
| 4 — #4405.1 modale + fil no-reply         | fait                          | 20cc8bb0d3                                                |
| 5 — changelog FR+EN 25/10                 | fait (`2026-10-25-recette-b`) | 20cc8bb0d3                                                |

Aucune branche en vol (`*-2410`/`*-2510`) ne traitait 3 ou 4 : `git log --all --grep` ne rend que des commits déjà sur main.

## Pourquoi les commits « livrés » ne suffisaient pas

- **#4396/#4398 (895f10a149)** : il corrigeait l'onglet _Opportunités_ (compteur + marque). La _Veille_ classait déjà les offres hors métier en fin, mais sans les REGROUPER : sur Arkea, aucune offre n'étant IT, les 5 affichées (« Structureur H/F »…) restaient en tête d'une liste sans repère. Ajout d'un titre « Autres métiers · N » devant le premier hors-métier (même prédicat `isOffDomainHiringSignal`, GA-26) ; rien n'est retiré (c76). Test : profil cyber → offre du métier, puis titre, puis autres.
- **#4405.1** : le pied de modale (`DialogFooter`, 5 boutons) ne passait pas à la ligne et poussait « Annuler » hors de la modale → `flex-wrap`. Nouveau garde `isAutomatedSender` (no-reply, do-not-reply, mailer-daemon, notifications…) : sur un tel fil le bouton n'est pas proposé, une ligne le dit. Fil humain : inchangé (mail prégénéré par #4405, jamais envoyé).

## Tests lancés

vitest : `WatchSignalTimeline.hiringDomain` (rouge → vert), dossier `veille/` (107 verts), `automated-sender` (12), `DraftDialog` (18), `ThreadReader.noreply` (2), changelog contracts (36). `tsc --noEmit -p apps/web` : 0 erreur. Pas relancé : pytest (points 1-2 faits et testés par le 1er écrivain), gardes d'architecture web (CI).

## À savoir

- Les commits 3+4+5 sont réunis dans UN seul commit (20cc8bb0d3, message « changelog ») : deux commits aux sujets > 100 caractères ont été refusés par commitlint et leur contenu est resté indexé. Pas de force-push : l'historique reste tel quel.
- Le test du pied de modale vérifie la classe `flex-wrap` (jsdom ne mesure pas les pixels) : à confirmer en recette à 768 px.
- Recommandation (non tranchée) : étendre `isAutomatedSender` à la liste « À traiter » (ne pas y ranger les no-reply).
