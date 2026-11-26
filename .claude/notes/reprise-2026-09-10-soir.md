Tu reprends les retours bêta de BellumAI. Lance `/livraison:issues`.

## 0. Les outils, et les règles de machine (elles priment)

Raisons et chiffres : `.claude/projet.md` §1, §4, §7.

- **Tri** : `python3 tools/issues/digest.py -o .claude/notes/digest-<date>.md`, puis lis CE fichier.
  Plus aucun `gh issue view` en série. Mesuré aujourd'hui : 62 issues, 419 692 c de corps → 89 547 c de
  digest, dont **53 863 c écrits par un humain (12 %)**. Le corps brut ne se rouvre que pour l'issue en diagnostic.
- **Machine** : `uptime` avant chaque vague. **Au-dessus de 25 sur 12 cœurs, on attend.** Ne tue rien.
  Un rouge rendu pendant la saturation **se relance seul** (`--maxWorkers=2`) avant d'être cru.
- **Écrivains : 3 maximum.** Chacun démarre par `scripts/worktree-ready.sh --new <branche>` et reçoit le
  préambule qu'il imprime : tests **par FICHIER** avec `--maxWorkers=2`, jamais une suite de dossier,
  jamais `turbo build` ni `pnpm install`. `Failed to resolve import @bellum/…` = relancer le script.
- **Lots** : **une seule PR non recettée en production à la fois.**

## 1. Où on en est — production sur `2721c8482`

**Deux lots livrés, déployés et recettés aujourd'hui.**

| Lot | PR | SHA prod | Contenu |
| --- | --- | --- | --- |
| 7 | #1843 | `79cbee1ec` | #1816 · #1799 (4ᵉ tour) · #1840 · #1676.1 |
| 8 | #1844 | `2721c8482` | #1836 · #1839 · #1797 · #1799 (producteur Python) |

⚠️ **Vérifier le déploiement AVANT d'ouvrir Chrome**, en parsant le JSON (le commit de l'IA est
**imbriqué** dans celui de l'API — un `grep` du SHA matche le champ imbriqué et ment) :

```sh
curl -s https://api.bellum-ai.com/version | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('api', (d.get('commit') or '?')[:9], '| ia', ((d.get('ia') or {}).get('commit') or '?')[:9])"
```

Aujourd'hui l'IA est passée **avant** l'API sur le lot 8 (fenêtre de ~2 min). C'est normal quand le lot
touche `apps/ia` ; ça devient un symptôme de **healthcheck qui refuse l'API** si ça dure.

## 2. Ce qui a été CLOS, avec sa preuve

`#1814` `#1816` `#1817` `#1792` `#1836` `#1839` `#1797` — chacune vue tourner en production, chacune
avec un commentaire qui dit à Louis ce qu'il verra. Les mesures qui comptent :

- entête de compte **255 px** (cible 270, était 314) · **un seul** menu « … », nommé « Plus d'actions » ;
- `/accounts/partners` : **50 entrées dont 34 n'étaient pas des entreprises → 2 suspects, dont un vrai
  nom**. Le doublon `Crédit Agricole Technologies & Services` / `… et Services` a disparu ;
- `/pilotage` : « Je n'ai pas le droit de regarder ton CRM. **Reconnecte cet outil** » + lien Intégrations,
  au lieu d'un 503 nu ;
- vivier : « Disponibles maintenant · 0 · **Calculé sur 10 fiches du vivier sur 30 — 33 %.** Hors du
  calcul : 20 fiches sans affectation enregistrée » ;
- `/watchlist` : liste seule à l'arrivée, modale au clic, flèches parcourues **2 → 8 sur 27** en vrai.

**Balayage complet : 58 routes, zéro écran cassé, zéro débordement horizontal, zéro erreur console.**

## 3. Ce qui reste OUVERT parce que partiellement livré — commenté, à ne pas re-diagnostiquer

Chacune porte déjà un commentaire qui découpe le livré / le pas-livré. **Lis le commentaire avant de coder.**

| Issue | Livré | Reste |
| --- | --- | --- |
| `#1799` | dedup + faux noms | « pouvoir cliquer, interagir avec les ESN » · résidu **`Freelances et micro-agences`**, qui n'est pas une société |
| `#1818` | doublon Capgemini | **modale** · **logos des partenaires** · « moins de blabla en gris » (la même phrase de 30 mots se répète sur les 6 cartes) |
| `#1794` | relance depuis Réglages › Préférences › Démarrage | l'animation guidée (= #1787) · le lien avec le changelog |
| `#1612` / `#1638` | le point `.1` de chaque | la lecture « compatibilité technique observée » **non recettable** : le compte de l'issue (`acb96868-…`) **n'existe plus** |
| `#1624` | `.4` et `.10` | les trois lectures séparées côte à côte ; le bloc de divergence ne s'affiche que s'il y a divergence — aucun compte de test n'en avait |
| `#1820` `#1822` `#1823` | outils Laura déclarés, `GET /routines` répond 200 | **non recettables sans envoyer un message à Laura, ce que le protocole interdit.** `#1822` couvre **1 écran sur ~15** |
| `#1840` `#1676` | le correctif est en prod | **derrière le mur opérateur** (`403` sur `/backoffice/address`) — à valider par Louis. `#1676` : **6 des 8 alertes** restent à câbler |

## 4. Issue NEUVE ouverte aujourd'hui — `#1847`, à traiter tôt

`AskLaura` fait `if (isActive && !isMobile) return null` (#1812, décision de Louis : le lien dépose sa
question, la bulle la porte). **Dans une modale, la bulle porte la question de la PAGE, pas celle du
SIGNAL** — le geste par signal se perd. Mesuré sur 6 signaux consécutifs.

⚠️ `AskLaura` est appelé depuis **une trentaine d'écrans**. **Toute instance rendue dans une surcouche
(modale, tiroir, panneau) est probablement dans le même cas.** C'est « l'appelant neutralise un
composant juste » : le composant est correct, ses tests passent, la composition perd le geste.

## 5. Deux branches PRÊTES, jamais intégrées — le lot 9 commence par là

Elles sont vérifiées, commitées, et attendent depuis la session d'hier :

- `feat/analytique-produit-lecture` (`da83c03d6`) — 15 fichiers, la lecture du flux comportemental
  (catalogue d'écrans, seuil de 5 sessions, trois gardes). ⚠️ **147 commits de retard** : rebaser.
- `feat/ce-quon-paie-et-dont-on-ne-se-sert-pas` (`7d2521aaf`) — 7 fichiers, écran Adoption du back-office.
  8 commits de retard, `apps/dashboard-manager` seul, donc isolé.

⚠️ **Ne pas repartir de `fix/le-producteur-desn-filtre-a-la-source`** : ses commits IA sont déjà dans le
lot 8 (cherry-pick). La branche porte en plus un merge d'un `feat/lot7` **abandonné** — son
`diff origin/main...` annonce 178 fichiers qui ne sont pas à elle.

## 6. Ce qui reste à trancher par Louis — ne pas coder avant

- **`#1817` la fraction** : l'entête fait 255 px, soit **32 %** d'une fenêtre de 805 px, pas le quart
  demandé. La cible retenue était une valeur absolue (270 px). Question posée dans le commentaire.
- **`#1822`** : « tous les paramètres gérés depuis Laura » **ou** « Laura redirige vers eux » — la phrase
  dit les deux, et ils ne coûtent pas la même chose. Quinze écrans à répartir entre écriture et renvoi.
- **`#1796` Territoire → Découvrir** : ⚠️ **fait**, Territoire est un onglet de `/discover` (vérifié en prod).
- **`#1799`** : le script de rattrapage des faux noms déjà en base existe **en simulation, jamais exécuté** :
  `apps/api/src/modules/partner-pipeline/scripts/backfill-esn-partner-names.ts`.
- **`#1417.1`/`.2`** refus D79/D80 · **`#1616.2`** écarté (60 067 lignes en prod) · **`#1472` `#1639` `#1655`**
  non rouverts. Ne pas les reposer.

## 7. Le gros bloc qui n'a pas bougé — la mémoire marché

Vingt-deux issues, toutes `[beta:metier]`, la plupart marquées **P0** par Louis, déposées le 06/09 :
`#1590` `#1591` `#1596` `#1603` `#1606` `#1607` `#1611` `#1613` `#1615` `#1616` `#1617` `#1619` `#1622`
`#1625` `#1626` `#1627` `#1628` `#1629` `#1630` `#1631` `#1634` `#1636` `#1640`.

Ce sont des **specs**, pas des constats : 12 à 38 points chacune, rédigées à l'impératif. Le §3 bis du
skill s'applique — découper, extraire les garde-fous que la spec porte elle-même, répondre dans l'issue
en trois listes **avant** de coder. Elles partagent une architecture ; les traiter une par une produira
vingt-deux fois le même parcours de code.

Les bugs courts qui restent, eux, se prennent tout de suite : `#1768` `#1770` `#1789` `#1790` `#1793`
`#1810` `#1845` `#1846` `#1847`.

## 8. Les pièges payés AUJOURD'HUI — ne les repaie pas

1. ⚠️⚠️ **`document.querySelector('[role="dialog"]')` attrape un POPOVER avant la modale.** Sur
   `/watchlist`, un popover `text-popover-foreground` en `data-state="closed"` précède la vraie modale
   dans le DOM : j'ai conclu deux fois que le lot 8 n'était pas déployé. **Énumérer toutes les
   `[role="dialog"]` et filtrer sur `data-state === "open"`.**
2. ⚠️ **Un `ref` de `find` devient périmé après une navigation.** Un `computer left_click` sur `ref_93`
   a cliqué autre chose, et j'en ai déduit un onglet mort. **Re-cibler dans le même appel que le clic.**
3. ⚠️ **Le slug d'URL d'un onglet n'est pas son libellé** : `?tab=partners`, pas `?tab=partenaires` —
   un slug inconnu retombe silencieusement sur l'onglet par défaut, ce qui **ressemble** à une régression.
4. ⚠️ **`echo "rc=$?"` derrière un `tail` rend le code de `tail`** (encore). Il a rendu `API_TT_RC=` vide
   sur un typecheck. Passer par `python3 -c "import subprocess; ..."` pour tout code de sortie qui compte.
5. ⚠️ **La sortie du Bash est parfois RÉSUMÉE et remplace le résultat git.** `git log` a rendu un HEAD
   faux et `ls .claude` une sortie vide, au tout début de la session. Même remède.
6. ⚠️ **Le hook `lint-staged` lance eslint depuis la RACINE**, dont la config ne déclare pas le plugin
   `react-hooks` : un `// eslint-disable-next-line react-hooks/exhaustive-deps` **préexistant** y devient
   une erreur. **5 fichiers d'`apps/web` sont incommittables sans `--no-verify`.** À corriger à la racine —
   et attention, un commit passé en `--no-verify` saute aussi prettier (`dialog.tsx` est arrivé non formaté).
7. ⚠️ **GA-71 était BORGNE** — sa détection lisait le fichier **brut**, donc un docblock citant
   `<Completeness>` suffisait à déclarer un écran conforme. C'est la **deuxième** garde de ce dépôt à lire
   un commentaire pour du code. Corrigée par `stripComments` + témoin négatif.
8. **Les écrans LENTS ne sont pas cassés** : `/accounts`, `/contacts`, `/discover`, `/briefing`,
   `/pilotage/qualite` rendent `len: 26` à 9 s et rendent complètement à 18 s. **Attendre, re-mesurer,
   et ne croire un zéro qu'à la seconde lecture.**
9. **`browser_batch` expire** au-delà de ~40 s d'attentes cumulées : **3 routes par lot maximum**.
10. **Vider le cache IndexedDB `bellum-web-cache`** avant de conclure qu'un déploiement n'est pas arrivé —
    et vérifier le marqueur dans le bundle servi (`fetch` du `<script src>`, chercher une chaîne du lot).

## 9. La méthode qui a marché

Trois écrivains en worktrees isolés, briefés avec la famille à chercher et les pièges du dépôt.
**Les trois sont tombés sur une panne réseau de l'API en cours de route ; aucun n'a perdu son travail**
— les fichiers étaient sur le disque, non commités, et un `SendMessage` de reprise nommant précisément
ce qui restait a suffi. Ne jamais relancer un agent à zéro sans avoir regardé son worktree.

Et **chaque rapport d'agent a été vérifié** : commit réel, `diff --stat`, puis la mesure en production.
Deux affirmations d'agent étaient fausses — le `z-50` de `Dialog` était déjà corrigé, et « Demander quoi
faire » n'est pas dans la modale. C'est la recette live qui les a trouvées, pas la CI.
