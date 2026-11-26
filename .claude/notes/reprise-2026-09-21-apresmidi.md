# Reprise — 21/09/2026, fin de matinée

## L'état servi

- Production : `api dc9614fdf` (= `origin/main`), `ia 555e8fd82`. Relevé deux fois dans la journée.
- **PR #2670 (draft)** : `integration-vague-21-09`, les **12 branches du 20/09** absorbées (≈43 commits).
  Portes vertes au push : tsc web, `check-types:tests` api, prettier, `lint:exports:types`.
  Portes MANQUANTES, confiées à un second intégrateur : `pnpm --filter @bellum/web lint` et **la suite complète** (web + api + python).
  ⚠️ **Rien de cette vague n'est en production** tant que #2670 n'est pas mergée.

## Tranché par Louis aujourd'hui (QCM)

1. Retirer les DEUX blocs de l'onglet Contacts (#2658, #2659) — défait #2552.1 et #1609, délibérément.
2. Vivier /consultants : sélection + **archivage** + export. **Aucune suppression** (#2662).
3. Pièces jointes /chat : **zip déplié côté serveur** avec plafonds, plus xlsx/pptx/images (#2667).
4. Le hero de /welcome : retouche maintenant (#2086.17).
5. Étendre les thèmes de recherche **hors informatique** (#2532.2).
6. Manifeste des connecteurs : remplir depuis la **doc publique**, le reste NON VÉRIFIÉ (#2261).
7. #2018 et #2035 : **rouvertes** — leur fermeture du 18/09 citait le SHA `08bfa42a8`, qui ne contient aucun des fichiers annoncés.
8. #2084.24 : la revue sécurité BU au code suffit — point clos, vérification en base (RLS) remise au prochain passage.
9. Quatre `where: { id }` sans `workspace_id` → issue **#2671**.
10. #2120 reste OUVERTE : on construit l'estimation de durée (lot M).
11. #2173 : fermée sur la preuve au code (le CTA d'import n'apparaît que sur un portefeuille réellement vide).
12. Pièces jointes : **pptx ET OCR des images** (lot N) — le service de documents ne les exploitait pas.
13. Seuil « audit ancien » : **180 jours**, inchangé.
14. #2120 fermée : l'estimation de durée était livrée depuis le 19-20/09 ; « non mesurée » est le comportement conçu sous 5 mesures.
15. Une durée d'enrichissement est une **latence PRODUIT**, pas un coût d'accès : table anonyme, agrégat inter-espaces conforme — l'arbitrage part au registre de doctrine (lot O).

## Issues bougées

- **Fermées** : #2006 (22 pts), #2058 (12), **#2120 (77)**, #2173 (65), #2602 (2), #2604 (2) — 180 demandes.
- **Rouvertes** : #2018 (reste 1 point), #2035 (reste 2).
- **Ouverte** : #2671 (sécurité, pipeline interne des comptes).

## Branches prêtes pour la VAGUE 2 (aucune fusionnée)

| Lot | Branche | Ce qu'elle porte |
| --- | --- | --- |
| A | `fix/longlet-contacts-se-nettoie-21-09` | #2658.1, #2659.1 — les deux blocs retirés, i18n orphelines nettoyées |
| B | `feat/le-vivier-se-selectionne-sarchive-et-sexporte-21-09` | #2662.1/.2/.3/.4 — sélection, archivage en lot, export CSV |
| E | `feat/le-hero-de-welcome-respire-21-09` | #2086.17 — grille deux colonnes dès 1024 px |
| F | `feat/le-manifeste-des-connecteurs-est-alimente-21-09` | #2261.8/.13/.16 — manifeste rempli depuis la doc publique (2 commits) |
| G | `feat/la-recherche-sort-de-linformatique-21-09` | #2532.2 — 5 familles de thèmes hors IT + « aucun préréglage » nommé (6 commits) |
| H | `feat/deux-etats-nommes-de-laudit-21-09` | #2084.13/.14 — « espace inaccessible » distingué de « session morte », « audit ancien » daté (3 commits) |
| C | `feat/les-pieces-jointes-souvrent-et-lodoo-se-tait-21-09` | #2667.1/.2, #2668.1 — zip déplié (20 entrées, 40 Mo, pas de chemin sortant ni d'archive imbriquée), xlsx, pastille Odoo seule (5 commits) |
| K | `feat/le-questionnaire-propose-et-signale-21-09` | #2088.34 — la carte d'hypothèse de Laura, contrat + IA + écran + démo (6 commits) ; #2088.26 déjà là |
| M | `feat/la-duree-estimee-se-mesure-sur-les-runs-passes-21-09` | registre + une note de couverture démo (2 commits) |
| N | `feat/le-service-de-documents-lit-les-diapositives-et-les-images-21-09` | #2667.2 — pptx par zip+XML, images par le modèle sous plafonds (3 commits) ⚠️ combine avec C sur `Chat.tsx` |
| O | `chore/la-latence-produit-nest-pas-un-cout-dacces-21-09` | `c71_latence_produit_pas_cout_dacces` au registre de doctrine (1 commit) |
| L | `feat/les-trois-reglages-qui-manquaient-21-09` | ⚠️ commit `wip` de sauvegarde — un agent de reprise finit les portes |
| D | `feat/les-derniers-points-de-2165-et-2173-21-09` | registre seulement (réconciliation) |
| J | `fix/les-sources-qui-saignent-21-09` | registre seulement (mesure #2604.2) |
| — | `chore/registres-et-verdicts-21-09` | registres : réconciliation, verdicts, recette |
| ⚠️ | `feat/le-repli-de-collecte-dit-ce-quil-a-trouve-18-09` | **#2543.5g, RÉFUTÉ en prod** faute d'avoir été fusionnée (18/09) |

## Lots encore en vol

K (combobox catégorisée + carte de contradiction, #2088.26/.34) · L (les trois réglages rouverts, #2018.5, #2035.10/.11) · M (durée estimée, #2120.57) · second intégrateur sur les portes de #2670.

## À confirmer par Louis

- **L'emplacement de la carte d'hypothèse** (#2088.34) : elle vit sur la page de RELECTURE, pas « entre question et boutons » — le profileur ne tourne qu'une fois par soumission, jamais par question.

- **pptx et images** en pièce jointe (#2667.2) : le service de documents ne les exploite pas (aucun OCR), donc ils n'ont PAS été ajoutés au sélecteur — le QCM les nommait. Soit on s'arrête à xlsx, soit un lot ajoute l'extraction.
- **180 jours** comme seuil d'« audit ancien » (#2084.14) : choix du lot, pas un arbitrage. Tout vit dans `AUDIT_STALE_AFTER_DAYS`, un seul endroit à changer.

## Ce qui attend une preuve ÉCRAN

- #2662.4 — le débordement du tableau /consultants : jsdom ne mesure aucun pixel, sonde à 1512 **et** 378 px exigée.
- #2658.1, #2659.1, #2261.13, #2532.2, #2086.17 — livrés sur branches, non fusionnés.
- #2173.56 — clos sur preuve au code ; le CTA se verra sur un espace neuf.
- #2120.61 — **jamais recettable tel quel** : aucune donnée de production ne porte « identité ambiguë ».

## Pièges payés aujourd'hui

1. **Les registres se lisent sur `origin/main`.** La session travaillait sur `integration/vague-18-09-m` : 22 registres absents, deux lots partis pour rien (D et E).
2. **Une annotation de preuve n'est pas une preuve** : le SHA cité par trois `déjà là` ne contenait aucun des fichiers annoncés.
3. **`registre.py --tout fermables --seuil N`** existe maintenant : `--tout` est un drapeau GLOBAL, avant le nom de la commande.
4. **`registre.py` a DÉMÉNAGÉ en cours de session** : `plugins/livraison/skills/issues/scripts/` → `plugins/livraison/scripts/`. Un chemin de script codé en dur dans un brief meurt sans prévenir.
5. **Rendre douze worktrees pendant que trois suites tournent** a fait monter la charge de 22 à 90 : le ménage se fait machine au repos.
6. L'extension Chrome a refusé deux recetteurs avant de répondre ; `list_connected_browsers` depuis le fil principal tranche en un appel.
