> # ⚠️ RE-VÉRIFIÉ LE 27/08/2026 AU SOIR — CE FICHIER EST PARTIELLEMENT PÉRIMÉ
>
> **Une confrontation au code est DATÉE.** Deux agents de re-vérification ont repris ces statuts
> contre `main` le 27/08 au soir, `grep -rn` exigé partout. Résultat : **sur 16 items « NON PROUVÉ »
> re-confrontés, 8 ne le sont plus** — branchés depuis, ou volontairement retirés.
>
> **Ce fichier reste la trace de ce qui a été vu le 27/08 au matin.** Il ne se lit plus comme un
> état du produit. L'état à jour, item par item avec sa preuve, est dans le journal
> [`../dossier-26-aout-2026.md`](../dossier-26-aout-2026.md) §8, entrées du 27/08 au soir.
>
> ⚠️ **Les lignes marquées `[PÉRIMÉ 27/08]` ci-dessous décrivent un état qui n'existe plus.**
> Certaines commandent une action devenue NUISIBLE. Ne pas les suivre.

# La passe B du dossier du 26 août — la matière, pas seulement les comptes

**Pourquoi ce dossier existe.** Le §10.2 de [`../dossier-26-aout-2026.md`](../dossier-26-aout-2026.md)
annonce « 1 916 exigences non mentionnées, 572 statuées, dont **290 ABSENT** et **59 NON PROUVÉ** ».
Ces phrases étaient des **comptes sans liste** : la matière vivait dans le scratchpad d'une session
(`/private/tmp/…`) et dans des transcriptions d'agents sous `~/.claude/projects/`, deux endroits
qu'un nettoyage de disque emporte sans prévenir.

Un total est un argument, pas un inventaire. Tant que la liste n'est pas dans le dépôt, la preuve n°2
du certificat d'épuisement ne peut pas être tenue — et personne ne peut vérifier le chiffre.

## Ce que contient ce dossier

| Fichier                     | Ce que c'est                                         | Confronté au code ?    |
| --------------------------- | ---------------------------------------------------- | ---------------------- |
| `passeB-groupe-A.md`        | PDF-01 → 03                                          | ❌ non — matière brute |
| `passeB-groupe-B.md`        | PDF-04 → 06                                          | ❌ non                 |
| `passeB-groupe-C.md`        | PDF-07 → 09                                          | ❌ non                 |
| `passeB-groupe-D.md`        | PDF-10 → 13                                          | ❌ non                 |
| `passeB-groupe-E.md`        | PDF-14 → 17                                          | ❌ non                 |
| `passeB-groupe-F.md`        | PDF-18 → 22 + textes                                 | ❌ non                 |
| `passeB-groupe-G-images.md` | les 17 images cibles                                 | ❌ non                 |
| `VERIFIE-groupes-A-F.md`    | **299 entrées statuées** avec preuve `fichier:ligne` | ✅ **oui**             |

Les sept `passeB-groupe-*.md` sont la **consigne inversée** : « cherche ce que la source demande et que
le tracker ne mentionne nulle part ». Ils disent donc « absent du TRACKER », jamais « absent du PRODUIT ».
Confondre les deux fabriquerait un backlog fantôme — c'est précisément ce que la vérification a évité :
**30 % de ce que la passe classait « non mentionné » était déjà livré.**

## Ce qui est vérifié — les 572 le sont désormais toutes

Les tables B+C et D+E avaient disparu ; elles ont été **reconstruites le 27/08 au soir**, en
refaisant la confrontation au code depuis la matière brute (et non en recopiant un jugement).

| Fichier                      | Portée            | Entrées statuées | dont `ABSENT` | dont `NON PROUVÉ` |
| ---------------------------- | ----------------- | ---------------: | ------------: | ----------------: |
| `VERIFIE-groupes-A-F.md`     | PDF-01→03 + 18→22 |              299 |           199 |                13 |
| `RECONSTRUIT-groupes-B-C.md` | PDF-04→09         |              174 |            86 |                 6 |
| `RECONSTRUIT-groupes-D-E.md` | PDF-10→17         |          **198** |            54 |                11 |

⚠️ **Deux constats que la reconstruction a produits, et qui comptent plus que les tables :**

**1. La table D+E perdue disait « 99 statuées ». Les fichiers en contiennent 198.** Elle
s'arrêtait à la moitié du groupe — `D-99` est la dernière entrée de PDF-12, ce qui n'est
probablement pas une coïncidence. **Le certificat n'aurait donc jamais pu être signé sur elle** :
la moitié du groupe n'avait aucun statut, et son `À VÉRIFIER: 0` sur 99 items était le signe
d'une table qui avait arrondi, pas d'une table exhaustive.

**2. La table B+C, elle, avait le bon périmètre** — 99 + 75 = 174, à l'item près. Ses COMPTES
diffèrent de la reconstruction (45→71 `LIVRÉ`, 31→6 `NON PROUVÉ`, 33→9 `À VÉRIFIER`) et **c'est
le résultat attendu** : une confrontation au code est DATÉE. Reproduire les chiffres du 27/08
aurait prouvé qu'on avait recopié le jugement au lieu de refaire le travail. Ce qui doit
correspondre est le dénominateur, et il correspond.

**Le piège des 30 % est confirmé, deux fois.** Sur B+C, 26 items sur 174 étaient « absents du
tracker » et bien présents dans le produit. Sur D+E, **106 des 198** sont livrées, dont 47 avec
une garde d'architecture dédiée. « Absent du tracker » et « absent du produit » restent deux
choses différentes, et les confondre fabriquerait un backlog fantôme.

## Les dettes ouvertes que ces tables nomment

- **26 `NON PROUVÉ`** au total — du code juste, testé, sans appelant. Le meilleur rapport
  valeur/effort du dossier s'y trouve : le **document d'explication de classement**
  (items 53-54-55) est écrit, testé jusqu'à son invariant RGPD (« il ne porte la donnée
  d'aucun autre candidat »), routé côté API — et `matchingApi.explain` n'a **aucun appelant**.
  Trois exigences de conformité déjà construites, à ~1,5 jour de l'écran.
- **`ScoreWithAxes` et `Provenance`** : deux primitives d'affichage écrites, testées, gardées,
  et **montées zéro fois**, pendant que des écrans en ont recodé des équivalents locaux.
- ⚠️ `[PÉRIMÉ 27/08 — NE PAS SUIVRE]` **`unresolvedSteps` a été RETIRÉ volontairement** (commit `94d3147eb`) : le planificateur fait déjà le travail, avec son motif. Texte d'origine : ~~**`unresolvedSteps`** (`workflow-intents.ts:166`) : **un seul appel manquant** dans~~
  `action-os.controller.ts` sépare le dépôt de « une automatisation ne s'exécute pas sans son
  connecteur, et elle le dit ».
- **Item 47 — la séniorité.** La source dit « jamais déduite, elle est saisie ». Le code a
  tranché l'inverse (`cv-parsing.ts:25`, calculée sur des dates réelles) — mais de façon
  ENCADRÉE : revue champ par champ, confiance portée, « Tout accepter » interdit en confiance
  faible. L'arbitrage est défendable ; **il n'est écrit nulle part**, et c'est exactement le
  genre de décision qui se rejoue dans trois mois.
- ~~**33 `À VÉRIFIER`** au total, tous bornés et nommés avec le fichier à ouvrir.~~
  ⚠️ **Deux corrections, le 28/08.** ① **Le total était 41, pas 33** : le 33 additionnait les
  deux tables `RECONSTRUIT-*` (9 + 24) et **oubliait les 8 de `VERIFIE-groupes-A-F.md`**.
  Le §10.2 du journal portait déjà 41 pendant que son §11 écrivait 33 — le même dossier se
  contredisait d'un paragraphe à l'autre. ② **Les 41 sont STATUÉS**, chacun dans SA ligne de
  tableau avec son `fichier:ligne` et son appelant : `RECONSTRUIT-groupes-B-C.md` § E (9),
  `RECONSTRUIT-groupes-D-E.md` § E (24), `VERIFIE-groupes-A-F.md` § À VÉRIFIER (8).
  **`À VÉRIFIER` = 0.**

### ⚠️ Ce README n'indexe pas six des dix-sept fichiers du dossier

Sa table « Ce que contient ce dossier » liste les sept `passeB-groupe-*` et `VERIFIE-groupes-A-F.md` ;
la table suivante ajoute les deux `RECONSTRUIT-*`. **Les cinq `STATUE-*-2026-08-28.md` et
`NON-PROUVE-passe-independante-2026-08-28.md` ne sont mentionnés nulle part** — un lecteur qui suit
l'index ne trouve jamais le statuage du 28/08. À savoir aussi avant de s'y fier : **ces cinq fichiers
portent des COMPTES, pas des items** — un balayage de leur première colonne rend **4 lignes d'item au
total**, pour les 787 lignes qu'ils déclarent statuer. C'est précisément pourquoi la preuve n°3 du
certificat restait ouverte quand la n°2 était déclarée tenue : _un total est un argument, pas un
inventaire_ — la leçon de ce dossier, appliquée aux fichiers qui la formulent.

## La leçon, qui vaut au-delà de ce dossier

**Un résultat d'agent qui n'est pas écrit dans le dépôt n'existe pas.** Trois agents ont produit
1 190 lignes d'analyse ; seul le tiers dont un humain a recopié le rapport a survécu à la session.
Le §10.2 a conservé les chiffres parce qu'ils tenaient en un tableau — et a perdu les listes parce
qu'elles ne tenaient pas. Le geste manquant coûtait une commande `cp`.
