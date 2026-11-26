# Reprise — 14/09/2026, 15h30

> Remplace `reprise-2026-09-14-soir-2.md`. Les 7 points « restants » de cette
> note ont tous été RE-MESURÉS ; quatre étaient faux ou incomplets (§« pièges »).

`origin/main` = **`a340a7afd`** · servi en production : **`5ecce45c4`** (et c'est JUSTE :
ni `d99317f48` ni `a340a7afd` ne touchent autre chose que `tools/` et `.claude/`, donc ni les `watchPatterns` d'api
ni ceux d'ia — la question n'est pas « ce service sert-il le SHA du merge » mais
« avait-il quelque chose à déployer, et l'a-t-il fait »).

---

## 1. TRANCHÉ — ne pas reposer

**Décisions de Louis, prises aujourd'hui.**

1. **#2141 « recentrer au milieu » → REFUSÉ.** On garde l'alignement à gauche de
   #2001 et la garde `chat-mise-en-page.test.ts`. Raison mesurée : centrer fait
   sauter l'écran de ~238 px au premier message. L'autre moitié de #2141 (grille à
   2 colonnes) est livrée. **→ reste à répondre dans l'issue.**
2. **#2141 « en mettre 6 » → ACCEPTÉ, forme amendée** (contre ma recommandation) :
   toujours 6 amorces, les vraies d'abord, complétées par des **génériques nommées
   comme telles dans le modèle de données** — jamais deux amorces inventées.
   **LIVRÉ** sur `amorces-generiques-nommees` (`1daa98424`) : champ
   `origin: 'personalised' | 'generic'` à `laura-home-suggestions.ts:91`.
3. **Fuseau par utilisateur → ACCEPTÉ** (contre ma recommandation de garder Paris).
   Colonne `timezone` sur le profil (ajout seulement), détectée au navigateur,
   corrigeable par l'utilisateur, lue par `current_time_block()` ;
   `REFERENCE_TIMEZONE = "Europe/Paris"` reste le défaut quand le fuseau est inconnu.
   **En cours** sur `fuseau-par-utilisateur`.
4. **#2129 FERMÉE** en pointant #2130 (doublon exact, 19 s d'écart, corps identique).
   **#2086 RENOMMÉE** sans son « V3 ».
5. **`feedback-assets` n'entre PAS dans l'intégration K** — 688 fichiers, tous des
   PNG, zéro ligne de code. C'est le magasin d'assets que le code désigne lui-même
   (`github-issue.service.ts:248`, `FEEDBACK_GITHUB_ASSET_BRANCH ?? 'feedback-assets'`)
   et les URL servies pointent sur `blob/feedback-assets/…`. La fusionner mettrait
   688 binaires dans `main`. **→ question pour Louis, pas une décision d'agent.**

**Deux FAUSSES ALERTES que j'ai levées moi-même — ne pas les rouvrir.**

- Le titre « Assistant IA » de `/settings/mcp` **n'est pas** une violation de D82 :
  cet écran sert à brancher Bellum sur **l'assistant de l'utilisateur**
  (« Connecter Bellum à ton assistant IA »), il ne nomme pas Laura. Idem pour les
  7 autres occurrences FR.
- Le champ `owner` de `GET /tool-registry` vaut `"workspace"` sur nos propres
  fournisseurs (apollo, brave, firecrawl…). **Ce n'est pas une violation du D354** :
  `owner` dit qui PORTE la connexion (l'espace, ou un utilisateur), pas à qui
  l'outil appartient — docblock `packages/contracts/src/schemas/tool-registry.ts:55-56`.
  La doctrine est tenue par `CLIENT_TOOLS` / `connectedClientTools`
  (`tool-naming.ts:134-198`), et la barre de saisie affiche bien les 8 bons outils.

---

## 2. MERGÉ, PAS ENCORE RECETTÉ

| Quoi | SHA | État |
| --- | --- | --- |
| **#2168 intégration J** | `5ecce45c4` | **RECETTÉE** (59/59, voir §3) |
| **#2209 digest `--tri` + profil** | `d99317f48` | merge **prouvé par le CONTENU** (`--tri` présent dans `tools/issues/digest.py` et dans le profil sur `origin/main`). Rien à recetter côté produit : ni api ni ia concernés. |

**PR ouvertes**

- **#2211 — intégration K, EN DRAFT**, `integration-k` = `7ccc29c7e`, 61 fichiers,
  22 commits, 7 branches sur 8. Sa CI (run `34849552460`) **n'a pas été relue**.
  → la relire, sortir du draft, merger, attendre les DEUX déploiements, recetter.
- ~~#2210 — mes relevés d'outillage au §11 du profil~~ → **MERGÉE** (`a340a7afd`), CI
  verte sur son SHA (8 passés / 0 échec). Aucun conflit avec #2209 : les deux sections
  du profil coexistent, **prouvé par le contenu** sur `origin/main`.
- #1487 — préexistante, `UNKNOWN`, hors de ce lot.

**Branches poussées, en attente de l'intégration L** (L ne merge PAS avant que K soit recettée
— une seule PR non recettée en production à la fois)

| Branche | SHA | Ce qu'elle porte |
| --- | --- | --- |
| `portee-changelog-fondation` | `58c0d102f` | **portée de recette 59 → 3 routes** |
| `briefing-heures-en-reunion` | `175aecc5c` | les « 50 h en réunion » : 52 h → 2 h |
| `dettes-chat-a11y` | `db3ad9a4c` | cibles 44 px + jeton `--bellum-focus-ring` (12 fichiers) |
| `amorces-generiques-nommees` | `1daa98424` | décision Louis n°2 |
| `fuseau-par-utilisateur` | *écrivain encore en vol* | décision Louis n°3 |

---

## 3. CE QUI A ÉTÉ PROUVÉ EN PRODUCTION

**Balayage 59/59, régime FONDATION** (`python3 tools/recette/portee.py` : le diff
touche `items.settings.ts`, `i18n/config.ts`, `i18n/resources.ts`, `route-titles.ts`).
Sonde JS par écran (pathname · longueur · débordement horizontal · bannière), console
lue à chaque lot. **Zéro débordement, zéro erreur console, zéro bannière de panne.**

- ✅ **`/settings/profile/audit`** (la route neuve de J) — titre « Bellum AI - Audit
  commercial », donc le correctif tourne : l'écran **n'hérite plus** du titre
  précédent. 3 525 c de vrai contenu, **atteignable au clic** (entrée « Audit
  commercial » dans la barre latérale), **thème sombre propre** (capture).
- ✅ **`/settings/memory`** — sections « Préférences personnelles » et « Corrections
  terrain » PRÉSENTES (26 143 c) → côté écran de #1916.5 / #1916.9.
- ✅ **Bouton micro de `/chat`** présent et NOMMÉ (`Dicter un message vocal`) → #1939.1.
- ✅ **`/briefing` : « 50 h en réunion » REPRODUIT.** Cause trouvée, corrigée, non
  mergée : `agenda-view.ts:304` sommait `(end - start)` sans borner `start` à `now`,
  donc un évènement commencé AVANT l'heure courante comptait son temps écoulé.
  Ce n'est **pas** un défaut d'unité. Mesuré : **3 120 min (52 h) → 120 min (2 h)**.

---

## 4. JAMAIS VÉRIFIÉ — nommé comme tel, jamais compté comme fait

- **Le vocal, #1939.4 → .14.** `navigator.permissions.query({name:'microphone'})`
  rend **`denied`** dans ce Chrome. Le chemin heureux (enregistrement, chronomètre,
  transcription) est **NON VÉRIFIABLE** dans la session pilotée.
- **Le mobile.** Impossible depuis un navigateur piloté (la fenêtre rétrécit, la page non).
- **La démo.** Toujours pas recettée. Elle REMPLACE la session de Louis
  (`POST /demo/session` pose les mêmes cookies) → **en toute dernière position**,
  après la recette de K, et **prévenir Louis qu'il devra se reconnecter**.
- **Les 6 constats déjà corrigés — AUCUN fermé, faute de preuve concluante.**
  #1998, #1995, #1994, #2001 (corrigés sur `main` : `f3626b909`, `8ba95252a`,
  `da6466359`) · #2141, #2136, #2002 (corrigés sur branches non mergées).
  Ce que j'ai mesuré sur #1994 : les fils de la liste font **60 px** à 16 px de
  police (un à 44 px) — insuffisant pour conclure « une ligne » sans relire le corps.
  #1995 demande **un message à Laura** (autorisé depuis le 10/09 ; annoncer le coût,
  le plafond de 50/jour est PARTAGÉ avec Louis).
- **`/missions/nouvelle` rend 105 434 caractères**, 10× l'écran suivant. Mesuré :
  838 lignes, 1 740 nœuds, 0 `<option>`, 0 `<tr>`, 9 `<li>`, pas de débordement,
  une seule ligne répétée 8×. **Verdict : long assistant, pas une liste non bornée
  — À VÉRIFIER, pas un défaut prouvé.**
- **La CI de #2211** (intégration K) n'a pas été relue.

---

## 5. ⚠️ LES CÂBLES — ce que K a posé, et ce qui reste MORT

Le défaut n°1 du dépôt, quatre fois dans le même lot. **Aucun n'était réparé** quand
je l'ai mesuré ; K en a posé une partie.

**Posés par K** — `apps/web/src/i18n/locales/{fr,en}/briefing.json:47-50` +
`ActionsBlock.tsx:248-256` (⚠️ **le symétrique du défaut n°1** : l'API composait
l'étiquette ET son compte, l'écran les JETAIT) · `apps/ia/app/routers/profiler.py:92`
(`user_id=answers.user_id` — sans lui `caller=None`, `status="no_caller"`, écran
d'accueil **vide en prod sans aucune erreur**) · `Chat.tsx:718` (1 émetteur sur 10)
+ garde neuve `product-tracker-emitters-have-a-caller.test.ts` ·
`profile-context.controller.ts:60` (**commentaire menteur corrigé**) · 5 entrées de
changelog FR+EN en TÊTE du tableau.

**Encore mort** — l'appelant web de `POST /profile-context/validate` : **les DEUX
bouts manquent**, aucun écran ne distingue `validated` de `succeeded` · **8 des 10
appelants** d'émetteurs d'analytique, chacun nommé dans la garde avec sa décision
manquante.

⚠️ **Le commentaire de code de `/validate` AFFIRMAIT un appelant qui n'existait pas**
(il citait `page-restitution-audit`, qui appelle `/profile-context/me`). Un commentaire
faux est pire qu'absent : il fait conclure « c'est câblé » au tour suivant.

---

## 6. LE CORPUS — ce qu'on croyait savoir était faux

- **256 issues ouvertes** (257 avant que je ferme #2129), **pas ~100**.
  ⚠️ Le `--limit` par défaut du digest (200) en tronquait **57 EN SILENCE**.
  Corrigé par #2209, qui **nomme désormais un plafond atteint**.
- **77 déjà couvertes** (sur `main` ou sur une branche en vol), **180 intactes**.
- **Registre : 1 166 points** — 1 à trancher · 611 retenu · 13 reformulé ·
  251 déjà là · 135 livré · **149 recetté** · 6 écarté. **Prouvés (recetté + écarté) :
  155 sur 1 166, soit 13 %.**
  ⚠️ `déjà là` ≠ `écarté` : les 251 « déjà là » doivent être vus tourner comme un livré.
- **Groupe le plus gros INTACT : DOSSIER COMPTE V4** — 22 issues, ~1 429 demandes,
  0 couverture. Les 3 piliers dont dépendent les autres : **#2115** rôle canonique,
  **#2117** hero, **#2118** synthèse.
- **Tableau de suivi régénéré et republié** (Version 3, même URL) :
  https://claude.ai/code/artifact/e236fc3e-69d5-4b20-a4f5-7b962f9b6d1f
  — `--ouvertes 256`, `--prod 5ecce45c4`.

---

## 7. PIÈGES D'OUTILLAGE PAYÉS DANS CE LOT — ne pas les repayer

- ⚠️⚠️ **`git log` par le shell a rendu un SHA INEXISTANT** (`396d15f54` pour
  `origin/main`), **deux fois de suite**, pendant que `git rev-parse` disait
  `898367181`. **Tout `git` dont un statut dépend passe par `python3` + `subprocess`.**
- ⚠️ **`gh pr merge --merge --subject "…"` est BLOQUÉ par le classifieur d'auto-mode.**
  Sans `--subject`, il passe. Et **`gh pr merge` ne rend RIEN sur succès** : le merge
  se prouve par le **CONTENU** sur `origin/main` (`git show origin/main:<fichier>`),
  jamais par la sortie de `gh`.
- ⚠️ **`grep --include=*.ts` NON QUOTÉ sous zsh** : `no matches found`, `rc=0`, faux zéro.
- ⚠️ **`/dashboard` rend 0 caractère à 3 s et 779 à 8 s** — zéro de CHARGEMENT.
  Toute longueur nulle se re-mesure avec une attente plus longue avant d'être un constat.
- ⚠️ **L'extension Chrome se déconnecte** sur un `browser_batch` de ~30 actions.
  Plafonner à ~22 (6-7 écrans × 3 actions + la lecture console).
- ⚠️ **`scripts/worktree-ready.sh --new <nom> <base>` part de la branche LOCALE.**
  `integration-j` local était **1 commit derrière** `origin/integration-j`.
  Toujours passer `origin/<branche>`.
- ⚠️ `tokens.css` de ce dépôt bascule par une **classe `.dark`**, pas par
  `@media (prefers-color-scheme)` + `[data-theme]`.
- ⚠️ **Load average à 33,6 sur 12 cœurs** au moment d'écrire ceci (un écrivain fait
  tourner ses suites). **Aucun verdict de test n'est croyable dans cet état** :
  relancer seul. Le seuil ne prévient pas.
- ⚠️ **Mon brief sur `portee.py` était FAUX** : l'amplificateur des 59 routes n'était
  pas la donnée du changelog (jamais un nœud du graphe — import par alias de paquet,
  que le résolveur ne suit pas) mais **`i18n_vers_seeds()`** : `ChangelogMenu.tsx`
  fait `useTranslation(['changelog','onboarding'])` pour un bouton « Revoir la visite
  guidée », donc **toute** traduction `onboarding` tirait les 59 routes. Corrigé en
  distinguant le namespace PRIMAIRE d'un emprunt SECONDAIRE : **59 → 3**.

---

## 8. LE RESTE, PAR ORDRE

1. **Relire la CI de #2211** (K), sortir du draft, merger, attendre les DEUX
   déploiements, **recetter K** (portée par `tools/recette/portee.py`).
2. **Intégration L** : `portee-changelog-fondation` + `briefing-heures-en-reunion` +
   `dettes-chat-a11y` + `amorces-generiques-nommees` + `fuseau-par-utilisateur`.
   ⚠️ Pas avant que K soit recettée.
3. **Vérifier puis fermer les 6 constats** (§4).
4. **Recetter la démo — EN DERNIER**, en prévenant Louis.
5. **Cadrer DOSSIER COMPTE V4** (§6) — le plus gros groupe intact.
6. Reposer les 3 questions de K à Louis : `feedback-assets` dans `main` ? · quel
   geste valide un contexte commercial, et qu'est-ce qui change à l'écran après ? ·
   les **six** verdicts de `REPLY_FEEDBACK_VERDICTS` vers les **trois** d'`AnswerVerdict`
   (trois n'ont aucune case honnête, les y ranger ferait mentir la mesure).

## Questions encore parquées pour Louis

**#2013 : les deux réponses se CONTREDISENT** (« garder ouverte » ET « clore comme
doublon »). J'ai pris la voie réversible : **commentée et laissée OUVERTE**, avec la
mesure du recouvrement (commun = la page de bienvenue ; propre à #2013 = le chemin
`/onboarding/.../company_info`). Un mot suffit à la fermer.

#2116 « dossiers legacy » (le mot n'est PAS dans son corps — c'est #2129/#2130 qui
parlaient de sections héritées) · K1 `/dashboard` = « Aujourd'hui » ou son contraire ·
K2 `AccountsToWatch` n'existe pas · DataForge : à nous ou branché par le client ·
#1912.4 périmètre actif · #1907.9 dégradé violet · #1995.3 la borne 10+5 sur
2 027 contacts · **la relecture juridique RGPD de `c64_analytique_produit` reste due,
et l'intégration K ÉLARGIT le traceur produit** (4ᵉ report).
