# Audit des déclencheurs de génération du ProfileContext — 14/09/2026

Lot #2009, préalable à #2008 (« une seule commande de génération par version »).
Retours source : issues GitHub #2008 et #2009 (bêta, in-app, `theohaddad92330@gmail.com`,
14/09/2026, écran `/welcome`).

## Méthode

Point d'entrée unique côté serveur : `ProfileContextService.triggerGeneration(userId, answers)`
(`apps/api/src/modules/profile-context/profile-context.service.ts:85`, ex-ligne 59 avant la clé
d'idempotence posée par ce lot).
Trois appels le rejoignent, tous en dehors du périmètre de fichiers de ce lot
(`apps/api/src/modules/esn-profile/**`, `apps/api/src/modules/onboarding/**`) — l'audit les
décrit, ce lot ne les modifie pas.

## Les 3 appels de `triggerGeneration`, remontés à leurs routes HTTP

### 1. `esn-profile.service.ts:107` — `upsertAnswers()`, fire-and-forget, INCONDITIONNEL

```
void this.profileContext.triggerGeneration(userId, next)
```

Appelé sur **toute** écriture réussie du profil ESN, sans condition sur ce qui a changé
(le diff `changedProfileFields` sert au journal `profile_updated`, jamais à décider s'il
faut régénérer). Deux routes HTTP l'atteignent :

- **`PUT /onboarding/answers`** → `OnboardingController.saveAnswers`
  (`apps/api/src/modules/onboarding/onboarding.controller.ts:49-51`) → `OnboardingService.saveAnswers`
  (`onboarding.service.ts:161-168`) → `EsnProfileService.upsertAnswers`. C'est la **sauvegarde
  partielle à chaque étape du questionnaire** (Temps 1 ET Temps 2 — même route, `SaveAnswers`
  couvre les deux jeux de clés) : la capture du retour montre 3 réponses enregistrées en
  11 secondes (06:09:44 → 06:09:55), donc 3 générations complètes lancées côté serveur pour
  une seule session d'onboarding non terminée. **C'est le déclencheur que #2008 décrit** :
  « chaque sauvegarde partielle peut déclencher une génération complète ».
- **`PUT /esn-profile`** → `EsnProfileController.updateMine` (`esn-profile.controller.ts:256-261`)
  → `EsnProfileService.upsertAnswers`. Écran Réglages › Profil : toute édition (y compris un
  champ à la fois, selon l'UI) déclenche aussi.

### 2. `esn-profile.controller.ts:259` — `updateMine()`, explicite, EN PLUS du n°1

```ts
async updateMine(user, dto) {
  const answers = await this.esnProfile.upsertAnswers(user.userId, dto)  // ← déclenche déjà (n°1)
  await this.profileContext.triggerGeneration(user.userId, answers)      // ← ET RE-déclenche ici
  return answers
}
```

**Doublon prouvé, pas supposé** : sur une seule requête `PUT /esn-profile`, `upsertAnswers`
lance déjà une génération en tâche de fond (n°1, sur les réponses résolues `next`), puis le
contrôleur relance `triggerGeneration` une seconde fois avec les MÊMES réponses (`answers`
est exactement ce que `upsertAnswers` a renvoyé). Deux appels au modèle pour un seul geste
utilisateur. C'est le scénario reproduit par le test `profile-context.service.spec.ts`
(« does not start a second IA generation … SAME user and SAME answers ») et fermé par ce
lot via la clé d'idempotence — voir §3.

### 3. `esn-profile.service.ts:85` — `regenerateProfileContext()`, explicite, AWAIT

```ts
async regenerateProfileContext(userId) {
  const answers = await this.getAnswers(userId)
  await this.profileContext.triggerGeneration(userId, answers)
  return answers
}
```

Route : **`POST /esn-profile/regenerate-context`** (`esn-profile.controller.ts:263-268`,
`@HttpCode(202)`). C'est le bouton « Actualiser mon audit » (déclencheur autorisé n°4 de la
liste fermée demandée par #2008) — celui-ci est déjà un geste EXPLICITE, pas un défaut.

## Déclencheurs qui n'existent PAS (vérifiés, pas supposés)

- `OnboardingService.complete()` (fin du questionnaire Temps 1, `onboarding.service.ts:170-192`)
  **n'appelle ni `upsertAnswers` ni `triggerGeneration`** — il stampe l'état d'onboarding
  uniquement. Le déclencheur autorisé n°1 (« fin de l'audit initial ») n'existe donc PAS comme
  déclencheur dédié aujourd'hui : la génération qui a eu lieu à ce stade est un effet de bord
  de la DERNIÈRE sauvegarde partielle (n°1 ci-dessus), pas un geste de fin d'audit.
- `OnboardingService.completeComplement()` (fin du complément Temps 2, `onboarding.service.ts:297-304`)
  **n'appelle pas non plus `triggerGeneration`** — même situation : tout repose sur la dernière
  sauvegarde partielle en date.
- Aucun import ni connecteur n'appelle `triggerGeneration` ou `upsertAnswers` :
  `grep -rn "triggerGeneration\|upsertAnswers" apps/api/src` (hors specs) ne retourne que les
  3 appels listés ci-dessus. Le déclencheur autorisé n°5 (« import ou connecteur ») n'existe
  pas encore dans le code — rien à fermer, rien à casser.
- Aucun bouton « Générer mon audit » dédié (déclencheur autorisé n°2) n'a de route serveur
  distincte : ce geste emprunte aujourd'hui la même route que la sauvegarde (`PUT /onboarding/answers`
  ou `PUT /esn-profile`), donc le même chemin non conditionnel n°1.
- « Modification substantielle de plusieurs réponses » (déclencheur autorisé n°3) n'est pas
  distingué d'une modification d'un seul champ : `hasAnyAnswer` / `changedProfileFields` dans
  `esn-profile.service.ts` calculent CE qui a changé pour le journal `profile_updated`, mais ce
  calcul n'est lu nulle part par `upsertAnswers` pour décider s'il faut régénérer.

## Ce que ça donne pour #2008 (liste fermée) — et pourquoi ce lot ne la ferme qu'à moitié

Les 3 appels ci-dessus convergent tous vers `ProfileContextService.triggerGeneration`, dans
`apps/api/src/modules/profile-context/**` — le seul périmètre ouvert à ce lot. Une clé
d'idempotence posée LÀ peut fermer le doublon prouvé (§ »2«, même utilisateur + mêmes réponses,
appel synchrone rapproché) sans toucher aux appelants.

Elle **ne peut pas** fermer le défaut principal que décrit #2008 — une génération par
sauvegarde partielle (§ »1«, `PUT /onboarding/answers`) — parce que chaque étape du
questionnaire modifie le CONTENU des réponses : la clé change à chaque appel, donc rien ne les
regroupe. Fermer la liste à 5 déclencheurs demande de RETIRER l'appel inconditionnel de
`upsertAnswers()` (`esn-profile.service.ts:107`) et de le remplacer par un appel conditionné
aux 5 gestes explicites — ce qui touche `esn-profile.service.ts`, `esn-profile.controller.ts`
et `onboarding.service.ts`/`onboarding.controller.ts`, tous **hors périmètre de ce lot**
(`apps/api/src/modules/profile-context/**` uniquement). Journalisation (déclencheur, version
d'entrée, coût, durée, résultat, auteur) et debounce/coalescence côté écran sont dans le même
cas : hors périmètre. Voir le rapport de lot pour le détail de ce qui reste à faire.
