import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function BuilderLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect('/login')
  return <>{children}</>
} 