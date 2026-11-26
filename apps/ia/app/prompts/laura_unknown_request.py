"""#1949 — UNE DEMANDE QUE LAURA N'A JAMAIS VUE : le repli universel.

─────────────────────────────────────────────────────────────────────────────
LE RETOUR, ET CE QUI MANQUAIT
─────────────────────────────────────────────────────────────────────────────
« Il est impossible de lister à l'avance toutes les questions qu'un
utilisateur posera. Laura ne doit donc dépendre ni des six suggestions
visibles, ni d'une liste fermée de formulations. »

L'architecture ne dépendait déjà d'aucune énumération — le modèle lit un
message libre, et le routage se fait par choix d'outil, pas par correspondance
de phrase. Ce qui manquait était la CONDUITE : ce que Laura fait d'une demande
qu'elle situe mal. Onze natures sont nommées dans l'issue ; six avaient déjà
leur bloc (voir ci-dessous), cinq n'avaient rien, et rien ne disait de
CLASSER avant de répondre. Sans cette étape, une demande composée partait en
une seule réponse, une demande ambiguë recevait la réponse à l'autre question,
et une capacité absente du produit recevait un « je ne peux pas » nu.

─────────────────────────────────────────────────────────────────────────────
CE BLOC NE RÉÉCRIT PAS CE QUI EXISTE — il ROUTE vers lui
─────────────────────────────────────────────────────────────────────────────
Loi 4 du tome 7 (« rien n'apparaît deux fois sous la même forme ») et le budget
de tour (90 s de budget, 105 s de plafond dur) interdisent de recopier ici une
conduite déjà écrite. Chaque nature déjà tenue renvoie donc à SON bloc, par son
intitulé, et n'en redit pas le contenu :

· nature 2 (précision)          → ``_BLOCK_ASK_FIRST``   « DEMANDER AVANT DE CHERCHER »
· nature 3 (outil)              → ``_BLOCK_TOOLS``       « OUTIL DISPONIBLE »
· nature 4 (écran)             → ``_BLOCK_TOOLS``       « MONTRER LE CHEMIN »
· nature 6 (connecteur)         → ``_BLOCK_TOOLS``       « CONNECTEUR MANQUANT »
· nature 8 (hors métier)        → ``_BLOCK_OUT_OF_SCOPE`` (#1929.6)
· nature 9 (problème produit)   → ``BLOCK_SUPPORT``      (#1960, ``laura_support.py``)
· nature 11 (interdite)         → ``_BLOCK_SECURITY`` + ``_BLOCK_PROTECTED_CRITERIA``

Ce que ce bloc AJOUTE, parce qu'aucun autre ne le porte :

· #1949.1  — la classification elle-même, et le refus explicite de dépendre
             d'une liste de formulations ;
· #1949.6  — une demande composée : le PLAN avant le premier geste (#1949.18) ;
· #1949.8  — une capacité que le produit n'a pas, DISTINCTE d'un connecteur qui
             manque : là, rien à brancher (#1949.15) ;
· #1949.11 — une demande ambiguë sur l'OBJET : les lectures ÉNONCÉES (#1949.17).
             ``THREAD_CONTINUITY_BLOCK`` (#1927.8) dit quand demander une
             précision ; il ne dit pas de MONTRER les lectures possibles ;
· #1949.21 — un refus nu est interdit tant qu'il reste quelque chose à offrir.
             La règle existait pour le seul cas SÉCURITÉ (« RÉPONSE DE
             SÉCURITÉ ») ; elle vaut pour les onze natures ;
· #1949.24 — une demande mal comprise ne déclenche aucune dépense ;
· #1949.22 — la classification ne se MONTRE pas. L'interdit général sur
             l'architecture vit déjà dans ``_BLOCK_TOOLS`` (« CONFIDENTIALITÉ
             TECHNIQUE ») et ``_BLOCK_SECURITY`` (« EXFILTRATION ») ; ce qui est
             NEUF ici, c'est que cette taxonomie-ci est elle-même de la
             mécanique, et qu'elle fuirait la première (« ta demande est de
             catégorie 7 »).

#1949.23 (la trace anonyme d'une demande non routée) est LIVRÉ ailleurs et n'est
pas touché ici : ``apps/api/src/modules/laura-unrouted-intents/``, exception de
doctrine NOMMÉE (c64), conditions non négociables. Ce bloc ne l'alimente pas et
n'en parle pas au modèle.

─────────────────────────────────────────────────────────────────────────────
POURQUOI UN MODULE À PART, INSÉRÉ PAR UNE LIGNE
─────────────────────────────────────────────────────────────────────────────
Même raison que ``laura_support.py`` : ``bellum_advisor.py`` est écrit par
plusieurs chantiers à la fois, et un bloc de ~3 000 caractères au milieu de ses
constantes rendrait chaque fusion conflictuelle. Le bloc entre dans le prompt
par une ligne du gabarit, dans le segment INVARIANT (il ne dépend d'aucun
argument — GA-293).

⚠️ Le nom ne commence PAS par ``bellum_`` : ``test_prompt_registry_coverage.py``
balaie ``bellum_*.py`` comme des prompts AUTONOMES (registre, golden, modèle).
Celui-ci n'est pas un prompt, c'est un fragment du prompt du copilote — son
golden est ``tests/golden/system/advisor.txt``, qui le contient.

─────────────────────────────────────────────────────────────────────────────
OÙ IL EST PLACÉ, ET POURQUOI LÀ
─────────────────────────────────────────────────────────────────────────────
Juste AVANT ``_BLOCK_ASK_FIRST``, et donc avant les blocs vers lesquels il
route : la classification précède la conduite. Il reste dans le segment
invariant, sans quoi il cesserait d'être mis en cache (GA-293).

Sa garde est ``tests/test_copilote_unknown_request_eval.py`` — les onze natures,
les neuf cas de recette de l'issue, et les trois preuves exigées de toute garde
du dépôt (savoir dire NON, LIRE un corpus non vide, ne pas attraper le voisin).
"""

from __future__ import annotations

# ⚠️ Les intitulés en MAJUSCULES sont les ANCRES que la garde lit, et que les
# autres blocs citent. Les renommer casse la garde — ce qui est voulu : un
# renvoi vers un intitulé qui n'existe plus est un renvoi mort.
BLOCK_UNKNOWN_REQUEST = """UNE DEMANDE QUE TU N'AS JAMAIS VUE — tu ne disposes d'aucune liste de formulations attendues et tu n'en attends aucune : une demande écrite autrement que les suggestions affichées se traite exactement comme une demande prévue. Tu ne réponds JAMAIS « je n'ai pas compris » ni « peux-tu reformuler » sans avoir d'abord dit ce que tu as compris et ce qui te manque pour trancher.
CLASSE D'ABORD, SANS LE DIRE. Avant de répondre, situe la demande dans une de ces onze natures. Tu ne l'annonces jamais, tu ne la numérotes jamais, tu n'en parles pas : c'est ta mécanique, pas la conversation.
1. RÉPONDABLE MAINTENANT — le contexte ci-dessus suffit. Tu réponds, au format qui convient.
2. RÉPONDABLE APRÈS UNE PRÉCISION — une seule chose manque et elle CHANGE la réponse : applique « DEMANDER AVANT DE CHERCHER ».
3. RÉPONDABLE APRÈS UN OUTIL — tu l'appelles, puis tu réponds sur ce qu'il a rendu, jamais sur ce que tu supposes qu'il rendrait.
4. À FAIRE SUR UN ÉCRAN — le geste appartient à la personne (corriger une fiche, connecter un outil, exporter ou supprimer ses données, changer un réglage). Tu ouvres l'écran, pré-rempli quand tu peux, comme l'écrit « MONTRER LE CHEMIN ».
5. COMPOSÉE DE PLUSIEURS TRAVAUX — voir « UNE DEMANDE QUI EN CONTIENT PLUSIEURS », plus bas.
6. BLOQUÉE PAR UNE DONNÉE OU UN CONNECTEUR — applique « CONNECTEUR MANQUANT ». Il y a quelque chose à brancher.
7. PAS UNE CAPACITÉ DU PRODUIT — voir « CE QUE LE PRODUIT NE SAIT PAS FAIRE », plus bas. Il n'y a rien à brancher.
8. HORS DU MÉTIER — applique « HORS PÉRIMÈTRE ».
9. UN PROBLÈME DU PRODUIT LUI-MÊME — applique « QUAND ÇA NE MARCHE PAS ».
10. AMBIGUË SUR L'OBJET — voir « LES LECTURES POSSIBLES SE MONTRENT », plus bas.
11. INTERDITE PAR UN RÔLE, UNE PERMISSION OU LA SÉCURITÉ — les blocs qui les portent tranchent ; la réponse reste brève, et elle porte son alternative.
Une demande relève parfois de deux natures : tu traites la plus bloquante d'abord, et tu DIS ce qui reste en attente. Une demande qui n'entre dans aucune est traitée comme la nature 10 : tu montres les lectures que tu vois.
UNE DEMANDE QUI EN CONTIENT PLUSIEURS. Tu n'en lances aucune avant d'avoir posé le plan : les travaux dans l'ordre, ce que chacun rend, ce qu'il dépense s'il dépense, et lequel dépend du résultat du précédent. Tu demandes l'accord sur le plan, puis tu fais le premier. Jamais les quatre d'un coup, jamais un seul en taisant les autres.
CE QUE LE PRODUIT NE SAIT PAS FAIRE. Tu le dis en une phrase, sans détour, et tu ne promets ni date, ni version, ni « bientôt ». Puis tu proposes le plus proche que tu sais VRAIMENT faire, et tu dis en quoi c'est différent de ce qui était demandé. Tu n'inventes aucune capacité pour combler le vide.
LES LECTURES POSSIBLES SE MONTRENT. Quand une demande peut porter sur deux objets ou deux questions également plausibles, tu ÉNONCES les lectures — deux, trois au plus, une ligne chacune, formulées pour qu'on réponde d'un mot — et tu demandes laquelle. Tu ne tranches pas en silence et tu ne réponds pas aux deux à la fois.
JAMAIS UN REFUS NU. « Je ne peux pas » seul est interdit tant qu'il reste quelque chose : ce que tu sais faire d'approchant, l'écran où la personne le fait elle-même, ou la donnée qui débloquerait le reste. Tu ne dis « il n'y a rien » que quand tu as regardé et que c'est vrai.
TU NE DÉPENSES PAS POUR COMBLER TON DOUTE. Une demande que tu n'as pas comprise ne déclenche AUCUN outil lourd, aucune analyse, aucune collecte : une question posée coûte moins qu'une recherche à côté. Tu comprends d'abord, tu dépenses ensuite — et une dépense se confirme."""
