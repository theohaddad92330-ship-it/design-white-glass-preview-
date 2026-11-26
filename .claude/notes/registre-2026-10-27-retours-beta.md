# Registre — lot RETOURS-BETA (27/10/2026) · branche `claude/retours-beta-2710l`

Une ligne par point · état · preuve en recette (le geste qui le prouvera à l'écran en production).

## #4418 (CLIENT) — « Marquer envoyé » planifie la cadence
| Point | État | Preuve en recette |
| --- | --- | --- |
| #4418.1 le geste existe là où le commercial AGIT (« Aujourd'hui »), pas seulement sur la fiche contact | **livré** — `TodayCard.tsx` (bouton rafale + entrée « ⋯ »), `useTodayGestures.ts` `markSent` → `contactsApi.declareSent` | `/actions` → carte e-mail d'un contact → « Marquer envoyé » → toast « Envoi déclaré · relances J+3, J+6, J+9 planifiées » ; les 3 relances apparaissent dans « Cette semaine ». Aucune date d'envoi affichée |
| #4418.2 même cadence qu'un envoi Bellum | **déjà là** — `contacts.service.ts` `declareSent` → `cadence.service.ts` `scheduleForContact` (ancre = jour déclaré) | idem ; idempotent (une 2e déclaration ne double pas) |
| #4418.3 « Fait » reste déclaratif | **déjà là** — `via: 'declaration'`, test `MyRelancesList.declareSent.test.tsx` | aucune preuve d'envoi affichée |
| #4418.4 réponse reçue arrête la relance (#4181) | **déjà là** (hors lot) | — |
| #4418.5 démo remplie | **reformulé** — le geste ne crée aucune donnée nouvelle à classer dans `demo-coverage.ts` ; il s'appuie sur les relances de démo déjà semées (`demo-dataset.ts:10017`). Non vérifié à l'écran : à confirmer en recette démo | démo `/actions` → une carte e-mail avec contact → « Marquer envoyé » |
| #4418.6 « Mes relances » inatteignable (`ActionCenter.tsx:185,438`) | **reformulé** — #4164 a fait d'« Aujourd'hui » la file où l'on agit ; `MyRelancesList` (monté `ActionCenter.tsx:730`) reste du code mort. Je n'ai pas rouvert l'onglet : le geste vit maintenant dans Aujourd'hui | — |

## #4609 — `/contacts/<id>/approach/email` « La rédaction a échoué · Ce contact est introuvable »
| #4609.1 un 404 du moteur ne dit plus « contact introuvable » à tort | **déjà là** — `message-failure.ts:70` (commit 6d3e6019) | une panne moteur affiche « service temporairement indisponible » |
| #4609.2 cause racine « sur chaque contact » | **reformulé, non livré** — hypothèse : `apps/ia/app/services/ownership.py:43` `fetch_owned_contact` filtre sur `user_id` seul alors que l'API lit par espace (`workspaceScopeWhere`) ; un contact créé par un collègue répond 404. Reco : élargir à `workspace_id` (déjà résolu `message.py:214`). Pas de pytest dans cet environnement → pas de TDD possible, donc pas écrit | ouvrir l'approche e-mail d'un contact créé par un AUTRE membre de l'espace |

## #4401 — fiche consultant : CV sans coordonnées
| #4401.1 | déjà là | lecture sans modèle `cv.py:164` (`cv_identity.py`), rattrapage ciblé `talent.controller.ts:625` ; la fiche `34f4c624…` doit être REJOUÉE par le rattrapage (jamais seul au déploiement) puis montrer nom, e-mail, téléphone |

## #4396 + #4398 — FAMILLE : offres hors métier dans « Recrutements » (`CustomerPageContent.tsx:195`, même ligne)
| #4396.1 / #4398.1 les offres hors IT se DISENT hors de ton métier | **livré (partie écran)** — `discover-hiring-scope.ts` : « exploitation » seul rangeait « Agent d'exploitation en mobilier urbain » dans le numérique ; test `discover-hiring-real-titles.test.ts` (les 5 intitulés réels) | `?tab=veille` d'un compte IT : chaque offre non-IT porte la marque `signal-out-of-trade` (appelant `WatchSignalTimeline.tsx:92,201`) |
| #4396.2 cause racine (tri métier sauté pour France Travail) | **déjà là côté moteur / porté par PERTINENCE-PARTOUT** — non touché | `outsideTrade` ≠ 0 dans les journaux |
| #4398 daté « en toutes lettres lu 1er janvier » (#4647) | **non applicable ici** : aucun code de date touché ; lire `valid_from` avant de croire « archive » | — |
| #4398 compte e3a43eef absent de l'espace de test | **non conclu** (BLOCKED recette, pas un défaut) | — |

## #4465 — contacts CAFPI : fonction = avant-dernier poste, parti depuis un an
| #4465.1 la fonction est le poste « Actuel » | **déjà là** — `ContactApolloProfile.tsx:17,200` (`contactCurrentPost`) ; semis `demo-contact-density.ts:360` | démo : fiche **Julien Peltier**, **Marc Delaunay**, **Philippe Marchand**, **Grégory Pinault** → bloc parcours à 3 postes dont un « Actuel » |
| #4465.2 une personne partie se DIT | **déjà là** — semis `demo-contact-density.ts:401` | démo : **Karim Fassi** → « a quitté l'entreprise », date de fin |
| #4465.3 contact réel sans historique (LinkSyde) | **écarté** (doctrine « on n'affiche pas ce qu'on n'a pas ») : sans `employment_history`, aucune ligne inventée ; « Employeur : pas encore vérifié » reste | — |
