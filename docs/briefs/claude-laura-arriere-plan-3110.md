# Lot J — Laura : une recherche continue quand on change d'écran (#4967)

Branche : `claude/laura-arriere-plan-3110`

## Étape 0 — antériorité

`gh issue view 4967` en entier ; `git log --oneline --grep 4967 origin/main` ; chercher ce qui existe déjà (reprise `home-resume.ts`, `pickResumeCandidate`, persistance des fils, jobs côté API/IA). Ne recode pas le livré.

## Compris

Un commercial lance une recherche Laura puis change d'écran : la requête est ANNULÉE au démontage (`apps/web/src/features/chat/view/Chat.tsx:1282` `abortControllerRef.current?.abort()` au nettoyage ; flux `:1884` `askLauraStreaming`). Louis (29/10) : « pas encore en arrière-plan… prévu ». Note de Ludovic Odon : « pouvoir changer d'onglet avec Laura qui tourne ».

## Je fais

1. **#4967.1** Changer d'écran n'annule plus la réponse en cours : le flux vit hors du composant (store global Zustand existant ou module de flux), OU — si le serveur produit déjà la réponse complète et la persiste dans le fil — on ne coupe plus côté client et la réponse est relue au retour. Choisir le chemin qui garde UNE seule source de vérité (le fil persisté) ; le dire dans la PR. Seul le bouton « Arrêter » explicite annule.
2. **#4967.2** Revenir sur Laura : la réponse finie pendant l'absence est là ; encore en cours ⇒ l'indicateur « Laura cherche… » reprend.
3. **#4967.3** Une recherche terminée pendant l'absence est retrouvable depuis l'accueil (« Reprendre », `apps/web/src/features/chat/lib/home-resume.ts:40`) ; une pastille discrète dans la navigation signale qu'une réponse est prête (texte accessible).
4. Tests qui savent dire NON : démonter le composant pendant le flux n'appelle PAS `abort` ; « Arrêter » l'appelle ; le résultat est relu au remontage.

## Je ne fais PAS

Exécuter les recherches en tâche de fond serveur (BullMQ) si le flux actuel suffit ; Découvrir.

## Droits

Aucune surface d'accès : un fil reste celui de son auteur.

## Je défais

Rien ; citer les `#NNN` des lignes touchées.

Périmètre : `apps/web/src/features/chat/*`, `apps/web/src/features/home/*`, `apps/web/src/stores/*`, `apps/web/src/components/layout/*`, `apps/web/src/i18n/*`, `apps/web/src/test/tests-node.generated.ts`, `apps/api/src/modules/chat/*`, `docs/briefs/*`, `agent_docs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` ; push `git push origin HEAD:refs/heads/claude/laura-arriere-plan-3110` APRÈS CHAQUE POINT VERT (pre-push en fond + Monitor). Jamais main, jamais `--no-verify`.
- Plafond 200 tours. TDD. Tests ciblés ; Prettier 3.9.10 ; une ligne `tests-node.generated.ts` par test web ajouté ; démo si un affichage change.
- PR PRÊTE vers main dès le premier point poussé. Rapport ≤ 10 lignes.
