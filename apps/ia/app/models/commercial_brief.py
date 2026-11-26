"""``CommercialBrief`` côté Python — miroir pydantic du contrat partagé.

Source de vérité : ``packages/contracts/src/schemas/commercial-brief.ts`` (zod),
copiée en JSON Schema dans ``app/contracts/schemas/commercial-brief.schema.json``.
Ce modèle ne la remplace pas : l'endpoint valide la sortie du modèle contre LE
JSON Schema (la même pièce que lit le TypeScript) PUIS contre ce modèle, et
``tests/test_commercial_brief.py`` tient la parité des clés entre les deux.

Contrat FERMÉ (``extra="forbid"``) partout, comme le ``.strict()`` zod : une
colonne recopiée d'un fichier brut ne s'y glisse pas en silence — c'est ainsi
que « Strasbourg » est sorti comme siège de BPCE.

Les contrôles MÉTIER (siège contredit, entité sortie non marquée, prix moyenné,
notre propre activité…) ne sont PAS ici : ils tournent côté API
(``checkCommercialBrief``), au seul endroit qui décide d'écrire.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Iso2 = Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]

PriceChannel = Literal["direct", "msp", "portage", "framework", "sector_reference"]
SiteKind = Literal["headquarters", "secondary", "industrial", "other"]
EntityStatus = Literal["active", "exited"]
EsnEvidenceLevel = Literal["confirmed", "observed", "hint"]
PersonRole = Literal["decision_maker", "manager", "contact", "external", "alumni"]


class _Closed(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Headquarters(_Closed):
    label: Text
    city: Text
    address: Text | None = None


class Kpi(_Closed):
    label: Text
    value: Text | float
    caption: Text | None = None


class KnowledgeRow(_Closed):
    rubric: Text
    known: Text
    meaning: Text


class ChartItem(_Closed):
    label: Text
    value: float


class Chart(_Closed):
    title: Text
    items: list[ChartItem]


class Entity(_Closed):
    name: Text
    nature: Text | None = None
    status: EntityStatus
    country: Iso2 | None = None
    note: Text | None = None
    reliability: Text | None = None


class Site(_Closed):
    name: Text
    city: Text
    country: Iso2
    kind: SiteKind
    why: Text | None = None
    reliability: Text | None = None


class Price(_Closed):
    label: Text
    amount_eur_per_day: float = Field(gt=0)
    channel: PriceChannel
    note: Text | None = None
    reliability: Text | None = None


class Esn(_Closed):
    name: Text
    evidence_level: EsnEvidenceLevel
    proof: Text
    perimeter: Text | None = None
    reliability: Text | None = None


class Person(_Closed):
    name: Text
    function: Text | None = None
    entity: Text | None = None
    department: Text | None = None
    manager: Text | None = None
    city: Text | None = None
    email: Text | None = None
    mobile: Text | None = None
    phone: Text | None = None
    linkedin: Text | None = None
    hook: Text | None = None
    role: PersonRole | None = None
    exited: bool | None = None
    reliability: Text | None = None


class Column(_Closed):
    key: Text
    label: Text


class Section(_Closed):
    key: Text
    title: Text
    columns: list[Column]
    rows: list[dict[str, str | float | bool | None]]


class Guardrail(_Closed):
    point: Text
    detail: Text


class CommercialBrief(_Closed):
    account_name: Text
    generated_at: Text
    scope: Literal["france", "suisse"]
    headquarters: Headquarters
    kpis: list[Kpi] = Field(max_length=6)
    what_i_know: list[KnowledgeRow] = Field(min_length=1)
    charts: list[Chart]
    entities: list[Entity]
    sites: list[Site]
    prices: list[Price]
    esn: list[Esn]
    people: list[Person]
    sections: list[Section]
    guardrails: list[Guardrail] = Field(min_length=1)


__all__ = ["CommercialBrief"]
