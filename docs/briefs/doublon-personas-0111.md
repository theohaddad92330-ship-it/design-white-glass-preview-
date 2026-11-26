# Brief — une même personne sous deux personas (01/11/2026, décision Louis)

Branche : `claude/doublon-personas-0111`. Plafond 300 tours. Livrable : commits + PR prête, puis STOP.

## Constat (recette prod 01/11, compte réel)

Compte Wavestone, onglet Contacts (chemin prioritaire par persona, `PriorityPathSection.tsx`) : le CEO apparaît DEUX fois — « Prénom NOM » en Décideur économique et « Prénom N. » (initiale) en Champion. Idem pour le DG délégué (« Prénom, Prénom NOM » en Champion alors qu'il est déjà dans le top). Vu aussi : bandeau « 1 doublon possible » (2 fiches même e-mail).

## À faire

1. Trouver pourquoi deux fiches de la même personne (nom complet vs prénom + initiale du nom ; prénoms en virgules) ne sont pas reconnues comme la même : chercher la détection de doublons existante (`git grep -n -i "doublon\|duplicate\|dedup"` dans apps/api/src/modules/contacts) et le calcul des personas du chemin prioritaire.
2. Doctrine : on PROPOSE une fusion de doublons, on ne fusionne JAMAIS seul. Donc : (a) la détection reconnaît « Prénom N. » ≡ « Prénom NOM » au même employeur (et le nom à prénoms en virgules) et les PROPOSE comme doublon possible ; (b) le chemin prioritaire n'affiche jamais la même personne (même groupe de doublon probable) dans deux personas : une seule carte, celle de la fiche la plus complète, la persona la plus haute.
3. Jamais de fusion automatique ni de suppression ; une correction humaine gagne.
4. Tests : unitaire de l'équivalence (positifs + négatifs : deux personnes réellement différentes avec même prénom et même initiale chez des employeurs différents ⇒ pas doublon ; même employeur, initiales différentes ⇒ pas doublon) ; chemin prioritaire sans double carte.
5. Démo : si le jeu de démo contient le cas, le couvrir ; sinon `demo-coverage.ts` inchangé.

## Règles communes

- Étape 0 antériorité : `git grep` avant de coder ; déjà fait ⇒ écrire « DÉJÀ LÀ fichier:ligne » dans le rapport et passer.
- TDD (test rouge d'abord). Tests CIBLÉS (≤ 5 specs + `tsc -p` paquets touchés ; builder les deps workspace si le check-types les exige). JAMAIS suite complète, build global, check-types racine.
- Garde doc↔code : `node scripts/garde-derive-doc.mjs origin/main...HEAD`.
- Commitlint scopes : web|website|api|ia|mcp|dashboard-manager|ui|contracts|tooling|errors|http|observable|infra|packages.
- Aucun nom de personne réelle dans code/tests/commits/PR.
- PR prête vers main, corps finissant par :

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01RZu8c5wyRFXed6whEKHsXj
