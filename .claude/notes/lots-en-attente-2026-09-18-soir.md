# Lots en attente — 18/09/2026 au soir

Pourquoi ce fichier : au redémarrage du processus, le scratchpad a disparu avec
la file d'attente qu'il portait. Une file qui compte vit dans git.

Tous tranchés (décision écrite dans la ligne de registre citée). Un lot part dès
qu'une place d'écrivain se libère (plafond 5).

| lot | points | registre | ce qui est attendu |
| --- | --- | --- | --- |
| ~~H2 bis~~ EN VOL | 2288 — confirmer lance TOUTES les cochées ; lecture seule des états pour un viewer | `lau-029-2288` | décisions Louis 18/09 soir ; sources publiques nommées si la garde le permet sur main |
| H10 | 2489.3 | `CD-carte-decouvrir` | la cible déclarée s'applique au texte libre, filtre visible retirable |
| H11 | 2060.9 | `onboarding-questionnaire` | Laura reformule sur geste explicite, coût annoncé AVANT, l'utilisateur choisit |
| H12 | 2532.2 | `BE-memoire-404-et-recherche` | la recherche de contacts marche hors IT (thèmes, expansion) |
| H13 | 2173.29, 2173.56 | `2026-09-16-projects` | colonne Télétravail (contrat → écran), CTA d'import des besoins |
| ~~H14~~ | ~~2165.38~~ | `2026-09-15-discover` | ANNULÉ : trouvé déjà en production par le balayage de la vague S (`d2b14d7ca`) — à recetter, pas à écrire |
| H15 | 2151.32 seul | `2026-09-15-discover` | .33 et .34 déjà en production (vague S, `d2b14d7ca`) ; reste le filtre « clients observés », « inconnu » jamais « non » |
| H16 | 2598.4 | `DC-numero-contact` | bouton « corriger » visible au toucher et au clavier, cible ≥ 44 px (GA-32/35, le mobile est le produit) |
| H17 | 2567.3 | `DD-retours-client` | semer les cinq domaines restants de la rétention en démo |
| H18 | 2604.2 | `DA-demo-et-discover` | BALAYAGE CHIFFRÉ asyncio des ~15 sources d'abord, puis corriger celles qui saignent |
| H20 | 2591.6 | `DB-score-perime` | `confidenceNotRecalculated` sur le modèle exact de `scoreNotRecalculated` (lignes nommées au registre) |
| H21 | 2544.1 | `H-discover-moteur` | RÉFUTÉ en prod : le menu RÉGION n'a aucun effet mesurable, ARQUUS reste à Versailles — tracer ce que l'écran transmet jusqu'à `_list_row` |
| H22 | (neuf) 2166.56 | vague S | l'analyse en lot annonce 8 crédits par compte, alors que le lanceur débite 0 pour un compte déjà analysé et en démo — le devis doit sommer `GET /analysis/launch-plan`, comme H2 l'a fait sur /consultants |
| H19 | 2261.13 | `lau-006-2261` | latence déclarée par connecteur, après H3 (mêmes fichiers) |

Recettes en attente (un recetteur à la fois) :
- après la vague T : 2602.1 (entrée démo), 2543.3c + 2591.4 (salle de démo — ENTRER EN DÉMO REMPLACE LA SESSION, à faire en dernier et prévenir Louis), 2288.2-.4, 2087.9, 2088.3, 2195.*, 2650.1, 2565.10 (UN brouillon Odoo, autorisé).
- maintenant, en prod : 2598.5 (numéro ailleurs ? « renseigné/vide », jamais la valeur), 2599.2 (origine du 404), 2120.61 (Organigramme, Écosystème & accès, Laura).

## Mise à jour 18/09/2026, ~19 h 30

**Vague S fusionnée** (#2649, `23e7bfc6c`, servie). **Vague T en intégration** (10 branches) : H5, H4, H3, H7, H1/H6, H8, tranchages, H10, H20, H9.

**Vague U — branches prêtes, en attente de T** :
- `feat/la-verification-a-la-demande-18-09` @ `85d3f6da6` (H2 + H2 bis : #2288.2/.3/.4, Confirmer lance TOUTES les cochées, lecture seule viewer `GET consultants/:id/market-verification/states` en `@WorkspaceRead` sans coût, migration réhorodatée `1789756920868`). ⚠️ Registre 2288.2 : remplacer la migration citée `1795723412887` par `1789756920868`. GA-86 : `VerificationPlanDialog` ajouté aux portes d'annonce (coût exact = somme `launch-plan`) — revu, accepté.
- en vol : H21 (#2544.1), H12 (#2532.2), H22 (#2166.56 devis exact du lot), H16 (#2598.4).

**File ajoutée** :
| H23 | 2288 (sources) | `lau-029-2288` | le serveur rend les sources RÉELLEMENT prévues par le plan de collecte pour chaque entreprise ; l'écran nomme alors les PUBLIQUES (BOAMP, DECP, France Travail — décision Louis c66) et garde les payantes génériques. Jamais une liste TS recopiée de la logique Python (GA-26), jamais une promesse parfois fausse. |
| H24 | 2081.14, 2081.18 | `onboarding-audit-welcome` | règles globales ; portefeuilles et objectifs LOCAUX (niveau BU) — derniers points de #2081 |
| H25 | 2565.10 (suite) | `AC-facture-connecteur` | le bouton « Déposer un brouillon dans Odoo » se cache sans `finance:write` (aujourd'hui : 403 serveur) |
