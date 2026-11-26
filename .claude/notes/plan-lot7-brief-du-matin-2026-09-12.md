# Plan — lot 7 : la 1re ouverture du jour EST le brief (#1936, #1908, #1921, #1937.7)

Source : éclaireur lecture seule du 12/09 (sur l'arbre du lot 1). Décision de Louis : « 1re ouverture du jour = brief ».
⚠️ Constats d'éclaireur = affirmations : chaque écrivain les RE-VÉRIFIE avant de coder.

## Ce qui existe et se réutilise (preuves de l'éclaireur)
- Amorce du lot 1 : `laura-opener.ts:52-68`, branchée `Chat.tsx:786-803` ; écrite en base avec la 1re réponse (`Chat.tsx:520-546`).
- `briefing.service.ts:131-178` agrège déjà agenda / mail / tâches / comptes à surveiller / actions ; `zonedDateKey` existe, mais **fuseau figé** `DEFAULT_TIME_ZONE` (l. 132, `Europe/Paris` l. 57).
- Faits NOMMÉS avec lien réel : `buildAccountsToWatch` (l. 636) → `buildBriefingActions` → `ActionsBlock.tsx:171-261` (`CTA_BY_KIND` l. 162).
- Faits AGRÉGÉS sans lien : `since-last-visit.ts:69-121`, contrat `since-last-visit.ts:89-129` (aucun `accountId`/`href`) — `SinceLastVisitBlock.tsx:151-167` n'a aucun lien.
- Patron lit-et-écrit best-effort : `last-seen.service.ts:39-65`, table `user_last_seen` — appelé seulement depuis `/briefing` et `/journal`, battement 30 min (pas une frontière de jour).
- « Rien de préparé » : `buildBriefingActions` rend `NOTHING_PREPARED` (`demo-coverage.ts:1811`) — le bloc « Ce que j'ai préparé » sera honnêtement VIDE tant qu'aucun producteur réel n'existe.
- Occupé : `useLauraBusy.ts:100-112` ne lit aucune modale ; les dialogues passent par Radix (`role="dialog"`).
- `/welcome` : aucune voix de Laura, CTA `cta.viewSuggestions`/`cta.goToSearch` (`WelcomeScreen.tsx:191,201`).
- Rôle : `workspace-member.entity.ts:30` jamais lu par le brief ; aucune agrégation d'équipe.
- Fuseau navigateur déjà envoyé à des requêtes : `appContext.ts:43`, `AgendaBoard.tsx:95` ; aucun `profiles.timezone`.

## Découpage (fichiers disjoints)
| Lot | Contenu | Fichiers | Recette en production |
| --- | ------- | -------- | --------------------- |
| 7A — serveur « premier du jour » | table `user_daily_brief` (PK user, `last_shown_on` date-clé), `UPDATE … WHERE last_shown_on IS DISTINCT FROM $date RETURNING`, fuseau client accepté par `/briefing`, `isFirstOpenToday` au contrat ; démo : décision écrite | entité + migration (plage **1792800010000–1792800019999**), `daily-brief-marker.service.ts`, `briefing.service.ts`, `briefing.controller.ts`, `packages/contracts/src/schemas/daily-briefing.ts`, `demo-briefing.ts` | 1re ouverture après minuit → `true` une fois ; recharger → `false` ; 2e appareil même jour → `false` |
| 7B — 3 blocs dans l'amorce | `morning-brief.ts` (composeur pur), cas `morningBrief` + `justOnboarded` dans `laura-opener.ts`, branchement `Chat.tsx`, i18n | web chat | 1re ouverture du jour : 3 blocs signés Laura à 3 s ; source coupée → le bloc le dit ; fil neuf plus tard → amorce courte |
| 7C — occupé + handoff | `useLauraBusy.ts` lit une modale ouverte ; CTA de `/welcome` vers `/chat` sans `prompt`/`ask` + indicateur d'origine | `features/laura/useLauraBusy.ts`, `features/welcome/**` | modale ouverte → aucune intervention ; fin d'onboarding → Laura parle en premier |

Ordre : 7A (producteur) avant 7B (consommateur) ; 7C indépendant sauf une ligne de `Chat.tsx` après 7B.
Composition SANS appel au modèle (continuité de `laura-opener.ts`) ; bloc 3 = reformulation du rang 1 déjà classé, jamais un second classement.

## Questions (à grouper avec P4 et L9) — recommandations de l'éclaireur
1. Fuseau : envoyé à chaque appel, non stocké (reco) · ou `profiles.timezone` persistant (utile seulement pour un envoi programmé #1938).
2. Rôle (#1936.11) : variation de VOIX sur les mêmes données (reco) · ou contenu d'équipe pour un manager (chantier de données séparé).
3. Source en panne pile à la 1re ouverture : « premier du jour » consommé, silence nommé bloc par bloc (reco) · ou brief retenté sur un fil suivant.
