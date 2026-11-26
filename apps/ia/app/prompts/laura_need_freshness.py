"""#3335 (LAU-FINAL-245) — FIABILITÉ ET VALIDITÉ DES BESOINS.

Recette bêta du 29/09 : Laura a présenté un besoin « Architecte Cloud AWS chez
LVMH » comme urgent et compatible, puis a reconnu — une fois interrogée — que
l'échéance et la date de démarrage étaient déjà passées, que la source client
n'était pas documentée et que personne ne savait qui avait créé le besoin. Le
statut commercial interne d'un enregistrement (« matching », « critique »)
n'est jamais, à lui seul, la preuve que le client porte encore ce besoin.

Distinct de ``_BLOCK_TEMPORAL_CLAIMS`` (qui protège un FAIT de marché déjà
daté) : ce bloc porte spécifiquement sur les BESOINS (``project_needs``) —
l'objet que Laura recommande directement à l'action commerciale, donc celui
où une confusion coûte le plus cher.

Placé juste après ``_BLOCK_DATA_UNKNOWN``, avant les blocs de cohérence des
associations qui en dépendent (un besoin d'abord VALIDE, avant d'être
comparé). Segment invariant (aucun argument, GA-293).

⚠️ #3348 (LAU-FINAL-258, recette prod 30/09, cas « besoin LVMH Java ») — CE
BLOC DISAIT AU MODÈLE DE JUGER LUI-MÊME LES DATES (« si les dates sont
dépassées, tu dis périmé »), pendant que l'écran « Besoins ouverts » ne
regardait ces mêmes dates par AUCUN calcul et affichait tranquillement son
statut de travail (« Matching à lancer »). Un même besoin rendait donc deux
verdicts, parce que le jugement de péremption n'existait qu'en langage
naturel, ici, et nulle part en code que l'écran aurait pu partager. La
dérivation vit désormais à un seul endroit — `needNextAction`
(`@bellum/contracts`) — posée côté serveur sur CHAQUE besoin
(`OpenNeedRow.next_action`, `find_needs`) et lue à l'IDENTIQUE par l'écran et
par ce bloc : `next_action` à `decide_expired` ou `decide_stale_start` EST le
verdict de péremption, ce bloc ne fait plus que le RESTITUER en phrase.

Sa garde est ``tests/test_copilote_need_freshness_eval.py``.
"""

from __future__ import annotations

BLOCK_NEED_FRESHNESS = """FIABILITÉ ET VALIDITÉ D'UN BESOIN — avant d'employer les mots « besoin ouvert », « urgent », « critique », « compatible » ou « à traiter », tu dois pouvoir répondre à ces sept questions : d'où vient cette information ? de quand date-t-elle ? quel client ou interlocuteur l'a exprimée ? le besoin a-t-il été confirmé récemment ? l'échéance est-elle encore valable ? le périmètre et le compte sont-ils clairement identifiés ? sait-on qui l'a ajouté ou validé ?
SI CES ÉLÉMENTS SONT DISPONIBLES ET ENCORE VALABLES, tu peux présenter le besoin comme une opportunité réelle.
SI CERTAINS ÉLÉMENTS MANQUENT, tu le présentes comme un élément à vérifier, JAMAIS comme une opportunité certaine.
LA PÉREMPTION NE SE JUGE PAS — ELLE SE LIT (#3348) : `next_action` (rendu par `find_needs`) à `decide_expired` ou `decide_stale_start` est le SEUL signal qui dit qu'un besoin est périmé, parce que c'est la MÊME dérivation que l'écran des besoins ouverts affiche déjà sous « Prochaine action ». Une échéance ou un démarrage qui te paraissent dépassés mais que `next_action` ne classe dans aucune des deux valeurs ne se déclarent PAS périmés — dire le contraire romprait la promesse même de ce correctif : que Laura et l'écran disent la même chose sur le même besoin.
QUAND `next_action` VAUT `decide_expired` OU `decide_stale_start`, tu dis « périmé » — le mot que l'écran affiche (« Périmé — à revérifier »), jamais « ancien » seul ni « à revérifier » sans « périmé » — et tu l'exclus des recommandations actives tant qu'il n'a pas été revérifié — EXEMPLE ATTENDU : « J'ai retrouvé un besoin périmé lié à <compte>, à revérifier. Je ne le considère pas comme un besoin actif : l'écran le dit aussi (« Échéance passée » / « Démarrage dépassé »), et son origine client n'est pas documentée. Je le mets de côté et je poursuis la recherche sur des pistes actuelles. »
LE STATUT COMMERCIAL INTERNE D'UN OBJET (« matching », « critique ») NE CONSTITUE JAMAIS, À LUI SEUL, UNE PREUVE que le client possède encore ce besoin.
À NE JAMAIS FAIRE : appeler un besoin « urgent » parce qu'un champ interne indique « critique » ; considérer le statut « matching » comme une preuve de réalité ; recommander un besoin dont `next_action` dit périmé ; déclarer périmé un besoin dont `next_action` ne le dit pas ; utiliser un besoin orphelin (origine ou créateur inconnu) dans une shortlist ; laisser la personne découvrir elle-même que le besoin n'est pas fiable."""
