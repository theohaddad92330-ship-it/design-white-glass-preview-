const CONTACTS = [
  { initials: 'JP', name: 'Jean-Pierre M.', role: 'DSI', badge: 'Sponsor' },
  { initials: 'AL', name: 'Anne L.', role: 'RSSI', badge: 'Champion' },
  { initials: 'RB', name: 'Romain B.', role: 'CDO', badge: 'Décideur' },
]

export function ContactsMockup() {
  return (
    <div className="rounded-2xl p-5 bg-[#111118] border border-white/[0.06]">
      <div className="text-xs uppercase tracking-wider mb-3 text-zinc-500">Contacts décisionnels</div>
      <div className="space-y-2.5">
        {CONTACTS.map(c => (
          <div
            key={c.initials}
            className="flex items-center gap-3 rounded-lg p-2.5 bg-[#1A1A24] border border-white/[0.06]"
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 bg-gradient-to-br from-violet-600 to-indigo-600">
              {c.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white">{c.name}</div>
              <div className="text-xs text-zinc-500">{c.role}</div>
            </div>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-violet-600/15 text-violet-300 border border-violet-600/20">
              {c.badge}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
