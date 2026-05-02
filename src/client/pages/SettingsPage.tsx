import { Settings, Server, Bell, Info } from "lucide-react";

interface SettingsPageProps {
  projects: string[];
  servicesCount: number;
}

export function SettingsPage({ projects, servicesCount }: SettingsPageProps) {
  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Settings size={24} className="text-cyan-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Settings</h1>
            <p className="text-sm text-slate-500">Application configuration</p>
          </div>
        </div>

        {/* General */}
        <section className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Info size={16} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">General</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-900/50 rounded-lg p-3">
              <span className="text-slate-500 block text-xs mb-1">Version</span>
              <span className="text-slate-200 font-mono">v0.0.1</span>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3">
              <span className="text-slate-500 block text-xs mb-1">Mode</span>
              <span className="text-slate-200 font-mono">Single Host</span>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3">
              <span className="text-slate-500 block text-xs mb-1">Projects</span>
              <span className="text-slate-200 font-mono">{projects.length}</span>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3">
              <span className="text-slate-500 block text-xs mb-1">Containers</span>
              <span className="text-slate-200 font-mono">{servicesCount}</span>
            </div>
          </div>
        </section>

        {/* Docker Hosts */}
        <section className="bg-slate-800/30 border border-dashed border-slate-700/60 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Server size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Docker Hosts</h2>
          </div>
          <p className="text-sm text-slate-500">Multi-host management — coming soon</p>
          <p className="text-xs text-slate-600 mt-1">Connect to remote Docker daemons and manage multiple hosts from a single dashboard.</p>
        </section>

        {/* Notifications */}
        <section className="bg-slate-800/30 border border-dashed border-slate-700/60 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Notifications</h2>
          </div>
          <p className="text-sm text-slate-500">Webhook & email notifications — coming soon</p>
          <p className="text-xs text-slate-600 mt-1">Configure Slack, Discord, or email alerts for container events and health checks.</p>
        </section>
      </div>
    </div>
  );
}
