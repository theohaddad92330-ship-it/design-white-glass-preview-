"""Compilateurs de ``/chat`` (chantier CHAT, #2317-#2324) — chacun ASSEMBLE en
UN objet nommé des ingrédients qui existent déjà (schémas, endpoints,
mécanismes épars, ontologie), sans jamais les réimplémenter (GA-26 : un
réglage vit à un seul endroit) et sans en inventer aucun.

Un compilateur lit une demande (ou un état déjà résolu par l'appelant) et rend
un objet STRUCTURÉ que le reste du tour consomme. Il n'appelle aucun modèle, ne
fait aucun réseau, et n'invente rien : c'est ce qui le rend pur, testable et
journalisable sans exposer le contenu d'un message. Chaque module de ce paquet
porte SON compilateur, nommé par le domaine qu'il compile
(`opportunity_compiler.py` pour #2324, etc.).

Huit lots-compilateurs tournent en parallèle sur ce chantier. Chronologiquement
le premier livré : `account_work_contract` (#2300, LAU-FINAL-041). Sur le plan
du CONTRAT, `intent_router` (#2321) est le premier du tour : c'est le contrat
d'ENTRÉE — il décide de quoi parle la demande — et les autres s'y branchent.

Le compilateur de besoin (`need_compiler.py`, #2322) reçoit ce que le modèle a
extrait d'une SOURCE, le VÉRIFIE, et rend une proposition qu'un humain valide ;
il n'importe aucun autre compilateur.
"""

from __future__ import annotations
