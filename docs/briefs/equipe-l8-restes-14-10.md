# Lot L8 — les restes du mode équipe (14/10/2026)

Applique `docs/briefs/equipe-commun-14-10.md` (même branche), SAUF le setup et « jamais de PR » (voir Fin : ce lot ouvre SA PR). Ta branche : `claude/equipe-l8-14-10`.
Plafond : 300 tours. À 240 : commit de ce qui est vert, push, commentaire, STOP.

## Setup (remplace celui du brief commun)

`git fetch origin && git checkout -B claude/equipe-l8-14-10 origin/integration/equipe-14-10` — tu pars de la branche d'intégration (PR #4170, les 7 lots fusionnés), PAS de main.
Puis `pnpm install --frozen-lockfile && pnpm --filter "./packages/**" build && git checkout -- packages/figma-sync/generated`.
Si `origin/integration/equipe-14-10` est déjà fusionnée dans `origin/main` au moment de ta fin de lot : `git merge origin/main` (conflits : les deux côtés gardés).
Migration éventuelle : horodatage supérieur au max de `apps/api/src/migrations/` sur `origin/main` ET sur ta branche (garde GA-372), jamais rond.

Les rapports des lots L1-L7 (commentaires de #4158) nomment ces restes. Chaque point est TRANCHÉ ici ; numéros du tracker §4 à partir de 47.

## Les points

- **#47 — Préparer une séquence sur le contact d'un collègue.** `OutreachService.create` (≈ l.287) exige que le contact appartienne à l'appelant. Tranché : la CRÉATION d'une séquence (brouillon, rien ne part) est permise sur tout contact de l'ESPACE ACTIF ; l'expéditeur reste l'appelant ; l'envoi reste un geste humain (doctrine). La garde « contacté il y a N j par un collègue » (#21) s'applique à la création. Contact d'un autre espace → 404. Tests deux utilisateurs.
- **#48 — Écrire sur la ligne d'action d'un collègue.** La mise à jour d'un `action_plan_items` (statut, note, échéance) est permise à : son `assigned_to`, son créateur, ou un détenteur de `team:manage` du même espace. Tout autre membre : 403 et l'écran montre la ligne en lecture (pas de bouton actif). Autre espace : 404.
- **#49 — Références clients (`proofs`) partagées à l'équipe.** Lecture par l'espace actif sur TOUS les lecteurs (capitalisation, propositions, `TabProofs`, outils de Laura) : liste-les avec `fichier:ligne`, corrige chacun. Le `scope` existant reste respecté (une référence marquée personnelle reste à son auteur). Modification : auteur ou `team:manage`. Si un lecteur ne peut pas suivre sans refonte, laisse-le et nomme-le (pas de filtre partiel silencieux).
- **#50 — Créer un exemple dans la bibliothèque de messages depuis l'écran.** L'API existe (lot L5, `message-library`), l'écran non. Bouton « Ajouter un exemple » sur l'écran de la bibliothèque, formulaire court (titre, canal, texte), visibilité « équipe » par défaut, appel de l'API existante, toasts succès/échec. Démo : semer 2 exemples d'équipe (un écrit par un collègue de `DEMO_COLLEAGUES`) ou classer dans `demo-coverage.ts`.
- **#51 — Garde #21 sur les étapes de séquence.** « Contacté il y a N j par un collègue » s'affiche aussi sur une étape de séquence préparée (confirmation, jamais un blocage dur), comme sur un message préparé. Trouve la surface ; si elle n'existe pas, nomme-le.
- **#52 — Badge « ne pas contacter » dans les LISTES de contacts.** Il est sur la fiche contact seulement : ajoute-le dans la liste `/contacts` et dans la liste des contacts d'un compte (même composant, même texte). Démo : un contact sur la liste semée par L4.
- **#53 — Équipe atteignable sur mobile.** Sur mobile (< 768 px, quatre onglets du bas, pas de cinquième), l'entrée « Équipe » doit être atteignable dès deux membres actifs, là où vivent les autres entrées hors onglets (menu/feuille « Plus » ou équivalent existant). Solo : absente. Test du composant mobile + garde GA-28/29/30 respectées.
- **#54 — `releasePortfolio` passe par le helper partagé.** `WorkspaceTeamService.releasePortfolio` utilise le même helper que le retrait back-office (passe 1) ; adapte ses specs (mocks) sans perdre un cas.
- **#55 — Test 403 de `PrivateSwitch`.** Le test de l'erreur 403 échoue en jsdom (raison inconnue). Trouve la cause et fais-le passer ; si c'est l'environnement, passe-le en happy-dom ou réécris-le sans perdre l'assertion. Jamais un `skip`.
- **#56 — Notifications d'équipe sans `workspace_id`.** Les anciennes notifications d'équipe (chat_mention…) sans `workspace_id` s'affichent dans tous les espaces : filtre-les à l'espace de leur auteur ou de leur objet si on peut le déduire ; sinon laisse-les visibles uniquement dans l'espace personnel. Ajout seulement, aucune suppression.

Hors lot (ne pas coder) : achat de sièges sur un abonnement actif (#35, recette humaine Stripe).

## Fin

Ouvre UNE PR prête (pas en brouillon) vers `main`, titre `feat: mode équipe — les restes (#4158.47-56)`, corps = la liste livré/déjà là/tranché/reste. Si `integration/equipe-14-10` n'est pas encore dans `main`, ouvre-la quand même : sa base est `main`, elle contiendra aussi les commits de #4170 ; dis-le dans le corps. Puis le commentaire sur #4158 « Lot L8 cloud (14/10) — branche claude/equipe-l8-14-10 @ <sha> » (format du brief commun). STOP.
