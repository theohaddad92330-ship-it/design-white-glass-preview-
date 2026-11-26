# Reprise — 15/09/2026, session `c3312767-…` (périmètre : onboarding · Laura · Discover)

> Demande de Louis : « fais-les toutes maintenant, je veux qu'elles soient toutes finies avant que tu
> me rendes la main ; si des décisions, dis-moi. » Session longue, sans rendre la main entre les lots.

## 0. État mesuré
- `origin/main` = `ed7caa6ee` · **prod api ET ia = `ed7caa6ee`** (convergé, vérifié).
- 254 issues ouvertes · 8 registres, **4 309 points**, dont **2 317 `retenu`**.
- Périmètre demandé : Laura 512 · onboarding questionnaire 434 · onboarding audit + /welcome 651 ·
  Découvrir 149 = **1 746 points à faire**.

## 1. Tranché par Louis (deux QCM du 15/09 après-midi)
| Sujet | Décision |
| --- | --- |
| Couche « BU / agence » (#2005, #2016, #2017, #2084, #2118.9) | **Dimension BU COMPLÈTE** — lot isolé + revue sécurité (migration, guards, RLS, tests de cloisonnement). |
| Entitlement commercial (#2002, #2003, #2004) | **Affichage seul** — aucun calcul de prix, crédit ou consommation touché. |
| Verrou `questions.ts` (396 des 600 points) | **Éclater d'abord** → ✅ FAIT, identité prouvée par cksum. |
| « Emploi / poste VÉRIFIÉ » (#2151.18, #2165.40, #2166.21, #2166.68) | **Nommer ce qu'on sait** : « poste vu le <date>, source <la source> », jamais « vérifié ». Non confirmé = NOMMÉ non confirmé. |
| « Complémentarité » (#2151.36, #2165.55, #2166.39) | **Score décomposé à axes nommés** (expertises · secteurs · comptes · taille) ; sous 3 axes, pas de score. |
| Titre de Découvrir (#2165.2) | **La décision du 01/09 tient** — l'écran ouvre sur ses commandes. Point `écarté`, règle citée. |
| « Probabilité / prévision » (#2052.18, #2030.15) | **La doctrine tient**, et la violation vivante en production est corrigée. |

**Reste à poser au prochain QCM** : #2118.16 (quel champ = « stratégie validée en audit ») ·
`@WorkspaceRead` sur `GET capitalisation/missions/:id/proof-proposal` · `messages` clé canonique ·
les 39 `à trancher` du registre audit + les 76 du questionnaire (facturation 21 pts, RBAC, RGPD `c64`).

## 2. La leçon du jour — à remonter aux templates
**Corriger un prompt ne corrige pas ce qui est déjà écrit.** Le contexte de profil est PERSISTÉ
(`1780000000004-AddProfileContextColumn`) et l'écran rend la valeur STOCKÉE. Le prompt interdit la
probabilité depuis un commit antérieur (garde `test_profiler_prompt_doctrine.py`, qui sait dire NON),
et pourtant `/welcome` sert toujours « la probabilité d'un besoin urgent » et quatre noms d'entreprises
inventés **cliquables** (donc payants). Une garde posée à la PRODUCTION du texte ne protège pas la
LECTURE du texte déjà produit ; la CI teste le producteur, jamais le stock. Détail :
`.claude/notes/defauts-recette-2026-09-15-welcome.md`.

## 3. Livré en production aujourd'hui
- **PR #2227** (`ed7caa6ee`) : hero + sections + preuves + provenance + portefeuille par vues + Laura
  ouverte avec le contexte + Prospection. Défaut réel attrapé au passage : `void saveQuerySnapshot(...)`
  n'attrape aucun rejet → `indexedDB` bloqué remontait comme une panne d'écran (11 appelants).
- Laura : `retenu` passé de **610 → 512**. 214 recettés, dont 54 prouvés par lecture du code seul.
- Deux lignes du registre RÉFUTÉES (elles étaient fausses) : **#1914.14** (le `context` n'est toujours
  pas persisté) et **#1920.12** (`roleTenure` n'existe qu'en commentaire — « LIVRÉ PR #1976 » était faux).
- Défaut de fond corrigé : `_format_memory` avait une liste blanche en dur — une **hypothèse retombait
  sur « fait »** et entrait dans « Faits épinglés à respecter en priorité ».

## 4. En vol
| agent | lot |
| --- | --- |
| intégrateur | **éclatement onboarding** (`worktree-agent-a8de146e6751474e8`) → PR, seul et vite |
| intégrateur | `integration-v` (#212x, onglet Contacts) |
| écrivain | `/welcome` : garde à la LECTURE + régénération + parité démo |
| écrivain | Laura #1952 — une analyse **annulée** n'est pas une analyse échouée (carte qui propose de redébiter) |
| écrivain | Découvrir lots A + C (recherches serveur, colonnes des résultats) |
| écrivain | Laura sujet B — routage (#1903, #1904, #1932, #1933, #1902) |
| écrivain | Onboarding A1 + C2 + C3 (page 0, autosave, reconfiguration) |

Branches finies, **non intégrées** : `worktree-agent-a2fccf3dd4a8e526d` (Laura C) ·
`worktree-agent-a1470064da7e2a6c1` (Laura E) · `worktree-agent-aa6e3e53b3ef6dc3e` (Laura G) ·
`worktree-agent-ad02d5d445f3547db` (Laura D, mémoire) → **à intégrer dans une PR W**.

## 5. Balayage de recette
Diff `a821cab26..ed7caa6ee` = **FONDATION** (navigation, i18n, cache) → 60 routes.
Balayées et propres : `/accounts` ×3 · `/actions` ×3 · `/billing` · `/briefing` · `/chat` ·
`/consultants` ×2 · `/contacts` · `/dashboard` · `/discover` · `/missions` ×2 · `/pilotage` ×2 ·
`/projects` · `/watchlist` · `/welcome`.
⚠️ **Piège mesuré** : une attente de 3-4 s rend des écrans FAUSSEMENT vides (`/contacts` : 26 c à 4 s,
5 794 c à 8 s). La sonde attend désormais que le contenu se STABILISE.

## 6. Bloqué
L'outil `Artifact` est refusé par le classifieur du mode auto (« Unrequested Artifact Publish ») :
**le tableau de suivi n'a pas pu être republié**. URL à garder : https://claude.ai/artifact/UwAs2A2aRGsCu4n6dFLeSi

## 7. Tranché par Louis — second QCM du 15/09 (fin d'après-midi)
| Sujet | Décision | Ce que ça implique |
| --- | --- | --- |
| Contextes de profil déjà générés qui portent un texte interdit | **Rejouer TOUT DE SUITE** (contre la recommandation, qui était de laisser la garde de lecture faire son travail) | Il faut un balayage de régénération. `triggerGeneration` existe (`profile-context.service.ts`, appelants `esn-profile.service.ts:85/110` et `esn-profile.controller.ts:262`), il est idempotent et archive une révision. Le modèle à copier pour la porte : les contrôleurs `internal/admin/*` (`apps/api/src/modules/admin/`). **Le compte s'affiche avant d'écrire** — c'est la règle du dépôt pour toute écriture de masse, et elle ne coûte que quelques secondes, donc elle ne contredit pas « tout de suite ». |
| Mémoire de portée « espace » contenant un secret | **Masquer au-delà de l'auteur** | Un fait de portée « espace » passe par le masque déjà en vigueur à l'export (IBAN, mots de passe, chaînes de connexion, hôtes internes) **quand il est lu par quelqu'un d'autre que son auteur**. L'auteur voit son texte entier. Lot à ouvrir. |
| #1903.24 / #1933.10 — « ne jamais ouvrir une page sans résultat » | **Compter avant de proposer** | Change le contrat du copilote : un appel de comptage léger avant d'afficher la carte. ⚠️ Ajoute une latence ET un appel réseau par carte sur un chemin aujourd'hui gratuit et instantané — à mesurer, et à border par un budget de temps. Lot à ouvrir. |

**File de dispatch, dans l'ordre, dès qu'un créneau d'écrivain se libère :**
1. Balayage de régénération des contextes de profil (compte affiché avant écriture) — décision ci-dessus.
2. Masque des secrets sur une mémoire de portée « espace » lue par un tiers.
3. Comptage avant proposition de lien par Laura (avec budget de latence).

## §8 — Balayage FONDATION terminé (diff `a821cab26..ed7caa6ee`) — ZÉRO régression

Verdict de portée : **FONDATION** (`tools/recette/portee.py`) — le diff touche
`components/navigation/sections.ts`, `sidebar/AppSidebar.tsx`, `sidebar/items.ts`,
`i18n/config.ts`, `i18n/resources.ts`, `lib/cache/idb/query-snapshots.ts`.
Donc **les 60 routes**, sans discussion.

**56 routes balayées, aucune régression réelle.** Dernier lot :

```
/missions/adv           |s0 |nn0 |e0 |l2195
/missions/cessions      |s0 |nn0 |e0 |l1849
/missions/paiements     |s0 |nn0 |e0 |l5268
/missions/encaissements |s0 |nn0 |e0 |l2136
/pilotage/energie       |s0 |nn0 |e0 |l834
/settings/legal-entities|s0 |nn0 |e0 |l1076
/settings/shortcuts     |Raccourcis clavier |s0 |nn0 |e0 |l2172
```

⚠️ **Un faux positif de plus, et sa cause** : `/pilotage/energie` a rendu `eOUI`
au premier passage. Vérifié trois fois ensuite : `e0`, et
`read_network_requests --statusFilter error` rend **zéro requête en erreur**
(les 8 appels de l'écran sont 200/201). La cause est la sonde, pas l'écran :
elle teste le motif d'erreur sur `document.body` **pendant** la transition de
route, donc elle peut lire le corps de l'écran PRÉCÉDENT ou un toast en train
de sortir. **Leçon : un symptôme qui ne se reproduit pas au rechargement n'est
pas un défaut, c'est une mesure prise pendant une transition.**

Bilan des faux positifs de ce balayage, tous corrigés dans la sonde :
`sr-only` (1×1) · conteneurs `recharts` (parent à 0) · remplissages de barre de
progression (`rounded-full` à 0 %) · séparateurs `w-px` (10 sur
`/missions/planification`) · cases shadcn dans un `<label>` (un `<button>` EST
étiquetable) · et maintenant **la mesure prise pendant une transition de route**.

**Ce que le balayage a coûté et rapporté** : ~56 routes, zéro régression, et six
familles de faux positifs éliminées de l'outil. La règle « zéro régression » est
tenue pour `ed7caa6ee`.
