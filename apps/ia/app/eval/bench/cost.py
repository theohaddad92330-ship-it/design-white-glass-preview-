"""Ce que coûterait un rejeu — projeté depuis des jetons MESURÉS, jamais devinés.

Méthode, dite en une phrase : on prend les **compteurs de jetons réellement
observés** sur le bras de référence du corpus, et on les repasse dans la table
de tarifs du fournisseur visé. Aucun tarif n'est recopié ici — la table
Anthropic vit dans ``claude_service._compute_cost`` (surchargeable par
``ANTHROPIC_PRICE_*``) et la table OpenAI dans
``llm_gateway._openai_compute_cost``. Un réglage vit à un seul endroit.

L'hypothèse, et elle est FORTE
------------------------------
La projection suppose que le modèle visé produira **le même nombre de jetons de
sortie** que celui déjà mesuré. C'est faux en général : un modèle plus bavard
coûte plus que la projection, un plus concis moins. La projection est donc un
ORDRE DE GRANDEUR pour décider si un rejeu tient dans un budget, pas une
facture. ``assumption`` le dit dans le payload, et la CLI l'imprime.

Sans rien de mesuré, la fonction rend ``measured: False`` et **aucun chiffre** —
même discipline que ``estimate_campaign_cost`` de la campagne.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.eval.bench.corpus import ARM_RECORDED, CallRecord
from app.eval.strategy.variants import ModelSpec

ASSUMPTION = (
    "jetons de SORTIE supposés identiques à ceux mesurés — un modèle plus bavard "
    "coûtera plus, un plus concis moins. Ordre de grandeur, pas facture."
)


def price_for(spec: ModelSpec, input_tokens: int, output_tokens: int) -> float | None:
    """Le prix de ces jetons chez ce fournisseur, via SA table (jamais une copie).

    ⚠️ Rend `None` quand le fournisseur ne sait pas tarifer ce modèle. La table
    OpenAI retombait autrefois sur le palier `gpt-4o` ; depuis le 28/08/2026 elle
    rend `None` plutôt qu'un prix emprunté — « un prix inconnu ne se lit jamais
    "gratuit", ni "comme gpt-4o" ». Ce banc a d'abord PLANTÉ dessus
    (`TypeError: NoneType doesn't define __round__`), et c'est la CI qui l'a vu :
    il supposait qu'un repli existait toujours. Un banc qui s'arrête sur un prix
    inconnu est inutilisable exactement le jour où l'on compare un modèle neuf —
    c'est-à-dire le seul jour où on s'en sert.
    """
    if spec.provider == "openai":
        from app.services.llm_gateway import _openai_compute_cost

        return _openai_compute_cost(input_tokens, output_tokens, spec.model)
    from app.services.claude_service import _compute_cost

    return _compute_cost(input_tokens, output_tokens, spec.model)


def price_is_a_fallback_tier(spec: ModelSpec) -> bool:
    """Ce modèle est-il facturé au PALIER PAR DÉFAUT, faute d'être connu ?

    Les deux tables de tarifs cherchent leur clé en SOUS-CHAÎNE de l'identifiant
    et retombent sur un palier moyen quand rien ne colle. Un modèle qui vient de
    sortir tombe donc systématiquement dans ce cas — et son « coût projeté » est
    alors le prix d'un AUTRE modèle. Le taire serait exactement le chiffre
    inventé que la doctrine interdit ; le banc l'annonce.
    """
    if spec.provider == "openai":
        from app.services.llm_gateway import _OPENAI_PRICING

        return not any(key in spec.model for key in _OPENAI_PRICING)
    from app.services.claude_service import _MODEL_PRICING

    return not any(key in spec.model for key in _MODEL_PRICING)


def project_replay_cost(
    records: Iterable[CallRecord],
    specs: Iterable[ModelSpec],
    *,
    source_arm: str = ARM_RECORDED,
) -> dict[str, Any]:
    """Projette le coût d'un rejeu complet du corpus, par modèle."""
    specs = list(specs)
    rows = [r for r in records if r.arm == source_arm and r.ok]
    measured_in = sum(r.input_tokens for r in rows)
    measured_out = sum(r.output_tokens for r in rows)
    if not rows or (measured_in == 0 and measured_out == 0):
        return {
            "measured": False,
            "calls": len(rows),
            "note": (
                "aucun jeton mesuré dans le corpus — enregistrer d'abord "
                "(`record --yes-run-live`), le banc n'invente pas de coût"
            ),
            "by_model": {},
        }
    return {
        "measured": True,
        "calls": len(rows),
        "source_arm": source_arm,
        "input_tokens": measured_in,
        "output_tokens": measured_out,
        "observed_cost_usd": round(sum(r.cost_usd for r in rows), 4),
        "assumption": ASSUMPTION,
        # `None` voyage jusqu'au rendu : le lecteur doit voir « non tarifé », pas
        # un blanc qui se lit « gratuit » ni un zéro qui se lit « offert ».
        "by_model": {
            spec.label: (None if (p := price_for(spec, measured_in, measured_out)) is None else round(p, 4))
            for spec in specs
        },
        # Les modèles que le fournisseur ne sait pas tarifer du tout : leur coût
        # projeté n'existe pas, il n'est pas « zéro ».
        "unpriced": sorted(
            s.label for s in specs if price_for(s, measured_in, measured_out) is None
        ),
        # Les modèles dont le tarif n'est PAS dans la table du fournisseur : leur
        # chiffre est celui d'un palier de repli, pas leur prix.
        "fallback_priced": sorted(s.label for s in specs if price_is_a_fallback_tier(s)),
    }
