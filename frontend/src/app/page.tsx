import { redirect } from 'next/navigation';

/** The CRM has no landing page of its own; the dashboard is the front door. */
export default function Home() {
  redirect('/dashboard');
}
