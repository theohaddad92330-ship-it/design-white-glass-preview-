# Prompt de reprise — retours bêta, lot suivant (après le 09/09/2026 après-midi)

> À COLLER TEL QUEL dans une session neuve, après `/clear`.

---

Tu reprends le traitement des retours bêta de BellumAI. Deux lots sont partis en
production le 09/09 après-midi (PR #1776 « les promesses fausses », PR #1777
« la mémoire marché dit ce qu'elle ne sait pas »). Lance `/livraison:issues`.

## Ce qui est vrai avant de commencer, et qui t'évitera de recoder

**⚠️ Les commentaires de diagnostic du 09/09 au matin sont PÉRIMÉS sur plusieurs
points.** Ils ont été écrits contre l'arbre d'AVANT le merge de la vague des 59
issues du même matin. Trois points annoncés « reste à faire » étaient déjà
livrés : `#1613.5`, `#1756.1`, `#1681.1`/`#1681.5` (côté API). **Vérifie chaque
point contre `origin/main` avant d'écrire une ligne** — c'est le geste le plus
rentable de ce chantier.

## Les issues encore ouvertes, par pile

**Bloquées sur TOI, pas sur le code** — ne pas coder, relancer Louis :
- `#1472` — nommer un écran de référence de densité. **Il bloque `#1417` et
  `#1440` depuis le 03/09.** C'est le déblocage le moins cher du corpus.
- `#1639` — politique de crédits sur la mémoire marché. Facturation = arrêt
  obligatoire.
- `#1655` — il faut une facture réellement en retard pour voir la relance
  tourner. Proposer d'en créer une dans l'espace de test.
- `#1770` — attend la réponse du client (le correctif est parti).
- `#1619.2` — proposition écrite dans l'issue, attend un oui/non.

**Bloquées sur une MESURE que tu peux faire** :
- `#1634` — taux de remplissage de `market_company_signal.city` / `.region` sur
  les 60 067 lignes de production. Si majoritairement vides, l'issue tombe.
- `#1636` — attend `#1756.2`.

**La cause racine qui commande le plus gros bloc** :
- **La mémoire marché est ABSENTE du service IA** (0 occurrence, mesuré). Elle
  bloque `#1611.4`, `#1611.5`, `#1611.6`, `#1590.1-7`, `#1613.6`, `#1631.3`,
  `#1606.2`, `#1630.4`, `#1640.8`. Le câblage est écrit en cinq maillons dans
  `agent_docs/chantiers-livres.md` § « La vague des 59 issues ». **C'est le
  chantier le plus rentable du corpus** : un seul câblage débloque neuf points.

**Le second bloc, même forme** :
- La primitive `search_market_memory` répond à `#1596.6-10` **et** `#1628.1`.
  À construire **une seule fois** pour les deux.

**La série `/produit` (`#1657`, `#1683`–`#1688`)** — ne pas commencer par les
écrans. **Sept des neuf émetteurs du traceur n'ont aucun appelant**, et
`VITE_PRODUCT_TRACKER_ENABLED` est ÉTEINTE. Six tableaux vides sinon.

**Les gros chantiers restants** : `#1626` (filtres marché sur Découvrir),
`#1625.2` (3ᵉ lecture Reverse Market), `#1618` (façade
`AccountIntelligenceContext`), `#1622` (shadow mode — protocole humain),
`#1616` (import versionné), `#1615` (manifest).

## Deux dettes d'outillage laissées derrière moi

1. **Cinq worktrees résiduels dans `.claude/worktrees/`** (vague du matin, tous
   mergés). Ils contiennent des `dist/` et rendent `pnpm lint` LOCAL rouge à
   856 erreurs qui ne sont pas les tiennes. `.claude/*` est gitignoré, donc la
   CI ne les voit pas. `git worktree remove` quand tu veux un lint local lisible.
2. **`git commit -F` SUPPRIME les lignes commençant par `#`** — donc tous les
   numéros d'issue d'un corps de message. Toujours `--cleanup=whitespace`.

## Ce qui n'a pas pu être recetté, et pourquoi

- La recette live du 09/09 s'est faite dans un espace de **DÉMONSTRATION**
  (`demo+demo8@`), pas l'espace de test de Louis. Le balayage des 14 écrans est
  valable (zéro débordement, zéro crash, zéro erreur de console), mais :
- **le comportement de Laura ne se recette pas en démo** (les réponses y sont
  préparées, aucun appel au modèle) — `#1768` attend une vérification sur un vrai
  espace ;
- **les deux cartes réparées** (`open_screen`, `prepare_consultant_record`) sont
  tenues par 25 tests et par la présence de leurs libellés dans le bundle servi,
  pas par une observation ;
- **le back-office n'est pas accessible** depuis cette session (authentification
  basique) : `#1655` et `#1681.1` n'ont pas été vus tourner.
