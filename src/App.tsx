import { useEffect, useState } from 'react'
import {
  ShieldCheck,
  Database,
  Terminal,
  Cpu,
  RefreshCw,
  FolderOpen,
  Settings,
  User,
  Gamepad2,
  Box,
  Layers,
  CheckCircle2,
  Play,
  Copy,
} from 'lucide-react'
import { commands, type LaunchReceipt } from './bindings'

export function App() {
  const [version, setVersion] = useState<string>('...')
  const [inputName, setInputName] = useState<string>('Steve')
  const [computedUuid, setComputedUuid] = useState<string>('')
  const [isComputing, setIsComputing] = useState(false)
  const [receipt, setReceipt] = useState<LaunchReceipt | null>(null)
  const [activeTab, setActiveTab] = useState<'instances' | 'dry-run' | 'test-uuid' | 'architecture' | 'settings'>('instances')

  const handleComputeUuid = async (name: string) => {
    setIsComputing(true)
    try {
      const res = await commands.getOfflineUuid(name)
      setComputedUuid(res)
    } catch (err) {
      console.error(err)
    } finally {
      setIsComputing(false)
    }
  }

  const handleDryRun = async (gameVer: string, name: string) => {
    try {
      const res = await commands.getLaunchReceipt(gameVer, name)
      if (res.status === 'ok') {
        setReceipt(res.data)
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    commands.getLauncherVersion().then(setVersion).catch(() => setVersion('0.1.0'))
    handleComputeUuid('Steve')
    handleDryRun('1.20.4', 'Steve')
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100 antialiased font-sans select-none">
      {/* Top Custom Title Bar */}
      <header
        data-tauri-drag-region
        className="flex h-11 w-full items-center justify-between border-b border-zinc-800/80 bg-zinc-900/60 px-4 backdrop-blur-md"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-xs font-bold text-white shadow-md shadow-violet-900/20">
            Æ
          </div>
          <span className="font-semibold tracking-tight text-sm text-zinc-100">
            Aethel Launcher
          </span>
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-400 border border-violet-500/20">
            v{version} (Phase M0)
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5 rounded-md bg-zinc-800/60 px-2 py-1 text-[11px] text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            MSVC & SQLite WAL
          </span>
        </div>
      </header>

      {/* App Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-56 flex-col justify-between border-r border-zinc-800/60 bg-zinc-900/30 p-3">
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => setActiveTab('instances')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                activeTab === 'instances'
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-900/40'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <Gamepad2 className="h-4 w-4" />
              <span>Instances</span>
            </button>

            <button
              onClick={() => setActiveTab('dry-run')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                activeTab === 'dry-run'
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-900/40'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <Terminal className="h-4 w-4" />
              <span>Launch Synthesizer</span>
            </button>

            <button
              onClick={() => setActiveTab('test-uuid')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                activeTab === 'test-uuid'
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-900/40'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Offline UUID (JVM)</span>
            </button>

            <button
              onClick={() => setActiveTab('architecture')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                activeTab === 'architecture'
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-900/40'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>9-Crate Architecture</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-900/40'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </button>
          </nav>

          {/* Account status widget */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400">
                <User className="h-4 w-4" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-medium text-zinc-200 truncate">Offline Account</span>
                <span className="text-[10px] text-zinc-500">M0 Identity Ready</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === 'instances' && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-zinc-100">Minecraft Instances</h1>
                  <p className="text-xs text-zinc-400">
                    High-performance, clean-room launcher engine powered by Rust and Tauri v2.
                  </p>
                </div>
                <button className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white shadow-md shadow-violet-900/30 hover:bg-violet-500 transition-colors">
                  <Box className="h-3.5 w-3.5" />
                  <span>Create Instance</span>
                </button>
              </div>

              {/* Empty state instance view */}
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800/90 bg-zinc-900/20 p-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/50 text-zinc-400 mb-3 border border-zinc-700/40">
                  <Gamepad2 className="h-6 w-6 text-violet-400" />
                </div>
                <h3 className="text-sm font-medium text-zinc-200">No instances created yet</h3>
                <p className="mt-1 max-w-sm text-xs text-zinc-500">
                  Phase M0 workspace scaffolding is complete. Next milestone (M1/M2) implements Mojang Version Manifest parsing, assets download, and launch command synthesis.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'dry-run' && (
            <div className="flex flex-col gap-6 max-w-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-zinc-100">Launch Command Synthesizer (Dry Run)</h1>
                  <p className="text-xs text-zinc-400">
                    Generates complete command line, arguments, and environment with the 4-tier classpath ladder.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDryRun('1.20.4', inputName)}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 transition-colors"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Synthesize 1.20.4</span>
                  </button>
                </div>
              </div>

              {receipt && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
                      <span className="text-[11px] text-zinc-500 font-medium">Classpath Strategy:</span>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-mono font-semibold text-emerald-400 border border-emerald-500/20">
                          {receipt.classpath_tier}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
                      <span className="text-[11px] text-zinc-500 font-medium">JVM Executable:</span>
                      <div className="mt-1 font-mono text-xs text-zinc-300 truncate">
                        {receipt.command}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-300">
                        Synthesized Arguments ({receipt.arguments.length} tokens):
                      </span>
                      <button
                        onClick={() => navigator.clipboard?.writeText(receipt.arguments.join(' '))}
                        className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                        <span>Copy All</span>
                      </button>
                    </div>

                    <div className="max-h-72 overflow-y-auto rounded-lg bg-zinc-950 p-3 border border-zinc-800/80 font-mono text-[11px] text-zinc-300 space-y-1 select-text">
                      {receipt.arguments.map((arg, idx) => (
                        <div key={idx} className="hover:bg-zinc-900/60 px-1 py-0.5 rounded">
                          <span className="text-zinc-600 mr-2 select-none">{idx + 1}</span>
                          <span className={arg.startsWith('-') ? 'text-violet-400' : arg.startsWith('net.minecraft') ? 'text-emerald-400 font-semibold' : 'text-zinc-300'}>
                            {arg}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'test-uuid' && (
            <div className="flex flex-col gap-6 max-w-2xl">
              <div>
                <h1 className="text-lg font-semibold text-zinc-100">Deterministic Offline UUID Verifier</h1>
                <p className="text-xs text-zinc-400">
                  Strictly conforms to OpenJDK&apos;s <code className="text-violet-300 font-mono">UUID.nameUUIDFromBytes</code> algorithm. Tested and verified on OpenJDK 17 and Oracle JRE 8.
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-300">Player Nickname (Case-Sensitive):</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inputName}
                      onChange={(e) => setInputName(e.target.value)}
                      className="flex-1 rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
                      placeholder="e.g. Steve, Alex, Иван"
                    />
                    <button
                      onClick={() => handleComputeUuid(inputName)}
                      disabled={isComputing}
                      className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isComputing ? 'animate-spin' : ''}`} />
                      <span>Compute</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 rounded-lg bg-zinc-950/80 p-3 border border-zinc-800/80">
                  <span className="text-[11px] text-zinc-500">Calculated UUID:</span>
                  <span className="font-mono text-xs font-semibold text-violet-300 select-all">
                    {computedUuid || 'Computing...'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {['Steve', 'steve', 'Alex', 'alex', 'Notch', 'Player', 'Иван'].map((name) => (
                    <button
                      key={name}
                      onClick={() => {
                        setInputName(name)
                        handleComputeUuid(name)
                      }}
                      className="rounded-md bg-zinc-800/80 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5" />
                  <div className="text-xs text-zinc-300">
                    <span className="font-medium text-emerald-300">CI & JVM Verified: </span>
                    Both OpenJDK 17 and JRE 8 produce identical UUIDs. Non-ASCII names like <code className="text-emerald-200">Иван</code> are encoded in standard UTF-8. Registry case preservation ensures <code className="text-emerald-200">Steve ≠ steve</code>.
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'architecture' && (
            <div className="flex flex-col gap-4 max-w-3xl">
              <div>
                <h1 className="text-lg font-semibold text-zinc-100">9-Crate Rust Workspace Architecture</h1>
                <p className="text-xs text-zinc-400">
                  Strict modular separation ensuring minimal compile times, no cyclic dependencies, and rock-solid testability.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: 'aethel-core', role: 'Data models, error codes, events, hash types', icon: Box },
                  { name: 'aethel-auth', role: 'MS OAuth & JVM-verified Offline UUID', icon: ShieldCheck },
                  { name: 'aethel-storage', role: 'SQLite WAL mode & schema migrations', icon: Database },
                  { name: 'aethel-manifest', role: 'Mojang version manifest & rule engine', icon: Layers },
                  { name: 'aethel-download', role: 'High-speed download engine with hash checks', icon: RefreshCw },
                  { name: 'aethel-java', role: 'JDK detector & Adoptium runtime manager', icon: Cpu },
                  { name: 'aethel-modding', role: 'Fabric, NeoForge, Quilt loader resolvers', icon: FolderOpen },
                  { name: 'aethel-launch', role: 'Process builder & Windows @argfile ladder', icon: Terminal },
                  { name: 'aethel-tauri', role: 'Tauri v2 commands & Specta bridge', icon: Gamepad2 },
                ].map((c) => (
                  <div key={c.name} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3.5 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <c.icon className="h-4 w-4 text-violet-400" />
                      <span className="font-mono text-xs font-semibold text-zinc-200">{c.name}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug">{c.role}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="flex flex-col gap-4 max-w-xl">
              <h1 className="text-lg font-semibold text-zinc-100">Launcher Settings</h1>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-3 text-xs text-zinc-400">
                <p>Configured for Tauri v2 with native WebView2 integration and single-instance protection.</p>
                <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3">
                  <span>Updater Public Key</span>
                  <span className="font-mono text-[10px] text-zinc-300">dW50cnVzdGVk...</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App

