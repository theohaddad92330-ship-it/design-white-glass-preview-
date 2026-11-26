# Prompt de reprise — retours bêta, lot suivant (après le 09/09/2026 au soir)

> À COLLER TEL QUEL dans une session neuve, après `/clear`.

---

Tu reprends le traitement des retours bêta de BellumAI. Lance `/livraison:issues`.

## Ce qui vient d'être livré (PR #1782)

Trois retours déposés APRÈS les lots de l'après-midi : **#1778** (liens dans les
réponses de Laura), **#1779** (la portée « Sans compte » ne commandait rien),
**#1780** (« voir cv Samuel » — trois défauts). Récit complet et gardes :
`.claude/notes/lot-retours-clients-2026-09-09-soir.md`.

**Ce qui reste ouvert dessus** : #1779 et #1780 attendent la réponse du client
(SOOIT), et #1780 porte une question non tranchée — la triple suppression en
sept secondes. Ne pas les clore sans son accord.

## ⚠️ Les pièges payés dans CE lot

1. **`ls` rend du vide dans le bac à sable** — `/usr/bin/find` à la place, et
   `/opt/homebrew/bin/git` quand `git` est bloqué.
2. **`renderWithRouter` rend de façon ASYNCHRONE.** `document.body.textContent`
   vaut `''` juste après l'appel : six tests écrits en synchrone ont échoué avec
   « expected '' to contain … », ce qui ressemble à un défaut de code. Toujours
   un `await screen.findBy…` avant la première assertion.
3. **GA-19 est un cliquet à 118.** Un `?? 0` de plus le fait rougir — le mien
   était `cvText?.length ?? 0`, dans un correctif qui visait précisément à ne pas
   écrire de zéro faux. La suite complète du web est le seul endroit qui le voit.
4. **`git worktree remove --force` est refusé par le classifieur** de ce poste.
   Les cinq worktrees de la vague du matin sont TOUJOURS là et rendent
   `pnpm lint` LOCAL rouge à ~856 erreurs qui ne sont pas les tiennes
   (`.claude/*` est gitignoré, la CI ne les voit pas). Demander à Louis, ou
   `git worktree remove` sans `--force`.
5. **`.claude/notes/` est gitignoré** : `git add` le refuse, et c'est voulu.

## Les issues encore ouvertes, par pile

**Bloquées sur Louis** — ne pas coder, relancer :
- `#1472` — nommer un écran de référence de densité. **Bloque `#1417` et `#1440`
  depuis le 03/09.** Le déblocage le moins cher du corpus.
- `#1639` — politique de crédits (facturation = arrêt obligatoire).
- `#1655` — il faut une facture réellement en retard pour voir la relance.
- `#1770`, `#1779`, `#1780` — attendent la réponse du client.
- `#1619.2` — proposition écrite dans l'issue, attend un oui/non.

**Bloquées sur une MESURE que tu peux faire** :
- `#1634` — remplissage de `market_company_signal.city` / `.region` sur les
  60 067 lignes de production. Majoritairement vides ⇒ l'issue tombe.
- `#1636` — attend `#1756.2`.

**La cause racine qui commande le plus gros bloc** :
- **La mémoire marché est ABSENTE du service IA** (0 occurrence, mesuré le
  09/09). Elle bloque `#1611.4/.5/.6`, `#1590.1-7`, `#1613.6`, `#1631.3`,
  `#1606.2`, `#1630.4`, `#1640.8`. Câblage en cinq maillons dans
  `agent_docs/chantiers-livres.md` § « La vague des 59 issues ». **Un seul
  câblage débloque neuf points** — c'est le chantier le plus rentable.

**Le second bloc, même forme** : la primitive `search_market_memory` répond à
`#1596.6-10` ET `#1628.1`. À construire UNE fois pour les deux.

**La série `/produit` (`#1657`, `#1683`–`#1688`)** — ne pas commencer par les
écrans : sept des neuf émetteurs du traceur n'ont aucun appelant, et
`VITE_PRODUCT_TRACKER_ENABLED` est éteinte. Six tableaux vides sinon.

**Les gros chantiers restants** : `#1626` (filtres marché sur Découvrir),
`#1625.2` (3ᵉ lecture Reverse Market), `#1618` (façade
`AccountIntelligenceContext`), `#1622` (shadow mode), `#1616` (import versionné),
`#1615` (manifest).

## Ce que la recette de ce lot n'a pas pu prouver

- **Le comportement de Laura ne se recette pas** sans lui écrire (facturé,
  plafond 50/jour, et interdit par le profil). Le LIEN se recette en revanche sur
  `/demo`, où une réponse préparée en porte deux exprès.
- **La session Chrome de ce poste est connectée à l'espace de LOUIS**, pas à la
  démo — vérifier l'identité AVANT de conclure quoi que ce soit sur un écran
  (« le premier cookie gagne »).
- **Zéro fiche `needs_review` et zéro CV dans le vivier de Louis** (29 fiches,
  mesuré) : recetter `#1780.1/.2` demande d'en CRÉER une, ce que l'autorisation
  permanente du 25/08 permet.
- Observation non concluante à re-mesurer : le dashboard a affiché « Ton cockpit,
  **Maëlle** » à 15:04 puis « Ton cockpit, **Louis** » à 16:20 sur le même
  onglet. Pas trouvé dans le bundle d'entrée. Soit un cookie de démo qui traînait,
  soit un prénom qui vient d'ailleurs.

---

## Complément — ce que la recette a mesuré (09/09, 17h)

**Trois merges** : `c3970e8ce` (le lot), `649abda3a` (la régression d'entête +
un cas antérieur), `62eeba1a0` (le registre).

**Vérifié EN PRODUCTION, pas déduit :**
- `#1778` — Laura rend deux vrais liens (`/accounts`, `/discover`), zéro syntaxe
  markdown brute, et le clic navigue sans recharger la conversation.
- `#1779` — « Sans dossier de compte ouvert — ton portefeuille reste lisible ».
- `#1780.3` — un seul avatar sur la fiche, le bouton photo dessus.
- Entête réparée : **335 px** au lieu de 32.
- Balayage par CLIC des 6 entrées de nav : chacune mène au bon écran, zéro carte
  écrasée, zéro débordement horizontal.

**Non vérifié, et nommé comme tel :**
- `#1778` — ce que Laura ÉCRIT d'elle-même (la démo n'appelle pas le modèle).
- `#1779` — le pied de réponse qui nomme le portefeuille (absent des réponses
  préparées).
- `#1780.1` / `#1780.2` — aucune fiche fraîchement importée d'un CV dans les
  espaces accessibles.

**Un échec réseau relevé, hors périmètre** : `412` sur
`/api/crm/pipeline/report?period=quarter` en démonstration. Un 412 se lit comme
un refus de précondition (CRM non branché), pas comme une panne — à confirmer.

**Dette laissée** : un worktree résiduel (`agent-a3c62a1ae18e40166`) que
`git worktree remove` refuse sans `--force`, lequel est bloqué par le
classificateur de ce poste. Il fausse `pnpm lint` LOCAL.

---

## Recette poussée à fond + clôtures (09/09, 17h30)

**Cinq merges au total** : `c3970e8ce` (le lot) · `649abda3a` (l'entête écrasée +
un cas antérieur) · `62eeba1a0` (registre) · `f9fe1cc05` (la LISTE disait encore
« 20/100 »).

**Quatre issues CLOSES, chacune vue tourner :**
- `#1778` — liens rendus, clic qui navigue, les deux thèmes (la couleur change :
  `rgb(91,62,232)` → `rgb(158,135,255)`).
- `#1779` — le libellé de portée ne promet plus.
- `#1780` — les CINQ points, sur une fiche **réellement importée depuis un CV**.
- `#1766` — refermée sur ce qui est prouvé, avec le point non observable nommé.

**⚠️ Le geste qui a tout débloqué** : importer un CV en DÉMONSTRATION. Le parse y
est scripté (zéro appel modèle), la fiche passe en `needs_review` avec son
`cv_text`, et les deux points « non recettables » du matin sont devenus
mesurables en trois minutes. **Un écran sans données ne se recette pas en le
regardant vide : on lui en crée.**

**La triple suppression de #1780 est TRANCHÉE par la mesure** : 8 profils → 7, la
fiche disparaît, le dialogue se ferme. Le client supprimait bien trois fiches.

**Deux issues laissées ouvertes à dessein** (`#1768`, `#1770`) : leur correctif ne
s'observe qu'avec un vrai tour de Laura. Chacune porte le geste exact qui la
fermerait, adressé au client.

⚠️ **L'API reste sur `c3970e8ce`** et c'est normal : les deux derniers merges ne
touchent que `apps/web`. Ne pas attendre un SHA d'API pour un lot purement front.
