import { NavLink } from 'react-router-dom';

const links = [
  { to: '/app', label: 'Tasks', icon: '>' },
  { to: '/app/profiles', label: 'MCP Profiles', icon: '#' },
  { to: '/app/health', label: 'Health', icon: '+' },
];

export function Sidebar() {
  return (
    <aside className="w-56 bg-gray-900 text-gray-300 min-h-screen flex flex-col">
      <div className="px-4 py-5 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white tracking-tight">Claude Swarm</h1>
        <p className="text-xs text-gray-500 mt-0.5">Dashboard</p>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/app'}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span className="text-xs font-mono w-4">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
