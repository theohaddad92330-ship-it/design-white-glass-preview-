# Décisions de Louis — 18/09/2026, soir (les 24 questions en attente, tranchées)

Source : QCM posés en session, six lots. Ce fichier est la RÉFÉRENCE ; le fichier
`questions-en-attente-18-09.md` reste pour le contexte de chaque question, mais ses
sections sont désormais tranchées ici. Une décision ne se re-litige pas (socle §2).

| # | Sujet | Décision | Ce que ça déclenche |
|---|---|---|---|
| 1 | Recette de l'onboarding | **Le produit gagne un moyen légitime de rejouer son propre questionnaire depuis les Réglages** | lot écrivain ; débloque des dizaines de points d'onboarding non recettables |
| 2 | `#2548.4` — 8 à 12 questions essentielles | **Assumer les ~42 du profil** | le point se ferme, aucune coupe |
| 3 | `#2502.1` | **Geste manuel à zéro crédit, et GÉNÉRALISÉ** à toutes les sections qui peuvent se vider (`#2502.2`) | lot écrivain sur le dossier de compte |
| 4 | `#2489.3` — logo | **Logo pour tout candidat**, même non apparié | lot écrivain (carte de candidat) |
| 5 | `#2035.10/.11` | **Deux réglages d'ESPACE**, dans Paramètres. « Potentiel de réponse » nomme une CAPACITÉ configurée, jamais une chance estimée | lot écrivain (réglages) |
| 6 | `#2271.9` — 5e section de Laura | **Gabarit maintenu à quatre** ; les priorités s'expriment dans « Prochaine action » | lot écrivain (prompt conseil) |
| 7 | `#2078.29` — ordre d'import | **Par dépendance**, et la règle du 17/09 se reformule : « en fin de liste, SAUF dépendance explicite » | doc + registre |
| 8 | `#2565.12` — premier adaptateur facture | **Odoo**, Louis fournit un accès de recette | bloqué tant que l'accès n'est pas fourni |
| 9 | `#2556` — « compte connu » | **Déduit des traces** (mission ou activité en cours) — confirmé | issue close, rien à faire |
| 10 | `#2544.2` / `#2165.38` | **Ouvrir un contrat `people[]` dans Découvrir** ; chaque personne porte l'établissement RÉSOLU, jamais le siège, et l'absence est nommée | lot (contrats + web + ia) |
| 11 | `#2031.5` à `.8` | **Proposer sans remplir pour le CRM** (on montre ce que le CRM dit, en toutes lettres, la personne choisit) ; agenda / messagerie / import **écartés** | lot écrivain |
| 12 | `#2288` — dates de la mémoire de marché | **Date exacte dans MON espace ; grossie hors de mon espace** (granularité large + jamais moins de N espaces derrière un fait) | lot de CONCEPTION (touche le cloisonnement, GA-43) |
| 13 | `#2259.5` — dirigeant | **Non** : `owner` reste un rôle d'outil, jamais un titre | point fermé en reformulé |
| 14 | `#2259.37` — profil groupe | **Pas de niveau au-dessus de l'espace** | point fermé en reformulé |
| 15 | Démo — `first_door` toujours vide | **Séparer « adresse vérifiée » et « utilisable en démonstration »** | lot écrivain + garde de frontière démo |
| 16 | `#2088.12/.13/.10` | **Oui sur les DEUX** : chiffre d'affaires ET nombre de consultants deviennent des nombres (type, colonne, unité, période ensemble) | lot écrivain |
| 17 | `#2588` — balayage trackpad | **Blinder sans attendre** : `overscroll-behavior-x` monte sur `html` et `body`, pas seulement le conteneur | lot écrivain |
| 18 | `#2127.36` — CTA Comparer | **Refus confirmé** : l'état ne peut pas exister, le CTA ne s'afficherait jamais | point écarté avec la mesure |
| 19 | `#2118.51` — verdict passe-partout | **Cinquième segment complet** : la lecture en sept axes devient un segment de rattrapage, avec sa porte et son coupe-circuit | lot écrivain (migration + porte + bandeau) |
| 20 | `/discover` — aucun signal | **Une recherche d'entreprises va chercher les signaux des premières lignes** (coût : un appel de plus, à chiffrer) | lot écrivain |
| 21 | `#2151.59` — info terrain | **Note libre, datée et signée, sur le candidat**, reprise quand il devient un dossier | lot écrivain |
| 22 | `#2165.17` — preset « où positionner » | **Renvoyer vers le marché inversé** du consultant (un lien, pas un écran) | lot écrivain |
| 23 | `#2018.5` — notifications à l'accueil | **Renvoyer vers le réglage existant** (GA-26), pas de duplication | lot écrivain |
| 24 | Back-office / usurpation | **Caduque** : « j'ai testé, Ludovic est plus bloqué » | rien |
| 25 | Outillage — lectures prod des agents | **Autorisées** | fait : 11 outils navigateur EN LECTURE SEULE ajoutés à `.claude/settings.local.json` ; les outils d'écriture (`computer`, `form_input`, `file_upload`, `upload_image`, `shortcuts_execute`) restent soumis au classifieur |

## Deux décisions prises plus tôt le même jour

- **ARQUUS / collecte mince** : quand une collecte de contacts rend ≤ 5 personnes, elle
  **s'élargit d'elle-même — une seule passe, dans le MÊME run** déclenché par l'utilisateur,
  avec coupe-circuit. Aucun cron, aucune relance après la réponse.
- **`#2151.32/.33/.34`** : **livrer les trois filtres** de Découvrir (l'agrégat ne suffisait pas).
- **Le bandeau de collecte périmée** : une ligne, porte son bouton d'action, et **ne s'affiche
  JAMAIS en salle de démonstration** (capture Thales du 18/09 : il y était, pour rien).
