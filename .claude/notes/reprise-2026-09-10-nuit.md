# Reprise — retours bêta BellumAI, nuit du 10/09/2026

Tu reprends les retours bêta. Lance `/livraison:issues`. Lis ce fichier en entier
d'abord : il porte l'état exact, les huit décisions tranchées ce soir qu'on ne
repose pas, et les pièges payés aujourd'hui.

## 0. Les règles de machine (elles priment)

- **Tri sur le DIGEST, jamais sur les corps** :
  `python3 tools/issues/digest.py -o .claude/notes/digest-<date>.md`, puis lire CE
  fichier. Mesuré ce soir : 58 issues, 393 237 c de corps → 86 886 c, dont
  **53 141 c écrits par un humain (13 %)**.
- **`uptime` avant chaque vague.** Au-dessus de 25 sur 12 cœurs, on attend. Ne rien tuer.
- **3 écrivains maximum**, chacun démarré par `scripts/worktree-ready.sh --new <branche>`.
- **Une seule PR non recettée en production à la fois.**
- ⚠️ **La sortie du Bash est parfois RÉSUMÉE et remplace le résultat git** — c'est
  arrivé deux fois aujourd'hui (`git status --porcelain` a rendu la chaîne `ok`,
  `ls agent_docs/` a rendu du vide). **Passer par `python3 -c "import subprocess…"`
  pour tout résultat git ou tout code de sortie qui compte.**

## 1. Où on en est

| Lot | PR | État | Contenu |
| --- | --- | --- | --- |
| 9 | #1848 | **mergé `6eff5f2ee`**, recette **BLOCKED** | écran back-office Produit › Adoption (#1685, #1657.2) |
| 10 | #1850 | **mergé `3d0eecfa1`, déployé, RECETTÉ** | #1847 · #1818 · #1799 résidu · #1845 · #1849 + changelog + préambule worktree |

**Lot 10 : recette live faite, 58 routes sur 58.** Zéro écran cassé, zéro
débordement horizontal, zéro erreur console. CI : 20/20 jobs verts.

Ce qui a été vu tourner, geste par geste :

- **#1847** — modale de `/watchlist` : « Demander quoi faire » présent, portant la
  question du SIGNAL (« Que faire du signal « Une possible cession de Studio
  TF1 »… »). `body{pointer-events:none}` mesuré pendant l'ouverture — la bulle
  derrière était bien INERTE. Fermeture → `pointer-events:auto` et la bulle
  reprend la question de la page, sans rechargement. Tiroir de `/mailbox` :
  « Prépare-moi une réponse au fil « Re: contrat » » — **le geste n'existait
  nulle part avant**.
- **#1818.1 / .3** — modale de partenaire : « Capgemini · 3 sur 6 », flèches
  parcourues 3 → **6 sur 6**, flèche « suivante » **désactivée** au bout. La note
  de 30 mots a quitté les six cartes. Doublon Capgemini absent.
- **#1849** — `/settings/routines` : 36 interrupteurs, **0 sans nom** (était
  36/36). `/settings/notifications` : 10, 0 sans nom.
- **#1845** — `/rfp` : phrase d'intro absente du DOM.
- **#1799 résidu** — `/accounts/partners` : « Freelances et micro-agences » absent.

**CLOSES ce soir** : #1768 · #1823 · #1845 · #1847 · #1849.
**Commentées, encore ouvertes** : #1818 (il reste 1818.2, les logos) · #1799
(il reste « cliquer les ESN » sur la vue transverse `/accounts/partners`).

⚠️ **Deux écrans rendent COURT sans être cassés**, et il faut le savoir avant de
crier au bug : `/accounts/memoire-collective` (état vide NOMMÉ : « Aucun
croisement pour l'instant. C'est normal sur un espace neuf… ») et
`/pilotage/qualite` (quatre accordéons REPLIÉS). `/discover` passe de 26 à 2 667
caractères entre 9 s et 20 s.

**Lot 9 : recette BLOCKED, elle appartient à Louis.** `apps/dashboard-manager` est
derrière `DM_BASIC_AUTH` + TOTP ; mesuré : `GET /produit/adoption` → `401
Basic realm="BellumAI Backoffice"`. Les gestes et ce qu'il doit voir :
`.claude/notes/recette-backoffice-adoption-2026-09-10.md`. **#1685 et #1657 restent
OUVERTES** tant qu'il n'a pas rendu un verdict.

⚠️ **Avant d'ouvrir Chrome**, prouver le commit servi (le commit de l'IA est
IMBRIQUÉ dans celui de l'API — un `grep` du SHA matche le champ imbriqué et ment) :

```sh
curl -s https://api.bellum-ai.com/version | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('api', (d.get('commit') or '?')[:9], '| ia', ((d.get('ia') or {}).get('commit') or '?')[:9])"
```

## 2. Ce qui a été CLOS ce soir, avec sa preuve

- **#1768** — vu tourner : Laura nomme l'écran « Découvrir » **et pose un vrai lien
  `/discover`**, cliqué, il ouvre l'écran. Zéro erreur console.
- **#1823** — vu tourner : Laura propose la routine, la porte s'affiche
  (prévisualisation FIGÉE, « ce qui sera écrit », coût nommé), `Activer` cliqué,
  et **l'écriture a atterri** — `/settings/routines` porte « Contacts CRM à
  relancer · lundi · 10 h », interrupteur mesuré à `aria-checked="true"`.
- **#1799 (le rattrapage en base)** — exécuté en production :
  `805 lues · 6 corrigées · 681 inchangées · 118 archivées`, relecture
  `687 · 0 · 687 · 0`. 805 − 118 = 687 : l'écriture a atterri, le script est
  idempotent. L'issue **reste ouverte** pour ses autres points.

## 3. Les HUIT décisions de Louis — `.claude/notes/decisions-louis-2026-09-10-soir.md`

**Ne pas les reposer.** En une ligne chacune :

1. `market_company_alias` → **générateur déterministe à l'ingestion** (sigles, formes juridiques). La table est lue à 4 endroits de prod et contient 0 ligne.
2. **#1606.3 axe RELATION par hash → AUTORISÉ**, borné au contact déjà possédé par le workspace. ⚠️ relecture juridique RGPD toujours due.
3. **#1799 backfill → `--apply`** — fait, voir §2.
4. **Mémoire marché → les 23 ABSENTS, écran par écran** (Partenaires → Accès → Vue d'ensemble → Plan → Preuves).
5. **#1822 → Laura ÉCRIT un sous-ensemble nommé** (routines, préférences d'affichage, ton, langue) et **RENVOIE** pour le reste (facturation, OAuth, membres, offre).
6. **#1794 + #1787 → visite guidée SCRIPTÉE, zéro appel modèle.** Chantier à part entière, pas un point de lot court.
7. **#1819 → banc complet des 157 usages.** ⚠️ À chiffrer AVANT de câbler : 157 tours de modèle par exécution contre une CI médiane à 3 min 56 s. Mesurer le CHOIX D'OUTIL, pas la prose.
8. **#1613 / #1640 → réimporter le pack d'abord, puis recalibrer.** ⚠️ Vérifier SUR LE PACK qu'il porte plus d'effectifs, sinon on paie un réimport pour le même 6,9 %.

**Et un revirement, écrit dans `.claude/projet.md` §7** : **envoyer des messages à
Laura est AUTORISÉ** (permanent, espace de Louis). Deux règles restent : annoncer
le coût, et se souvenir que le plafond de 50/jour est **PARTAGÉ** avec lui.

## 4. Le motif de la journée : « le constat de ce matin est déjà périmé » — CINQ fois

C'est le défaut qui a coûté le plus cher aujourd'hui. **Re-mesurer contre
`origin/main` avant de croire une ligne de tracker, y compris la mienne.**

| Ce qui était écrit | Ce qui était vrai |
| --- | --- |
| `feat/analytique-produit-lecture` « jamais intégrée » | **déjà en production** (`90897cd95`), et `main` en a PLUS : `/pilotage/energie` (#1814) et le marqueur camelCase de GA-266 (#1681.5). La merger aurait RETIRÉ ces deux-là |
| #1789 et #1790 « restent à corriger » | **déjà livrés** (`a4d9546d9`, ancêtre de `main`) |
| #1768 et #1770 « à traiter » | **déjà corrigés et déployés**, avec diagnostic complet dans l'issue |
| #1847 « la modale ne gagne pas le magasin » | **elle gagnait.** Les vraies causes étaient la bulle INERTE sous Radix et l'emplacement unique du magasin |

## 5. Les pièges payés AUJOURD'HUI

1. ⚠️⚠️ **vitest lancé depuis la RACINE d'un worktree** ne charge ni l'alias `@` ni jsdom → « Failed to resolve import @/test-utils/… », qui **se lit comme un rouge de code**. `cd apps/web` + chemins relatifs. **Payé deux fois le même jour, par deux agents indépendants.** Corrigé dans le préambule de `scripts/worktree-ready.sh` (lot 10). Ne pas confondre avec `@bellum/…`, qui LUI se répare en relançant le script.
2. ⚠️ **`javascript_tool` rend `[BLOCKED: Cookie/query string data]`** dès qu'on retourne une URL avec query string — et les liens du chat en portent tous (`/chat?prompt=…`). Retourner `new URL(x.href).pathname`, jamais `href`.
3. ⚠️ **Les captures du widget de signalement sont des rendus SANS CSS** (DOM capturé, pas une photo). Elles donnent le contexte et l'élément pointé, **jamais la mise en page**. Pour trancher une ambiguïté de formulation, le **corps structuré de l'issue** (`gh issue view <n>`) porte le markup exact — il tranche là où la capture ne peut pas.
4. ⚠️ **Les assets de `feedback-assets` ne se téléchargent PAS au `curl`** : GitHub rend une page HTML de 267 ko qui a l'air d'un PNG. Passer par `gh api repos/…/contents/<chemin>?ref=feedback-assets` et décoder le base64. Vérifier les octets magiques `\x89PNG`.
5. ⚠️ **Cliquer avant que l'écran ait fini de rendre** : ces écrans rendent à 9 s et complètement à 18 s. Un `find` puis un clic sur `ref_N`, jamais des coordonnées prises sur une capture ancienne.
6. ⚠️ **`MEMORY.md` a redépassé sa limite de chargement** (24 641 o). Réglé en DÉPLAÇANT « Produit — état en vigueur » vers `produit-etat-index.md`. Il est à **22 097 o**. Quand ça déborde : on déplace d'un cran, on ne supprime pas.

## 6. Ce qui reste — 55 issues ouvertes

**Les bugs courts qui restent** : `#1770` (corrigé et déployé, non déclenchable
sans tuer ma session — les 4 phrases sont prouvées dans le bundle SERVI),
`#1793` `#1810` `#1820` `#1822` `#1846` `#1787` `#1794` `#1819` `#1417` `#1472`
`#1840` `#1676`.

⚠️ **`#1846` est une FONDATION** (harmonisation des paddings : `CustomerPageContent.tsx`
+ `container.tsx`, consommés par ~30 écrans). Elle ne part **jamais** en même temps
qu'un lot qui les consomme — producteur d'abord, consommateurs ensuite.

**Le gros bloc mémoire marché** : 27 issues ouvertes, inventoriées le 09/09 en
**112 points — 54 livrés · 19 partiels · 8 non prouvés · 23 absents · 3 périmés**.
Décision 4 : les **23 absents**, écran par écran. ⚠️ Chaque écran commence par
vérifier ce qui existe et **cherche l'APPELANT, pas la fonction** — deux cas déjà
connus : `evidence.diverging` existe en FR et EN et **aucun code ne l'appelle**
(#1624.4) ; `raw_analysis.addressability` **EST** écrit depuis #1579
(`phase1_research.py:1535`), seuls les axes PATH manquent.

**Le bloc back-office `/clients`** : 10 issues (`#1642` `#1655` `#1657` `#1676`
`#1681` `#1683` `#1684` `#1685` `#1687` `#1688`). Le lot 9 en a livré une part.

## 7. Le geste suivant, dans l'ordre

**Les lots 9 et 10 sont finis.** Il ne reste du lot 9 que la recette du
back-office, qui appartient à Louis (§1).

1. **`#1846` SEULE** — c'est une FONDATION (paddings de `CustomerPageContent.tsx`
   + `container.tsx`, consommés par ~30 écrans). Elle ne part jamais en même
   temps qu'un lot qui les consomme.
2. Puis un lot court : `#1793` `#1810` `#1820` `#1822` `#1417` `#1472`.
   ⚠️ `#1822` est tranché (décision 5) : Laura ÉCRIT un sous-ensemble nommé,
   RENVOIE pour le reste.
3. Puis le bloc **mémoire marché** — les 23 absents, écran par écran (décision 4).
4. **#1770** ne se clôt pas sans provoquer une session morte. Les quatre phrases
   sont prouvées dans le bundle SERVI ; le déclencheur manque, et il coûterait ma
   session. À faire par Louis en deux minutes, ou à laisser ouverte.

⚠️ **Deux questions posées à Louis dans les issues, en attente de réponse** :
la jointure logo de #1818.2 (croiser `account_partners.name` avec les comptes
déjà analysés du même espace), et le branchement de la modale sur la vue
transverse `/accounts/partners` (#1799).

## 8. Hygiène de la machine

`.claude/worktrees` pesait **83 Go sur 45 worktrees** au début de la session.
J'ai retiré les quatre miens (lot 9, lot 10, les trois écrivains) → **76 Go, 42
worktrees**. Les 38 restants viennent de sessions antérieures : certains portent
peut-être du travail non mergé, **je ne les touche pas**. À arbitrer.
