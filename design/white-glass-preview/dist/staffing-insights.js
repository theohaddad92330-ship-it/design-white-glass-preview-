const logos = {
  Altiver: 'altiver-industries.svg',
  Hélios: 'groupe-helios.svg',
  NovaSanté: 'novasante.svg',
};

const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function accountMark(name) {
  const image = logos[name];
  const initials = String(name).split(/[\s-]+/).map(part => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return image
    ? `<span class="client-mark" title="${safe(name)}"><img src="assets/client-logos/${image}" alt="${safe(name)}"></span>`
    : `<span class="client-mark client-mark--letters" title="${safe(name)}" aria-label="${safe(name)}">${safe(initials)}</span>`;
}

export function clientStack(names) {
  const visible = names.slice(0, 3);
  return `<span class="client-logo-stack" aria-label="Comptes : ${safe(visible.join(', '))}">${visible.map(accountMark).join('')}</span>`;
}

function coverageCard(b, options) {
  const { deals, owner, age, next, money, shortDate, dueISO } = options;
  const linked = deals.filter(deal => deal.bu === b.id);
  const blocked = linked.filter(deal => !owner(deal) || age(deal) >= 11);
  const priority = blocked[0] || linked[0];
  const covered = Math.max(0, b.needs - b.uncovered);
  const coverage = b.needs ? Math.round(covered / b.needs * 100) : null;
  return `<button type="button" class="bu-coverage-card" data-action="bu" data-id="${safe(b.id)}" aria-label="Voir les affaires, la capacité et les responsables de ${safe(b.name)}">
    <span class="bu-coverage-top"><span><strong>${safe(b.name)}</strong><small>${safe(b.city)} · ${money(b.signed)} signés / ${money(b.target)} visés</small></span>${clientStack(b.accounts || [])}</span>
    <span class="bu-coverage-values"><span><b>${b.uncovered}</b><small>besoin${b.uncovered > 1 ? 's' : ''} sans profil</small></span><span><b>${b.bench}</b><small>consultant${b.bench > 1 ? 's' : ''} disponible${b.bench > 1 ? 's' : ''}</small></span><span><b>${blocked.length}</b><small>affaire${blocked.length > 1 ? 's' : ''} à reprendre</small></span></span>
    <span class="bu-coverage-track" aria-label="${coverage === null ? 'Couverture non mesurée' : `${coverage} % des besoins avec profil`}"><i style="width:${coverage ?? 0}%"></i></span>
    <span class="bu-coverage-bottom"><span>${priority ? `${safe(priority.account)} · ${safe(next(priority))} · ${shortDate(dueISO(priority))}` : 'Aucune affaire ouverte dans cette BU'}</span><strong>Voir ${linked.length} affaire${linked.length > 1 ? 's' : ''}</strong></span>
  </button>`;
}

export function renderStaffingInsights(options) {
  const { rows, deals, owner, age, next, money, shortDate, dueISO } = options;
  if (!rows.length) return '<p class="body-copy">Aucune business unit dans ce périmètre.</p>';
  const ranked = [...rows].sort((a, b) => b.uncovered - a.uncovered || a.name.localeCompare(b.name));
  const first = ranked[0];
  const firstDeals = deals.filter(deal => deal.bu === first.id);
  const atRisk = firstDeals.filter(deal => !owner(deal) || age(deal) >= 11).length;
  const insight = `<div class="staffing-insight"><div><span class="eyebrow">À examiner en premier · ${safe(first.city)}</span><h3>${safe(first.name)} : ${first.uncovered} besoin${first.uncovered > 1 ? 's' : ''} sans profil</h3><p>${first.bench} consultant${first.bench > 1 ? 's' : ''} disponible${first.bench > 1 ? 's' : ''} · ${atRisk} affaire${atRisk > 1 ? 's' : ''} sans responsable ou sans échange récent. Vérifiez les dossiers avant de proposer un profil.</p></div><button class="btn btn-quiet" type="button" data-action="bu" data-id="${safe(first.id)}">Voir les dossiers</button></div>`;
  const cardOptions = { deals, owner, age, next, money, shortDate, dueISO };
  return `${insight}<div class="bu-coverage-grid">${ranked.slice(0, 4).map(b => coverageCard(b, cardOptions)).join('')}</div>${ranked.length > 4 ? `<details class="progressive-list bu-coverage-more"><summary>Voir les ${ranked.length - 4} autres BU</summary><div class="bu-coverage-grid">${ranked.slice(4).map(b => coverageCard(b, cardOptions)).join('')}</div></details>` : ''}<p class="panel-footnote">Couverture = besoins avec profil / besoins ouverts. Disponibilité et compatibilité d’un consultant restent à vérifier sur chaque dossier.</p>`;
}

export function renderBuLinkedDeals({ b, deals, owner, age, next, money, shortDate, dueISO, member }) {
  if (!deals.length) return '<p class="body-copy">Aucune affaire accessible dans cette BU.</p>';
  const ranked = [...deals].sort((a, c) => Number(!owner(c) || age(c) >= 11) - Number(!owner(a) || age(a) >= 11));
  return `<div class="bu-linked-deals">${ranked.map(deal => `<button class="drawer-deal" type="button" data-action="deal" data-id="${safe(deal.id)}"><span class="bu-linked-account">${accountMark(deal.account)}<span><strong>${safe(deal.account)} · ${safe(deal.need)}</strong><small>${owner(deal) ? safe(member(owner(deal))?.name) : 'Responsable à nommer'} · ${safe(next(deal))} · ${shortDate(dueISO(deal))}</small></span></span><b>${money(deal.amount)}</b></button>`).join('')}</div>`;
}
