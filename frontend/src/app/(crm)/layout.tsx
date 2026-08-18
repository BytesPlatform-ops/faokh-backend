import { CrmShell } from '@/components/shell/CrmShell';

/**
 * Every authenticated CRM screen shares this shell.
 *
 * A route group rather than a path segment, so URLs stay clean (`/dashboard`,
 * not `/crm/dashboard`) while the navigation, session and layout live in one
 * place.
 */
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <CrmShell>{children}</CrmShell>;
}
