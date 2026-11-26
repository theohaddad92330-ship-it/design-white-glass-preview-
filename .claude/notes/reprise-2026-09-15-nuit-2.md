# Reprise — 15/09/2026, fin d'après-midi

## L'état servi

`main` = `63f0c7ee8`. **Trois intégrations ont atterri dans la journée** : #2252 (onboarding —
écran de relecture, sept étapes, progression, copilote dans le questionnaire, plafond Growth),
#2251 (huit branches comptes / prospection), #2279 (questionnaire — canaux, temps, outillage,
freins, appelants, Laura).

Le questionnaire est passé de **12 à 21 sous-étapes**, de **19 à 56 questions**, et
`esnAnswersSchema` de **52 à 89 clés**.

Registre : **4 308 points** — 874 `recetté` · 860 `déjà là` · 243 `livré` · 2 285 `retenu`.

## Le plafond de Laura est posé ET vérifié

`CHAT_DAILY_MESSAGE_LIMIT=100` sur Railway (`belllum-backend-service`, env `production`),
posée par la CLI — elle était déjà authentifiée, aucun identifiant saisi.
Mesure de bout en bout : `GET /ia/chat/quota` → `limit: 100`, `limitSource: "plan"`.
La bascule d'`operator` à `plan` est exactement ce que le test mergé prédisait.

## L'espace de Louis

Restauré : `completed` · `transition_summary` · `skipped_at: null` · 52 clés, 26 remplies.
Le parcours le remet seul en `completed` en arrivant sur `/welcome` — mesuré deux fois.

## Ce que la recette a prouvé

Deux passes complètes du parcours, 12 écrans relevés à la seconde.

- **#2034** (7 pts), **#2035** (2 pts) — les six situations de maturité, la santé d'activité,
  les deux comptes de consultants séparés.
- **#2024.10 / #2025.1** — la conséquence produit est sous la question.
- **#2013** — huit promesses de la page 0.
- **#2023.1 / .7** — les SEPT étapes nommées remplacent les trois anciens stages.
- **#2026.2** — « Enregistré à 15:30 » à l'écran.
- **#2022** — les réponses existantes sont préremplies (trois écrans franchis sans un clic).
- **GA-44** — `/welcome` nomme des CAPACITÉS (« Ton CRM », « Ta messagerie », « Ton agenda »),
  aucune marque.

## Les sept défauts (détail dans `defauts-recette-2026-09-15-nuit.md`)

- **R15N-9** — le plan de reconfiguration comptait 10 clés quand le questionnaire en posait 52. **Corrigé**, branche `fix/defauts-recette-onboarding-15-09`.
- **R15N-10** — « Autre (préciser) » comptait dans le plafond sans figurer dans « Ta sélection » : compteur « 6/5 », bouton mort, rien à retirer dans la liste visible. **Corrigé.**
- **R15N-11** — le texte généré de `/welcome` vouvoyait sur un écran qui tutoie 29 fois. **Corrigé** (consigne dans le schéma + garde).
- **R15N-12** — « 20 environnements » puis « 20 d'entre eux ». **Corrigé.**
- **R15N-13** — *mon* erreur : j'ai nommé le mauvais garde pour `/onboarding/plan`. Il lit le PALIER du compte (`decouverte`), pas le statut d'onboarding.
- **R15N-14** — juste après `POST /onboarding/refresh`, la page 0 rend la variante de PREMIÈRE FOIS ; un rechargement dur rétablit la bonne. L'état lu est périmé, le rendu est juste. **Ouvert.**
- **R15N-15** — « 100 % complété » figé sur 12 écrans (dont un à 8 questions vides) pendant que la barre voisine montait de 8 % à 100 %. Cause : le cliquet monotone `OnboardingStepper.tsx:61-66` se verrouille au premier rendu en reconfiguration. **Ouvert.**

## En vol

- **Intégration vague 2** : `fix/defauts-recette-onboarding-15-09`, `feat/onboarding-quasi-closes`, `feat/onboarding-voies-acces`, `feat/onboarding-lot16`.
- **Écrivain** : la parité démo du questionnaire + la garde au niveau COLONNE.

## ⚠️ Le trou nommé par quatre agents indépendants

`seedEsnProfile` sème **13 colonnes** d'`esn_profiles` ; la table en a 37 de plus depuis
aujourd'hui. `demo-coverage` raisonne au niveau **TABLE**, donc sa garde est VERTE pendant que
la fiche de démonstration est presque vide. Une garde borgne sur la règle qui protège ce
qu'un prospect voit. Un lot est parti dessus.

## Ce qui attend Louis

1. **« Votre organisation » ou « Ton organisation » ?** L'issue #2023 écrit le vouvoiement, la garde de lexique impose le tutoiement ; l'intégrateur a suivi la garde, et la recette confirme « Ton organisation » à l'écran. Même sujet que R15N-11.
2. **Six points Laura qui touchent des droits de rôle** : #1911.15 · #1918.7 · #1934.19 · #1941.5 · #1941.8 · #1941.15.
3. **Parité démo** : semer les 37 colonnes, ou assumer « vide à dessein » avec la raison. Le lot en vol propose, la décision reste produit.

## Huit issues n'attendent plus que la recette

Plus rien à écrire dessus : #1945 · #2002 · #2005 · #2013 · #2025 · #2034 · #2069 · #2071.
