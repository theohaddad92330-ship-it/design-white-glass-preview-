"""``pmo`` — scaffold domain: selling into PMO & transformation offices.

TODO (curation — promote to ``live``): fill ``perimeters()`` (PMO groupe,
direction de la transformation, portfolio management, conduite du changement,
agilité à l'échelle), ``signal_families()`` (programme de transformation
annoncé, fusion/réorganisation, recrutements chefs de projet/PMO, dérive de
programme médiatisée, nouveau directeur de la transformation) and
``play_examples()`` (audit flash de portefeuille, mise en place PMO as a
service, renfort pilotage de programme, cadrage agilité à l'échelle).
Validation métier requise avant de passer ``status = "live"`` — voir
``agent_docs/offer-domains.md``.
"""

from __future__ import annotations

from app.services.offer_domains._scaffold import ScaffoldDomainPack


class PmoPack(ScaffoldDomainPack):
    code = "pmo"
    label_fr = "PMO & transformation"
    label_en = "PMO & transformation"
