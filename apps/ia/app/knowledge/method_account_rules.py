"""Les deux règles de COMPTE de BEL-SC-233, portées côté Python (#3262.22/.29).

`METHOD_CORPUS_V1` (TypeScript) les porte depuis le lot P05 — une cadence de
revue réglable (`adaptive_policy`) et un NO-GO absolu (`invariant`) — mais aucun
chunk Python ne les portait : Laura ne pouvait pas les citer. Ce module est leur
copie runtime (même contrainte que `method_rules.py` : `packages/` n'est pas
dans le contexte de build Railway). Gouvernance et garde sont miroir-testées
contre `method-corpus.runtime-governance.json`.

Ce ne sont pas des champs de compte : aucun signal « logo prestigieux » n'existe
en base, l'inventer serait la donnée fictive que la doctrine interdit.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AccountMethodRule:
    id: str
    title: str
    recommendation: str


METHOD_ACCOUNT_RULES: tuple[AccountMethodRule, ...] = (
    AccountMethodRule(
        id="cadence_de_revue_configurable",
        title="La cadence de revue d’un compte écarté ou en veille se règle, elle ne se fige pas.",
        recommendation=(
            "La cadence de revue issue de la Bible est un point de départ, jamais une loi imposée à tous les "
            "comptes : elle s’ajuste selon la catégorie du compte (le niveau de sprint), le cycle commercial, le "
            "rôle du contact concerné, le signal qui a déclenché la mise en veille, l’historique de la relation "
            "et la capacité commerciale disponible."
        ),
    ),
    AccountMethodRule(
        id="logo_prestigieux_ne_justifie_jamais_la_priorite",
        title="Un compte ne reste jamais prioritaire uniquement parce que son logo est prestigieux.",
        recommendation=(
            "Ne jamais maintenir un compte en Focus ou au sprint parce qu’il porte un logo prestigieux : la "
            "priorité se justifie par un signal d’affaires réel (accès, sponsor, cycle, marge), jamais par la "
            "seule notoriété du client. Aucun signal « logo prestigieux » n’est mesuré dans le produit."
        ),
    ),
)
