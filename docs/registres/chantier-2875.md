# Registre — chantier #2875 (moteur de déclencheurs commerciaux, #2402)

Lot du 26/10/2026. Découpage + une tranche bornée (1 point livré). Antériorité
lue avant d'écrire : l'épopée est ouverte depuis septembre et **le canon existe
déjà** — voir « Canonique retenu ».

## Canonique retenu (tranché sans toi : l'existant le plus utilisé, parce que 13 émetteurs l'appellent)

| Couche                           | Fichier                                                                                                          | Rôle                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Schéma + catalogue + corrélation | `packages/contracts/src/schemas/trigger-event.ts`                                                                | `triggerEventSchema` (17 champs), `TRIGGER_CATALOG`, `buildTriggerEvent` (seul constructeur), `combineTriggerEvents` |
| Liste fermée persistable         | `packages/contracts/src/schemas/canonical-trigger.ts`                                                            | 29 genres = CHECK SQL de `canonical_trigger_events`                                                                  |
| Registre                         | `apps/api/src/modules/trigger-registry/trigger-registry.service.ts` + entité `canonical-trigger-event.entity.ts` | `record` / `recordOnce` / `recordOnceByDedupeKey`                                                                    |

Autres implémentations trouvées (`git grep`), **non adoptées comme canon** :
`InterventionDraft` (`intervention-rules.ts`) — forme interne des détecteurs
purs, convertie par `interventions.sweeper.ts#toTriggerEvent` ; `discover_alert_events`
(table Découvrir, 7 genres, domaine propre : alertes utilisateur) ; `workflowTriggerSchema`
(`action-os.ts`) — enum de la RAISON d'un run de workflow, autre notion qu'un
événement. Aucune quatrième variante ajoutée.

## Demandes

| #       | Demande                                                                                                   | Sujet       | État      | Preuve                                                                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------- | ----------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #2875.1 | Un registre unique des événements (#2402.1)                                                               | registre    | déjà là   | 13 émetteurs migrés (`canonical-trigger.ts` docblock), `trigger-registry.service.ts`                                                                       |
| #2875.2 | Un trigger n'est pas recodé par page (#2402.2)                                                            | garde       | déjà là   | GA-389 (hors catalogue refusé) ; seuils de `workflow-catalog.ts` : voir #2875.7                                                                            |
| #2875.3 | Dix signaux commerciaux uniformes (#2402.3)                                                               | catalogue   | déjà là   | `trigger-event.test.ts` « dix signaux » ; tous `unified`                                                                                                   |
| #2875.4 | Schéma canonique commun (#2402.9)                                                                         | contrat     | déjà là   | `triggerEventSchema` strict, `isTriggerEventActive` lit `status`/`expiresAt`                                                                               |
| #2875.5 | Combiner plusieurs signaux (#2402.14)                                                                     | corrélation | déjà là   | `interventions.sweeper.ts:210`, `routines.service.ts:545`                                                                                                  |
| #2875.6 | Un genre canonique sans émetteur est refusé                                                               | garde       | livré     | `ga-417-un-genre-canonique-a-un-emetteur-reel.spec.ts` (dit NON sur fixture, lit les fichiers de production réels (> 10), ignore les commentaires)         |
| #2875.7 | Seuils dupliqués de `workflow-catalog.ts` vers le moteur                                                  | seuils      | retenu    | hors tranche : toucherait le catalogue de workflows (plusieurs modules) — à relire avant tout code                                                         |
| #2875.8 | Signaux Découvrir `hiring` / `legal` / `tech` / `funding` / `award` d'un compte POSSÉDÉ en `TriggerEvent` | émetteur    | retenu    | seul `tender`→`ao_publie` est migré (`ia-proxy.controller.ts#recordAoPublieTriggers`) ; exige migration élargissant le CHECK (GA-11/12) + démo (règle n°9) |
| #2875.9 | Corrélation inter-sources (signal Découvrir + intervention + routine sur un même compte)                  | corrélation | reformulé | aujourd'hui par balayage et par source ; la fusion inter-sources suppose un lecteur du registre qui n'existe pas encore — à construire APRÈS #2875.8       |

Aucun état « écarté ».
