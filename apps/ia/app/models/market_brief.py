"""``MarketBrief`` côté Python — miroir pydantic du contrat partagé (marchés locaux, L0).

Source de vérité : ``packages/contracts/src/schemas/market-brief.ts`` (zod),
copiée en JSON Schema dans ``app/contracts/schemas/market-brief.schema.json``.
Ce modèle ne la remplace pas : la sortie du modèle de langage se valide contre
LE JSON Schema (la même pièce que lit le TypeScript) PUIS contre ce modèle, et
``tests/test_market_brief.py`` tient la parité des clés entre les deux.

Contrat FERMÉ (``extra="forbid"``) partout, comme le ``.strict()`` zod. La zone
est raffinée comme côté zod : france ⇒ au moins un département et aucun canton ;
suisse ⇒ l'inverse — jamais mêlés.

Les contrôles MÉTIER (France et Suisse mêlées, devise, cellule de prix
sous-échantillonnée, grille concentrée, couverture lue comme un fait de marché,
probabilité) ne sont PAS ici : ils tournent côté API (``checkMarketBrief``), au
seul endroit qui décide d'écrire. Les personnes sont en clair, avec leur employeur.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models.commercial_brief import Chart, Esn, Guardrail, KnowledgeRow, Kpi, Person, Section, Text

Count = Annotated[int, Field(ge=0)]
DepartmentCode = Annotated[str, StringConstraints(pattern=r"^(\d{2,3}|2[AB])$")]
CantonCode = Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]

MarketScope = Literal["france", "suisse"]
Currency = Literal["EUR", "CHF"]
PriceSourceKind = Literal["own_needs_missions", "observed_public", "provided_file"]


class _Closed(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Zone(_Closed):
    label: Text
    scope: MarketScope
    departments: list[DepartmentCode]
    cantons: list[CantonCode]
    cities: list[Text]

    @model_validator(mode="after")
    def _never_mixed(self) -> Zone:
        if self.scope == "france":
            if not self.departments or self.cantons:
                raise ValueError("une zone france porte au moins un département et aucun canton")
        elif not self.cantons or self.departments:
            raise ValueError("une zone suisse porte au moins un canton et aucun département")
        return self


class PriceCell(_Closed):
    amount: float = Field(gt=0)
    n: Count


class PriceRange(_Closed):
    min: float = Field(gt=0)
    max: float = Field(gt=0)


class PriceRow(_Closed):
    family: Text
    needs: Count
    median: float = Field(gt=0)
    junior: PriceCell | None = None
    confirmed: PriceCell | None = None
    senior: PriceCell | None = None
    range: PriceRange | None = None


class TopClient(_Closed):
    name: Text
    n: Count


class PriceGrid(_Closed):
    currency: Currency
    period: Text
    sample_size: Count
    source_kind: PriceSourceKind
    top_client: TopClient | None = None
    rows: list[PriceRow]


class PriceTrend(_Closed):
    year: int
    needs: Count
    median: float = Field(gt=0)


class Client(_Closed):
    name: Text
    sector: Text | None = None
    size: Text | None = None
    profiles: Count | None = None
    externals: Count | None = None
    cities: list[Text]
    families: Text | None = None
    reading: Text | None = None


class GroupMember(_Closed):
    name: Text
    profiles: Count | None = None
    externals: Count | None = None
    needs: Count | None = None


class Group(_Closed):
    name: Text
    note: Text | None = None
    members: list[GroupMember]


class CalendarEntry(_Closed):
    label: Text
    actors: Text | None = None
    when: Text
    detail: Text | None = None
    source: Text | None = None


class Rule(_Closed):
    rule: Text
    regime: Text | None = None
    known: Text
    meaning: Text


class MarketBrief(_Closed):
    zone: Zone
    generated_at: Text
    kpis: list[Kpi] = Field(max_length=6)
    what_i_know: list[KnowledgeRow] = Field(min_length=1)
    charts: list[Chart]
    esn: list[Esn]
    people: list[Person]
    sections: list[Section]
    guardrails: list[Guardrail] = Field(min_length=1)
    price_grid: PriceGrid | None = None
    price_trend: list[PriceTrend] | None = None
    clients: list[Client] | None = None
    groups: list[Group] | None = None
    calendar: list[CalendarEntry] | None = None
    rules: list[Rule] | None = None


__all__ = ["MarketBrief"]
