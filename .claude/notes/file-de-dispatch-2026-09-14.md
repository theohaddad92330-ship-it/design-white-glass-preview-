# File de dispatch — prête à partir dès qu'une place d'écrivain se libère

Plafond mesuré : **5 écrivains** sur 12 cœurs à `--maxWorkers=2`. Les éclaireurs en lecture seule ne comptent pas.
⚠️ Le seuil ne prévient pas : tant qu'il reste de la mémoire, un agent de plus va deux fois plus vite, puis tout
ralentit d'un ordre de grandeur en même temps. `uptime` relevé au moment d'écrire : **9,16**.

## PRIORITÉ 1 — deux violations de doctrine CONFIRMÉES en production

Un seul fichier, `apps/ia/app/models/profile_context.py`. Petit lot, fort impact, **aucun arbitrage produit** :
la doctrine est déjà écrite, c'est le code qui ne la tient pas.

1. **Le mot « probabilité » n'est pas interdit là où il devrait l'être** — `profile_context.py:417-423`
   (`scoring_personalization`) laisse le modèle écrire « la probabilité d'un besoin urgent », alors que
   `bellum_advisor.py:401`, `bellum_plan.py:372` et `reply_formats.py:50` l'interdisent explicitement.
   **Mesuré à l'écran** sur `/welcome` en production le 14/09 : « Le scoring évaluera … **la probabilité d'un
   besoin urgent** en Data/Cloud/Cybersécurité ». La doctrine « aucune PROBABILITÉ » a été refusée **six fois**.
   → aligner l'interdit sur les trois autres prompts, **et** poser la garde qui manque : aucune garde automatique
   ne couvre le texte du prompt système (`doctrine-registry.ts:1730`), la règle tient par relecture.
2. **Des noms d'entreprises générés par le modèle depuis sa connaissance générale** — `profile_context.py:428-431`
   demande explicitement « CAC40/SBF120 » au lieu de passer par la mémoire marché / DataForge. C'est la doctrine
   « **JAMAIS de donnée fictive** », et c'est exactement ce que demande **#2069** (« aucun nom d'entreprise inventé
   par le modèle »). Aucune garde ne couvre ce champ (vérifié dans `test_protected_criteria_scoring.py:101-115`).

⚠️ Périmètre à réserver : `apps/ia/app/models/profile_context.py` + ses tests. Conflit possible avec un lot qui
écrirait dans `apps/ia/app/services/` — vérifier ce qui est en vol avant de lancer.

## PRIORITÉ 2 — élargir une contrainte SQL AVANT le code qui l'écrit

**#2004** demande 10 valeurs pour `user_onboarding_state.status`, or l'enum SQL n'en a que 3
(`OnboardingProfilesSchema.ts:127`). Gardes **GA-08 / GA-11 / GA-12** : une valeur qui voyage du code vers la base
voit sa contrainte élargie **AVANT** le code qui l'écrit, un enum ne perd jamais de valeur et n'en insère jamais
au milieu. **Migration additive seulement.** Lot petit, mais il bloque tout le sujet « machine d'état ».
⚠️ Réserver une plage d'horodatage de migration à l'agent (quatre collisions en une vague le 30/08).

## PRIORITÉ 3 — les lots cadrés qui attendent un écrivain

- **#1948** (corpus canonique 17 champs) : bloqué en cascade par le lot **1948-B**, le fichier canonique lui-même,
  aujourd'hui ABSENT — 5 des 17 champs existent dispersés dans `test_copilote_scope_eval.py:166`. Faire 1948-B
  d'abord libère les 5 autres groupes.
- **#1945** (golden tests par persona) : 8 groupes calés sur des briques existantes (`onboarding-funnel.ts`,
  `WorkspacePermissionGuard`, `org_resolver.py`, `bellum_advisor.py`). Aucune doctrine touchée.
- **Onboarding, 13 lots** cadrés dans `lots-onboarding-audit.md` (L1-L13) + le questionnaire (47 issues) dans
  `lots-onboarding-questionnaire.md`.

## CE QUI NE PART PAS SANS LOUIS

- **#1946 — l'instrumentation produit** est quasi entièrement sous la doctrine `c64_analytique_produit` : l'union
  fermée de `product-tracker.ts` (9 événements, gardée par **GA-264**) ne contient AUCUN des événements demandés,
  et la relecture juridique RGPD reste due. Seuls `1946.21` (vocabulaire) et `1946.22` (déjà livré) y échappent.
  Points concernés : `1946.1-12`, `.16`, `.23-26`, et `.17-19` qui dépendent du même verrou.
- **Facturation / entitlement** : #2002, #2003, #2004, #2014 (modules `stripe`, `credits`, `plan-features`).
- **Cloisonnement workspace / BU** : #2005, #2084 — aucun module BU n'existe, c'est un modèle NEUF.
- **Contradictions à fusionner avant dispatch** : #2013 vs #2086 (même page de bienvenue, deux maquettes) ;
  #2070 vs #2085 (même golden set) ; #2008 doit être écrit APRÈS l'audit demandé par #2009, pas avant.

## RECETTE EN ATTENTE

- **Idempotence (#1952.38 / #1959.18)** — le geste prévu (`/actions` › Automatisations → Lancer, F5, Lancer)
  **n'a PAS été joué** : lancer une automatisation peut déclencher une écriture sortante (CRM, e-mail, séquence),
  et l'autorisation permanente de Louis ne couvre PAS le sortant. Le geste de repli — double-cliquer
  « Programmer le rappel » sur une carte de Laura — est interne et sûr, mais il faut d'abord une carte de rappel,
  donc que **#1995** soit corrigé. À rejouer après l'atterrissage du lot `contact-nomme-survit-au-tour`.
- **Garde démo de la bulle** — demande d'ouvrir le lien de démonstration publique, à faire **en DERNIER** dans une
  passe (les cookies de démo et d'un vrai compte se mélangent, le premier lu gagne).

## Le questionnaire d'onboarding — 19 lots, et un ORDRE qui n'est pas négociable

Cadrage complet : `<scratchpad>/lots-onboarding-questionnaire.md` (47 issues, **600 demandes**, somme vérifiée).

⚠️⚠️ **L6 « repaint UX + charge cognitive » DOIT PARTIR EN PREMIER** : il touche les mêmes fichiers que L8 et
L10→L19. Le lancer après, c'est refusionner dix lots derrière lui. C'est le verrou de FICHIERS qui commande
l'ordre, pas la valeur métier — et c'est lui qui borne le nombre d'écrivains simultanés, pas la machine.

Les 19 lots : L1 page 0 accueil (petit) · L2 rejoindre un espace ESN (gros) · L3 confirmation entreprise + BU
(gros) · L4 profil déjà configuré + confidentialité (moyen) · L5 Laura guide (moyen) · **L6 repaint UX (gros,
EN PREMIER)** · L7 reconfiguration (gros) · L8 progression + récapitulatif (moyen-gros) · L9 autosave visible
(petit-moyen) · L10 états d'incertitude (gros) · L11 provenance du prérempli (moyen) · L12 challenge des
contradictions (gros) · L13 déduction / import (gros) · L14 orientation pro + RBAC (gros) · L15 maturité,
effectif, territoire (moyen) · L16 offre prouvée, staffing, secteurs (moyen-gros) · L17 client idéal, accès
(moyen-gros) · L18 vivier, missions (moyen) · L19 bloc entreprise étendu, 12 issues (GROS — le plus grand écart
entre ce qui est demandé et ce qui existe).

**Existant vérifié AVEC son appelant** (donc à ne pas recoder) : `OnboardingStepper` est appelé par
`OnboardingWizard.tsx:79` — ⚠️ mais son `done = i < currentStageIndex` (`OnboardingStepper.tsx:12`) est
**positionnel** : c'est un indicateur d'AVANCEMENT, pas un état, et il ne prouve pas qu'une étape est faite ;
`PrefillBadge` est appelé par `SubStepQuestions.tsx:32` (partiel : ni date ni boutons) ;
`ProfileComplementCard` est appelé par `DashboardContent.tsx:31` (mécanisme distinct, vivant) ;
`OnboardingCompanyPage.tsx:39` appelle déjà `POST /esn-profile/prefill` (couvre partiellement #2015).

**Un champ déclaré que PERSONNE n'écrit** : `user_role` / `role_tenure` (`onboarding.ts:151-152`), zéro
occurrence ailleurs — à vérifier avant L14. C'est la forme miroir du défaut n°1.

**Contradictions à trancher AVANT dispatch** (sinon le dernier codé gagne par accident) :
#2013 vs #2086 (page 0, deux maquettes) · #2023 vs #2030 (vocabulaire de progression : 7 étapes contre 8) ·
#2040 vs #2044 (même champ `staffing_model`, deux extensions indépendantes) · #2041 et #2046/#2047 mal classés
(le contenu ne correspond pas à la route capturée).

**Arrêts obligatoires** : L2/L3 cloisonnement `workspace_id` / BU (#2016, #2017, croise #2005) · L14 RBAC (#2033).
**À trancher (doctrine)** : L10 « non mesuré n'est jamais 0 » (#2027) · L19 même règle (#2049) et « aucune
probabilité affichée » (#2052).
