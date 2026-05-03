import { redirect } from 'next/navigation';

// The root path is deprecated — the canonical intake form lives at /book
// (served from public/intake-form.html via Netlify's _redirects file).
// This server-side redirect runs on every request to / and sends the user
// straight to the maintained HTML form.
export default function Home() {
  redirect('/book');
}
