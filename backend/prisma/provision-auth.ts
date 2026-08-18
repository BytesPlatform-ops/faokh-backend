/**
 * Provisions Supabase Auth identities for the seeded CRM users.
 *
 * The CRM is the authority on who exists and what they may do; Supabase Auth is
 * only the thing that proves a person is who they say they are. So this script
 * walks the `users` table and gives each row an auth identity, rather than the
 * other way round — a Supabase account with no CRM user is rejected at the
 * guard, deliberately, and creating one here would defeat that.
 *
 * Idempotent. Re-running finds the existing auth user by email, relinks it and
 * leaves the password alone.
 *
 *   pnpm exec tsx prisma/provision-auth.ts              # link only
 *   pnpm exec tsx prisma/provision-auth.ts --reset-passwords
 *
 * Passwords are printed exactly once, at creation. They are not stored anywhere
 * — if one is lost, re-run with --reset-passwords or use the Supabase
 * dashboard. Emails are all `@foakh.local`, which cannot receive mail, so no
 * real person is ever contacted by a development environment.
 */

import { randomBytes } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const RESET_PASSWORDS = process.argv.includes('--reset-passwords');

interface AuthUser {
  id: string;
  email: string;
}

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      salesAgent: { select: { salesAgentCode: true } },
      roles: { include: { role: { select: { name: true } } } },
    },
  });

  if (users.length === 0) {
    throw new Error('No CRM users found. Run `pnpm exec tsx prisma/seed.ts` first.');
  }

  const existing = await listAuthUsers();
  const byEmail = new Map(existing.map((user) => [user.email.toLowerCase(), user]));

  const created: { email: string; password: string; roles: string; agentCode: string }[] = [];
  const linked: string[] = [];

  for (const user of users) {
    const email = user.email.toLowerCase();
    const roles = user.roles.map((entry) => entry.role.name).join(', ');
    const agentCode = user.salesAgent?.salesAgentCode ?? '—';

    let authUser = byEmail.get(email);
    let password: string | null = null;

    if (authUser === undefined) {
      password = generatePassword();
      authUser = await createAuthUser(email, password);
      created.push({ email, password, roles, agentCode });
    } else if (RESET_PASSWORDS) {
      password = generatePassword();
      await updatePassword(authUser.id, password);
      created.push({ email, password, roles, agentCode });
    } else {
      linked.push(email);
    }

    // The link is what the guard resolves on every request: Supabase `sub` →
    // CRM user → role and broker scope. Rewritten every run so a manually
    // recreated auth account cannot leave a user unable to sign in.
    await prisma.user.update({
      where: { id: user.id },
      data: { supabaseUserId: authUser.id },
    });
  }

  report(created, linked);
}

async function listAuthUsers(): Promise<AuthUser[]> {
  const all: AuthUser[] = [];

  // The admin listing is paged, and a project with more accounts than fit on
  // one page would otherwise silently look like it had none.
  for (let page = 1; ; page += 1) {
    const response = await authFetch(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const body = (await response.json()) as { users?: AuthUser[] };
    const batch = body.users ?? [];
    all.push(...batch);
    if (batch.length < 200) break;
  }

  return all;
}

async function createAuthUser(email: string, password: string): Promise<AuthUser> {
  const response = await authFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      // Confirmed on creation: these addresses cannot receive mail, so waiting
      // for a confirmation link would leave every account permanently unusable.
      email_confirm: true,
    }),
  });

  return (await response.json()) as AuthUser;
}

async function updatePassword(id: string, password: string): Promise<void> {
  await authFetch(`/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  });
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase admin ${path} failed: ${response.status} ${await response.text()}`);
  }

  return response;
}

/** 24 random bytes, base64url. Long enough that nobody is tempted to reuse it. */
function generatePassword(): string {
  return randomBytes(24).toString('base64url');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not set. It belongs in backend/.env, never in frontend code.`);
  }
  return value.trim();
}

function report(
  created: { email: string; password: string; roles: string; agentCode: string }[],
  linked: string[],
): void {
  console.log('\nSupabase Auth provisioning\n');

  if (created.length > 0) {
    console.log('  Credentials — shown once, not stored anywhere:\n');
    for (const entry of created) {
      console.log(`    ${entry.email}`);
      console.log(`      password  ${entry.password}`);
      console.log(`      roles     ${entry.roles}`);
      console.log(`      agent     ${entry.agentCode}\n`);
    }
  }

  if (linked.length > 0) {
    console.log(`  Already provisioned, link refreshed (password unchanged):`);
    for (const email of linked) console.log(`    ${email}`);
    console.log('\n  Re-run with --reset-passwords to issue new ones.');
  }

  console.log('\n  These addresses are @foakh.local and cannot receive mail.');
  console.log('  Roles and broker scope come from the CRM database, never from the token.\n');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
