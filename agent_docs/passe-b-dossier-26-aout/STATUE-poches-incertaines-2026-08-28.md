# Les trois dernières poches — et la preuve n°2 se ferme

> **45 lignes statuées, 0 sans statut, 0 « à vérifier ».**
> Ce sont les « rapprochements incertains » qui avaient échappé à TOUS les filtres.

## 1. Pourquoi elles étaient invisibles

Chaque passe de statuage cherchait `^\| *[0-9]+` ou `^\| *X-nn`. Ces trois poches
portent des identifiants d'une **autre forme** :

| Fichier                        | Identifiants  | Nombre | Pourquoi il échappait                     |
| ------------------------------ | ------------- | -----: | ----------------------------------------- |
| `passeB-groupe-B.md` l.157-171 | `A` → `O`     | **15** | une **lettre nue** : ni chiffre, ni tiret |
| `passeB-groupe-A.md` l.163-179 | `U1` → `U17`  | **17** | pas de tiret                              |
| `passeB-groupe-F.md` l.241-253 | `U01` → `U13` | **13** | pas de tiret                              |

Les deux tables reconstruites les déclaraient « **HORS périmètre, non statués ici** » — en toutes
lettres, et personne n'était revenu les chercher.

⚠️ **Un balayage exhaustif de la première colonne des sept fichiers ne rend AUCUNE autre anomalie.**
C'est cette phrase, et elle seule, qui autorise à considérer la preuve n°2 close.

## 2. Les décomptes

|                        | lignes |  LIVRÉ | ABSENT | REFUSÉ | NON PORTEUR | DOUBLON | À VÉRIFIER |
| ---------------------- | -----: | -----: | -----: | -----: | ----------: | ------: | ---------: |
| `A`→`O` (groupe B)     |     15 |      5 |      7 |      1 |           2 |       0 |      **0** |
| `U1`→`U17` (groupe A)  |     17 |     10 |      4 |      1 |           2 |       0 |      **0** |
| `U01`→`U13` (groupe F) |     13 |      8 |      2 |      0 |           3 |       0 |      **0** |
| **Total**              | **45** | **23** | **13** |  **2** |       **7** |       0 |      **0** |

Backlog fantôme : **16 %** — dans la fourchette mesurée sur les autres groupes (3 % à 29 %).
**Zéro `NON PROUVÉ`** : chacune des 23 `LIVRÉ` remonte à un composant monté ou à une route citée.

## 3. Deux arbitrages que ces poches ont tranchés

**Les factures entrantes ne sont PAS refusées.** J'avais posé l'hypothèse inverse dans le brief, et
c'est faux : **D8 · 26/08** dit « oui — lire une facture fournisseur n'est pas en émettre une ».
Le refus `c17_facturation` porte sur l'**ÉMISSION** et le **décaissement**, pas sur la lecture d'un
état. `M` est donc un **vrai trou produit**, pas un refus — et son énumération d'états (attendue ·
reçue · manquante) est ce qui deviendra la contrainte SQL, donc à poser AVANT le code (GA-12).

**Payer un sous-traitant, en revanche, EST refusé** — `c17_facturation` (« aucune comptabilité,
aucune paie ») + `c29_affacturage` (« Bellum ne touche jamais au FINANCEMENT d'une créance ») +
l'invariant `stops_at_invoice_readiness`. Tenu par zéro ligne de code de décaissement.

## 4. ⚠️ Un défaut signalé, MESURÉ FAUX — et il ne faut pas le « corriger »

Un agent a signalé une **fuite de donnée financière** : le TJM du vivier s'affiche sans garde
(`ConsultantsPage.tsx:313`) alors que le coût juste à côté en porte une, et le contrat déclare `tjm`
non optionnel.

**Vérifié, et c'est un DESIGN, pas une fuite.** `TalentRatesTab.tsx:35` fait exactement la même
chose : `talent.tjm` sans garde, et `min_tjm_cents` / `cost_rate_cents` / `purchase_tjm_cents`
derrière `finance_visible`. **Deux écrans indépendants, la même distinction** :

- le **TJM cible** est le prix de VENTE — ce dont un recruteur a besoin pour positionner ;
- le **plancher**, le **coût chargé** et le **tarif d'achat** sont les entrées de la MARGE, et
  celles-là exigent `finance:read`.

Le contrat le dit d'ailleurs lui-même : « Le plancher et le coût, en centimes. **ABSENTS sans
`finance:read`** » — il ne parle pas du TJM.

⇒ **Ne pas « réparer » ceci.** Gater le TJM cible priverait les recruteurs du seul chiffre qui leur
permet de positionner quelqu'un. La ligne de la source qui a induit l'agent en erreur (« le tarif ne
sort qu'avec le droit finance ») est ambiguë : « le tarif » y désigne les entrées de marge.

**La leçon, qui est celle du skill** : un rapport d'agent est une AFFIRMATION. Celui-ci était
argumenté, précis, avec ses `fichier:ligne` — et faux, parce qu'il avait déduit une règle d'une
phrase de source au lieu de vérifier ce que le code fait ailleurs.

## 5. Ce que ces poches ont trouvé en plus

- **Trois refus tenus par un ZÉRO, pas par un test.** « Le rapprochement coûte 0 crédit » repose sur
  l'absence du mot `credit` dans le module de matching ; rien n'empêche qu'on en ajoute un demain.
  Même forme que les trois cas déjà relevés au §3.4 du statuage C-D.
- **Deux refus tenus de fait mais absents de la doctrine** — « Positionner depuis l'assistant » n'est
  écrit ni au registre ni dans `CLAUDE.md`. Il tient parce que personne n'a écrit l'outil.
- **La porte du changement de poste ne remonte pas au cockpit** : `jobChangeOpening` crée bien
  l'opportunité, mais le bloc « depuis ma dernière visite » ne la porte pas.

## 6. ⚠️ Un piège d'outillage NEUF

Dans ce bac à sable, **une redirection `> fichier` vers le scratchpad rend `rc=0` et produit un
fichier VIDE**. Un agent a obtenu `rc=0` + `wc -l = 0` sur deux fichiers pleins — un faux zéro
_silencieux_, causé par **la redirection elle-même**.

⇒ **Le conseil « redirige vers un fichier d'abord, lis `$?` » NE MARCHE PAS ici.** Ce qui marche :
`git grep -c` (le compte et le `rc` dans un seul maillon) et `awk` sur chemins absolus, sortie lue
directement.
