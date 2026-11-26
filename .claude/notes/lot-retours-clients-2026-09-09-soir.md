# Lot — les trois retours du 09/09 au soir (#1778, #1779, #1780)

> Écrit pendant que la suite tourne. À relire avant de conclure le lot.

## Le corpus

Trois issues déposées APRÈS les deux lots de l'après-midi (`ed21f193c`,
`52d9c720b`), donc absentes de tous les diagnostics du matin.

| Issue | Auteur | Écran | Ce que le titre disait | Ce que c'était |
| --- | --- | --- | --- | --- |
| #1778 | Louis | `/chat` | « ajouter des liens hypertextes » | le rendu ne connaît QUE le gras |
| #1779 | client SOOIT | `/chat` | « bug sans portefeuille » | un réglage qui ne commande rien |
| #1780 | client SOOIT | `/consultants/:id` | « voir cv Samuel » | trois défauts, dont deux zéros faux |

**Les corps font 5 000 à 5 300 caractères et ce sont des CONSTATS d'une ligne** :
le widget joint le markup, la chaîne de composants, le fil des actions et le
contexte. Trier au nombre d'octets les aurait envoyés dans le découpage de spec.
C'est exactement le piège que le skill nomme.

## Ce qui a été MESURÉ, pas déduit

- **#1779** — `chat-scope.ts` : `scopeAccountId()` rend `null` pour « Sans
  compte » ET pour « Tout mon portefeuille », docblock explicite à l'appui. La
  consigne du client n'a jamais quitté son navigateur. Et
  `chat-context.service.ts:197-202` fournit délibérément le portefeuille quand
  aucun compte n'est actif (« Théo §13 ») — **décision antérieure**, donc
  arbitrage obligatoire avant de coder.
- **#1778** — `markdown.tsx:processInline` ne traite que `**gras**`. Un
  `[texte](/chemin)` s'affiche crochets compris.
- **#1780** — `talentCompleteness` mesure cinq champs de la FICHE ; sur une
  fiche `needs_review`, rien n'est encore écrit dans la fiche. Le calcul est
  juste, la question qu'il pose ne l'est pas encore.

## Les deux décisions prises par Louis

1. **#1779 → « dire la vérité »** : le comportement reste (couper aurait REFUSÉ
   sa question), la promesse change.
2. **#1780 → afficher le texte du CV tout de suite** ; le fichier d'origine
   n'est toujours pas conservé (décision inscrite au contrat).

## ⚠️ Ce que le lot a trouvé sans qu'on le demande

1. **`internalRoute` acceptait `/decouvrir`.** Le correctif d'hier (#1768)
   refusait ce qui SORT du domaine et laissait passer ce qui n'EXISTE pas — sur
   le chemin même vers lequel la nouvelle règle de prompt renvoie Laura. Ce
   dépôt a déjà servi `/messagerie` contre `/mailbox` en production.
2. **Huit dialogues sur soixante-cinq sans description** (`DialogContent`), dont
   quatre sur le seul parcours du client. GA-278 les tient.
3. **GA-19 a repris mon correctif** : `cvText?.length ?? 0` faisait passer le
   cliquet de 118 à 119. Le compte se lit désormais sur le texte QU'ON REND —
   la carte disparaît quand il n'y a rien, donc il n'y a plus de zéro à écrire.

## Ce qu'on ne promet pas

- **La triple suppression de #1780 n'est pas tranchée.** Le client a cliqué
  « Retirer du vivier » → « Supprimer définitivement » trois fois en sept
  secondes. Le chemin invalide bien ses trois clés de cache. Impossible de
  distinguer « trois fiches » de « le retrait ne prend pas effet » sans lui. La
  question est posée dans l'issue.
- **Le comportement de Laura ne se recette pas en démonstration** (réponses
  préparées, zéro appel au modèle). En revanche **le LIEN se recette** : la
  réponse préparée « Où en est mon portefeuille ? » en porte deux, exprès.
- **#1779 et #1780 ne se referment qu'avec l'accord du client** : ce sont ses
  retours, et deux d'entre eux appellent une réponse de sa part.

## Gardes posées

- **GA-277** (`known-routes.test.ts`) — une route proposée par le modèle doit
  exister. Lit `routeTree.gen.ts`, prouvée en cassant `LINKABLE_SETTINGS`.
- **GA-278** (`dialogs-say-what-they-do.test.ts`) — un dialogue dit ce qu'il
  fait. Prouvée en retirant la description de `TalentDeleteDialog`.
- **Garde inter-langages du prompt** (`test_copilote_prompt_blocks.py`) — tout
  chemin cité dans le prompt existe dans la navigation du web. Prouvée en
  écrivant `/decouvrir` dans le vrai prompt.

---

## ⚠️ La régression, et ce qu'elle apprend (09/09, 16h30)

**Quinze minutes après le déploiement de `c3970e8ce`, l'entête de la fiche
talent était écrasée en production.** Mesuré sur la page : **32 px** rendus pour
un `scrollHeight` de **335 px** — le nom coupé en deux par la barre d'onglets,
la complétude entière disparue.

**Ma cause** : en remontant le bloc photo dans l'entête (#1780.3), le contenu a
franchi un seuil. **La cause réelle est générale** : une entête vit dans une
colonne `flex` à `min-h-0`, un enfant de flex vaut `flex: 0 1 auto` — il a le
droit de rétrécir — et `Card` porte `overflow-hidden`, donc rien ne déborde pour
le signaler.

**Ce qui compte pour la suite :**

1. **Les 8 125 tests étaient verts et ne pouvaient pas être autre chose.** jsdom
   ne met rien en page. C'est la famille « MESURER le DOM en recette, jamais lire
   les classes » — et c'est la troisième fois qu'elle se paie ici.
2. **La mesure a précédé le correctif** : `flexShrink = 0` posé à la main DANS la
   page a fait repasser la carte à 335 px. Corriger sans cette étape aurait été
   une supposition.
3. **Le balayage a trouvé un SECOND cas, antérieur au lot** : « Compétences qui
   te coûtent des besoins » sur `/consultants`, 32 px pour 180 px. Aucun de mes
   changements ne touche ce fichier. Une cause générale n'a jamais une seule
   victime.
4. **GA-279 est une garde FAIBLE, et elle le dit.** Elle vérifie une classe,
   parce qu'un test unitaire ne peut pas mesurer une mise en page. Une garde qui
   prétendrait faire plus mentirait.

PR du correctif : #1783.
