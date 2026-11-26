// Shared in-page sub-tab bar for the consolidated backoffice screens (Clients,
// Facturation…). Server component — the tabs are plain links that carry a `view`
// query param, so switching stays server-rendered (no client JS). Styled like the
// state tabs on the queue viewer for visual consistency.

type SubTab = { label: string; href: string; active: boolean }

export function SubTabs({ tabs }: { tabs: SubTab[] }) {
  return (
    <nav
      style={{
        display: 'flex',
        gap: 4,
        flexWrap: 'wrap',
        margin: '4px 0 20px',
        borderBottom: '1px solid color-mix(in srgb, var(--text) 12%, transparent)',
      }}
    >
      {tabs.map(t => (
        <a
          key={t.href}
          href={t.href}
          className="link-muted"
          style={{
            padding: '8px 14px',
            fontSize: 14,
            fontWeight: t.active ? 700 : 400,
            color: t.active ? 'var(--text)' : 'var(--muted)',
            borderBottom: t.active ? '2px solid var(--text)' : '2px solid transparent',
            marginBottom: -1,
          }}
        >
          {t.label}
        </a>
      ))}
    </nav>
  )
}
