# Brief cloud — défauts des recettes prod r55-r60 (02/11/2026)

Plafond : 300 tours ; à 240, commit + push de ce qui est vert, rapport, stop.
Branche : `claude/defauts-r55-r60-02-11`, créée depuis origin/main (elle CONTIENT main). Tu es le SEUL pousseur. Push SIMPLE après chaque point (jamais --force / --no-verify / rebase). AUCUNE PR : le fil l'ouvre.
Avant le premier push : `pnpm install --frozen-lockfile` puis `pnpm --filter @bellum/contracts build && pnpm --filter @bellum/shared build` (le pre-push lance check-types et exige les deps construites).

Ces points sont pour la plupart DÉJÀ livrés et ont ÉCHOUÉ à la recette en production (journaux r55-r60, 01/11). On ne recode pas : on rend VISIBLE et JUSTE ce qui existe. Chercher l'APPELANT avant d'écrire.

## Contrat (validé par Louis, QCM 02/11 ~05h40 UTC)

### A. Code sans appelant → le rendre atteignable

1. #2200.14 #2200.21 — `ApprovalTraceLine` (apps/web/.../ActionCenter.tsx ~l.970) ne se rend que dans `ApprovalList`, atteint si tab==='toApprove' ; `ActionCenter` n'est monté que par HistoryDrawer.tsx:47 avec un onglet d'historique ⇒ inatteignable. L'API renvoie trace.trigger et nextStepKey. Je fais : la carte « À valider » de /actions › Aujourd'hui ET sa modale montrent la source (trigger) et la prochaine étape, via le composant existant (pas de copie, GA-26).
2. #2200.13 — carte « Préparé par Laura » vs modale « Déclenchée par Louis Schlegel » : les deux disent la même chose (l'auteur humain qui a déclenché + l'agent qui a préparé, même formule aux deux endroits).
3. #2114.13 .60 .64 .66 .70 — `TrajectoryVerdict` et `PortfolioCoverageCard` ne sont montés que par PersonalCockpit ← DashboardContent ← DashboardPage, route morte (/dashboard → /briefing). Je fais : les monter dans Pilotage › Cockpit (refonte validée 14/10), verdict fort en haut, CTA « Voir les comptes concernés » et « Préparer une revue » fonctionnels. NE PAS toucher ManagerDashboardPage (/team, refondu par Louis). Ne pas recréer de route /dashboard.
4. #5000.1 #5000.2 — AccountJobOffersPanel.tsx (type de contrat par offre, l.105) n'est importé nulle part : le brancher dans la fiche compte (onglet où vivent les offres/signaux), même libellé de type de contrat que Découvrir (270ce4150e).
5. #2170.13 — /projects : aucune carte ne montre le titre du besoin principal ; primary_need_title n'est lu qu'à ProjectsPage.tsx:721. Le titre s'affiche sur chaque carte qui en a un (sinon rien).

### B. Comportement faux

6. #2074.16 — « Valider » un mouvement d'audit n'écrit que profiles.audit_move_decisions (profile-context.service.ts ~157/325) ; git grep audit_move apps/api/src/modules/actions = 0. Je fais : valider crée l'action correspondante dans Actions (geste utilisateur = auto-approuvé), idempotent (re-valider ne la double pas) ; « Écarter » n'en crée aucune.
7. #2276.31 — un job Laura n'est jamais « Obsolète » : seul écrivain superseded = copilot-card.service.ts:849 (supersedeMatching filtre trigger:'copilot_proposal', un job a laura_job). Une nouvelle demande dans le même fil qui remplace un job « À confirmer » le passe Obsolète.
8. #2276.22 #2276.29 — aucun écrivain de draft pour un job (rendu LauraJobCard.tsx:141 orphelin) ; « Échoué » : écrivains présents (laura-job.service.ts:289, laura-job.executor.ts:275/637) mais jamais vus. Je fais : un job créé sans confirmation possible (paramètres incomplets) naît « Brouillon » ; prouver par test que l'échec d'exécution écrit failed et s'affiche « Échoué ».
9. #2306.24 — esn_profiles.version vaut 1 à la création (esn-profile.service.ts:401/431) et aucun chemin ne l'incrémente ⇒ GET /accounts/impacted-by-profile-change rend accounts: []. Sauvegarder secteurs/offres incrémente la version (seulement si ces champs changent).
10. #2732.1 — import de missions : mapping proposé avec le vocabulaire contacts (« Poste / intitulé », « Société »), aperçu « 1 écartés / à revoir » sans motif. Mapping au vocabulaire mission ; chaque ligne écartée nomme son motif à l'écran (d862757502 l'annonçait, absent du rendu : chercher pourquoi).
11. #2732.2 — import vivier : une ligne sans nom est CRÉÉE au lieu d'être refusée avec son motif.
12. #2323.46 — NeedQualitySummaryCard affiche « Prêt à engager : oui » au-dessus du verdict « NON, MAUVAIS FIT — Ne rien engager ». Le résumé suit le verdict de la même page.
13. #4291.8 — /projects, section « projets gagnés — suivi de mission » : montants à x = 797 / 1269 / 269 / 1351 px. Montants alignés dans une même colonne (tabular-nums, ligne qui ne wrap pas différemment).
14. #2395.8 — /actions › Ajouter une tâche : Créer reste désactivé sans dire quel champ manque. Nommer le champ requis manquant.
15. Kineis (?tab=brief) — « Résolue par : Domaine officiel » affiché sous « Entité ambiguë » : un seul état cohérent.
16. /contacts/:id — après choix du statut, le sélecteur garde l'ancien libellé et le CTA n'apparaît qu'après rechargement : mise à jour optimiste / invalidation de la requête.
17. /contacts/imports — page blanche (spinner, 0 contenu) au 2e chargement consécutif : trouver la cause et la corriger ; test.
18. /actions › Historique — les onglets débordent à 1512 px (« Reportées » coupé) : la rangée défile ou passe à la ligne, jamais coupée.

### C. Nouveau (tranché Louis)

19. #2128 — sélecteur de BU sur la fiche compte (AccountTeamFacts rend null sans business_unit : AccountCollaborationBand.tsx:138-140, monté AccountScopePanel.tsx:123). Écrit business_unit du compte par l'endpoint de mise à jour existant (si une colonne/contrainte manque : STOP sur ce point et rapport — pas de migration dans ce lot).

## Droits

- #2128 : visible et modifiable par qui peut DÉJÀ modifier le compte ; REFUSÉ (non rendu côté web, 403 côté API) à qui ne peut que le lire. Test API du refus exigé.
- Trace d'approbation (#2200) : visible de qui voit déjà l'action, même garde.
- Cockpit (#2114) : mêmes droits que Pilotage › Cockpit aujourd'hui.

## Je ne fais pas

#2257.35 (prompt Laura — porte IA), #2616.1 (liens APEC/WTTJ réels), #1948 (épopée #2796), aucune migration, aucun rejeu de donnée, rien sur /team ni sur Laura V8 (#5032-#5048, autre session).

## Je défais

Rien de tranché ; chaque point remet en état une demande déjà validée. Toute ligne modifiée qui porte un #NNN : « garde #NNN » dans le message de commit.

## Règles

- TDD, test qui sait dire NON ; trace `// #<point> — …` dans le code ; commits par point, numéros dans le sujet (scopes : web, api, contracts, tooling), pied ≤ 100 car.
- Pièges CI : GA-252 ({{copilot}}, jamais « Laura » en dur dans une traduction), GA-251 (SelectField), GA-33 (aucune couleur hex), GA-34, GA-26, GA-18/19 (jamais « 0 » pour une absence), knip, `node scripts/classer-tests-node.mjs` dans apps/web si tu ajoutes un fichier de test web.
- Tests CIBLÉS (≤ 5 specs par passe) + tsc --noEmit -p du paquet touché. JAMAIS la suite complète ni le build.
- FR + EN pour tout libellé neuf ; fragment changes/defauts-r55-r60-02-11.yml.
- Démo (craft rule 9) : chaque écran rendu visible doit être rempli en démo (apps/api/src/modules/demo/demo-dataset.ts + demo-coverage.ts), dont une BU sur un compte démo et un job Obsolète/Brouillon.

Périmètre : apps/web/src/**, apps/api/src/modules/{actions,action-os,accounts,profile-context,esn-profile,laura-jobs,copilot,imports,consultants,missions,demo,contacts}/**, apps/api/src/**/laura-job\*, apps/api/src/**/copilot-card*, packages/contracts/src/**, changes/**

## Fin

docs/briefs/claude-defauts-r55-r60-02-11-rapport.md (≤ 15 lignes : par point livré (sha) / non fait (raison), SHA de tête), commit, push. STOP.
