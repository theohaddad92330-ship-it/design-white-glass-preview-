# Rapport — doublon-personas-0111

- Cause : `parseName` lisait « Prénom N. » comme nom de famille « n » (contradiction −6) et « Prénom, Prénom NOM » comme nom « prénom nom » ; la paire n'était jamais proposée, et le classement (`rankForAccount`) ne regroupait rien.
- `contact-duplicate-proposals.ts` : initiale du nom (« Claire F. » ≡ « Claire Fontaine », même compte, même prénom) et prénoms en virgules (≥ 3 mots) reconnus et PROPOSÉS ; autre initiale / autre prénom / autre employeur ⇒ pas de doublon.
- `contact-duplicate-path.ts` (nouveau) : groupes de doublon probable (fermeture transitive) ; une seule carte gardée = fiche la plus complète, à égalité persona la plus haute.
- `contacts.service.ts` `rankForAccount` : les fiches masquées sortent du CHEMIN seulement (jamais supprimées ni fusionnées ; l'onglet Contacts les garde). Refus humain « pas les mêmes » respecté (`rejectedPairKeys`, injection `@Optional()` en dernier).
- Tests (rouge → vert) : `contact-duplicate-proposals.spec.ts` (+5), `contact-duplicate-path.spec.ts` (4), `contacts.service.ranking-duplicates.spec.ts` (2) ; voisins verts : contact-ranking*, esn-personas, controller, perf-p5 (130 + 54).
- `tsc --noEmit -p apps/api` : seules 3 erreurs `@bellum/email` (paquet workspace non construit, hors périmètre).
- Garde doc↔code : une ÉCHAPPÉE préexistante (`agent_docs/prompts.md`, lot H), étrangère à ce diff.
- Démo : le jeu de démo ne contient pas le cas ⇒ `demo-coverage.ts` inchangé.
- Non fait : pas de test web (le filtre est côté API, `PriorityPathSection` inchangé) ; la persona affichée est celle de la fiche gardée, pas fusionnée depuis l'autre. Le test unitaire du helper a été écrit avec le code (pas avant).
