"use client"

import { Plus, LayoutGrid, Search, Settings, User, History, KeyRound, Folder, LogOut, Check, Pencil, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DashboardPage() {
  const router = useRouter()
  const [flows, setFlows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [createLoading, setCreateLoading] = useState(false)
  const [renameLoading, setRenameLoading] = useState<string | null>(null)
  const [cardLoadingId, setCardLoadingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        setIsAuthenticated(false)
        return
      }
      setIsAuthenticated(true)
      const { data, error } = await supabase
        .from('flows')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
      if (!error && data) setFlows(data)
      setLoading(false)
    }
    checkAuth()
  }, [])

  const handleCreateFlow = async () => {
    setCreateLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCreateLoading(false); return }
    const { data, error } = await supabase
      .from('flows')
      .insert({
        user_id: user.id,
        name: 'Untitled Flow',
        description: '',
        graph_json: { nodes: [], edges: [] }
      })
      .select('id')
      .single()
    setCreateLoading(false)
    if (!error && data?.id) {
      router.push(`/builder/${data.id}`)
    }
  }

  const handleRename = async (flowId: string, newName: string) => {
    setRenameLoading(flowId)
    const supabase = createClient()
    await supabase.from('flows').update({ name: newName }).eq('id', flowId)
    setFlows(flows => flows.map(f => f.id === flowId ? { ...f, name: newName } : f))
    setEditingId(null)
    setRenameLoading(null)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  if (isAuthenticated === null) return null
  if (isAuthenticated === false) return null

  return (
    <div className="relative min-h-screen bg-black flex flex-col">
      <main className="flex-1 flex flex-col px-10 py-8 gap-6">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Dashboard</h1>
            <div className="text-zinc-400 text-sm">All Flows</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCreateFlow} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-semibold shadow hover:bg-primary/90 transition hover:scale-105 hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed" disabled={createLoading}>
              {createLoading ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
              {createLoading ? 'Creating...' : 'Create Flow'}
            </button>
          </div>
        </header>
        <div className="flex items-center gap-3 mb-4">
          <button
            className="p-2 rounded-lg bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700 transition hover:scale-105 hover:shadow-xl"
            onClick={() => {}}
          >
            <LayoutGrid size={18} />
          </button>
          <input
            type="text"
            placeholder="Search flows"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {loading ? (
            <div className="text-zinc-400">Loading...</div>
          ) : flows.filter(flow =>
              flow.name.toLowerCase().includes(search.toLowerCase()) ||
              flow.description?.toLowerCase().includes(search.toLowerCase())
            ).length > 0 ? (
            flows.filter(flow =>
              flow.name.toLowerCase().includes(search.toLowerCase()) ||
              flow.description?.toLowerCase().includes(search.toLowerCase())
            ).map(flow => (
              <div key={flow.id} className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-6 flex flex-col gap-2 shadow-lg hover:shadow-xl transition group cursor-pointer relative"
                onClick={() => {
                  setCardLoadingId(flow.id)
                  router.push(`/builder/${flow.id}`)
                }}>
                {cardLoadingId === flow.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 rounded-2xl">
                    <Loader2 className="animate-spin" size={32} />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <LayoutGrid size={20} className="text-primary" />
                  {editingId === flow.id ? (
                    <form onSubmit={e => { e.preventDefault(); handleRename(flow.id, editValue) }} className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => handleRename(flow.id, editValue)}
                        className="text-lg font-semibold bg-transparent border-b border-primary text-white focus:outline-none px-1 w-32"
                      />
                      <button type="submit" className="ml-1 p-1 rounded hover:bg-primary/20 transition disabled:opacity-60 disabled:cursor-not-allowed" disabled={renameLoading === flow.id}>
                        {renameLoading === flow.id ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                      </button>
                    </form>
                  ) : (
                    <span
                      className="text-lg font-semibold text-white group-hover:text-grey transition cursor-pointer flex items-center gap-1"
                      onClick={e => { e.stopPropagation(); setEditingId(flow.id); setEditValue(flow.name) }}
                    >
                      {flow.name}
                      <Pencil size={14} className="ml-1 opacity-60 group-hover:opacity-100" />
                    </span>
                  )}
                </div>
                <div className="text-zinc-400 text-sm mb-1">{flow.description}</div>
                <div className="flex items-center gap-2 mt-auto text-xs text-zinc-500">
                  <span>Edited {flow.updated_at ? new Date(flow.updated_at).toLocaleString() : ''}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-96 bg-gradient-to-br from-primary/60 to-gray-700/60 rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold text-white mb-2">Getting started with AgentFlow</h2>
              <button onClick={handleCreateFlow} className="mt-4 px-6 py-2 bg-primary text-white rounded-lg font-semibold shadow hover:bg-primary/90 transition hover:scale-105 hover:shadow-xl">Start learning</button>
            </div>
          )}
        </section>
      </main>
      <div className="fixed bottom-0 left-0 m-6 flex items-center gap-2 z-50">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/70">
          <User size={18} className="text-zinc-400" />
          <span className="text-zinc-200 font-medium">User</span>
          <LogOut size={16} className="ml-auto text-zinc-500 cursor-pointer hover:text-primary transition" onClick={handleLogout} />
        </div>
      </div>
    </div>
  )
} 