# Rapport — « Avant d'agir » replié, ignorable, revérifiable (#4596 / ENG-2540)

Branche `claude/avant-dagir-4596-2610`, base `d7e6ab017acd18592fbf78ce6670e613c3bf52bc`. Aucune PR.

## Ce qui est livré

1. **Replié par défaut, le pli dit ce qu'il cache** — « 3 points à vérifier avant d'agir » (+ « · 1 ignorée »). Aucune carte = aucun
   bandeau ni pli (`hidden` sur la zone, l'espacement du parent disparaît aussi).
2. **Une carte neuve ouvre le pli** — chaque carte a une _signature_ (empreinte de son contenu). Jamais vue, ou contenu changé
   → le pli s'ouvre ; une fois ouvert, tout ce qu'il porte est « vu ». Lue, ignorée ou résolue : le pli reste fermé.
3. **« Ignorer » par carte, réversible** — range la carte pour cette personne et ce contact, n'efface rien, la carte reste listée
   « Ignorée le <date> » avec « Rétablir ». Pas de « tout ignorer » (testé). Un contenu qui change annule l'ignorance.
4. **« Revérifier » + un geste par carte** — voir le tableau. « Revérifier » ne fait qu'une RELECTURE (GET) : elle n'écrit rien,
   donc ne peut pas écraser une valeur gardée par un humain (`preflight.keptByHuman` reste affiché tel quel). La date vient
   d'un horodatage réel ; un échec réseau ne date rien.

| carte                   | geste                                                                                                                | Revérifier          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Écarts entre sources    | « Corriger la fiche » (ouvre le détail natif de la fiche modifiable)                                                 | relit le contrôle   |
| Relation historique     | « Voir l'historique des échanges »                                                                                   | relit la fiche      |
| Nouvel employeur        | « Mettre la fiche à jour » + « Chercher chez X » (existant) ; l'ignorance s'y nomme « Garder la fiche telle quelle » | relit la fiche      |
| Identité incertaine     | « Vérifier l'identité » (pli protections, où vit la confirmation)                                                    | relit la fiche      |
| Sollicitation en double | « Voir l'autre envoi » (ancre des séquences)                                                                         | relit les séquences |
| Collègue                | « Voir l'historique des échanges »                                                                                   | relit l'activité    |
| Doublon probable        | « Proposer la fusion » (existant, jamais de fusion seule)                                                            | relit les candidats |

Réemploi : `accountDetail:provenance.conflicts.recheck` (« À revérifier le … ») reste affiché dans la carte Écarts, désormais
rafraîchi par « Revérifier ».

## Antériorité nommée, pas contournée

Théo B c5 / #3687 place le bandeau au-dessus, pleine largeur. `ContactDetail.layout.test.ts` garde TOUJOURS la position ; sa
docstring dit que #4596 change seulement l'état initial, et deux gardes neuves tiennent le nouvel état (replié, ouvert par une
carte neuve, `hidden` sans carte, les sept cartes toujours rendues). Aucune garde désarmée.

## Choix à connaître

- **Souvenir : par personne, local à l'appareil** (`localStorage`, clé `bellum:avant-dagir:<user>:<contact>`). Aucune table, aucune
  migration, aucun semis de démo (aucun champ neuf → rien à classer dans `demo-coverage.ts`). Conséquence : le « vu / ignoré »
  ne suit pas la personne d'un appareil à l'autre.
- `DuplicateCandidatesCard` est partagée : hors bandeau (fiche compte) l'enveloppe rend les enfants tels quels — la fiche compte
  est inchangée. `ColleagueActivityBanner` et elle importent l'enveloppe depuis `features/contacts` (2 fichiers hors périmètre
  nominal, touchés minimalement).
- Mobile : la position ne bouge pas ; replié, le bandeau ne pousse plus le travail vers le bas, et une alerte neuve l'ouvre.

## Tests

Rouge → vert ciblé : `alerts/` (mémoire 6, bandeau 11, sept cartes 4), `ContactDetail.layout.test.ts` (13), cartes existantes
(ContactDetail, Preflight, DetectedNewEmployer, SolicitationCollision, team-guardrails : 44), i18n/parité/pluriels/couleurs/noms
accessibles (700+). `eslint` sans erreur sur les fichiers touchés ; `tsc --noEmit -p apps/web` : sortie 0.

## Pas fait

- Souvenir côté serveur (table) : à décider si « par personne » doit suivre l'appareil.
- Aucune recette navigateur ni mobile réelle ; pas de suite complète ni knip/CI.
- « Ouvrir son échange » du collègue mène à l'historique de la fiche (pas d'écran d'échange par collègue).
