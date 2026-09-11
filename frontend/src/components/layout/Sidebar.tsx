import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, MessageSquare, GitBranch,
  ShieldCheck, Database, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Overview', exact: true },
  { to: '/data', icon: Database, label: 'Data' },
  { to: '/chat', icon: MessageSquare, label: 'Intelligence' },
  { to: '/graph', icon: GitBranch, label: 'Graph' },
  { to: '/security', icon: ShieldCheck, label: 'Security' },
];

export function Sidebar() {
  return (
    <aside className="w-[220px] flex-shrink-0 flex flex-col h-full bg-[#080b14] border-r border-white/[0.06]">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 rounded-lg bg-accent-600/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-accent-400" />
            </div>
            <div className="absolute inset-0 rounded-lg ring-1 ring-accent-500/30" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white tracking-tight">
              DATA SENTINEL
            </div>
            <div className="text-[10px] text-white/35 tracking-wider uppercase mt-0.5">
              Intelligence Platform
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <div className="text-[10px] text-white/25 tracking-widest uppercase px-3 mb-3">
          Navigation
        </div>
        {NAV_ITEMS.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
                isActive
                  ? 'bg-accent-600/15 text-accent-300 font-medium'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-accent-400' : '')} />
                <span>{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="ml-auto w-1 h-1 rounded-full bg-accent-400"
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/[0.06]">
        <div className="text-[10px] text-white/30 leading-relaxed font-mono">
          Self-Observing.<br />
          Self-Verifying.<br />
          Graph-Powered.
        </div>
      </div>
    </aside>
  );
}
