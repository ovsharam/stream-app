import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase/server'
import { getDb } from '@/lib/db'
import { organizations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createUserProfile, getUserOrg } from '@/lib/db/cases'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user?.id || !user.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = (await req.json()) as { name?: string }
    const name = String(body.name ?? '').trim()
    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Workspace name must be at least 2 characters' }, { status: 400 })
    }
    if (name.length > 80) {
      return NextResponse.json({ error: 'Workspace name too long' }, { status: 400 })
    }

    // If user already has an org, just return it
    const existing = await getUserOrg(user.id)
    if (existing) {
      return NextResponse.json({ ok: true, orgId: existing.orgId })
    }

    const db = getDb()

    // Generate a unique slug
    let slug = slugify(name)
    const [conflict] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1)

    if (conflict) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`
    }

    // Create org
    const [org] = await db
      .insert(organizations)
      .values({ name, slug, plan: 'free' })
      .returning()

    // Create user profile linked to this org (admin role for the founder)
    await createUserProfile({
      id: user.id,
      orgId: org.id,
      email: user.email,
      name: (user.user_metadata?.full_name as string | undefined) ?? undefined,
      role: 'admin',
    })

    return NextResponse.json({ ok: true, org: { id: org.id, name: org.name, slug: org.slug } })
  } catch (err) {
    console.error('[onboarding] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
