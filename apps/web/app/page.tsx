import Link from 'next/link';

export default function Home() {
  return <main><section className="card">
    <span className="eyebrow">SAUTILINK BASE</span>
    <h1>Build smarter bots.<br />For free.</h1>
    <p>Create and manage Telegram bots, commands and keyword replies from one simple dashboard.
      All features are free.</p>
    <div className="inline-actions" style={{ marginTop: 24 }}>
      <Link href="/login" className="primary-link">Sign in to get started</Link>
      <Link href="/dashboard" className="secondary-link">Open dashboard</Link>
    </div>
    <p className="notice" style={{ marginTop: 24 }}>Preview version: commands and replies can be configured once the Base API is connected.
      Telegram delivery is not active yet.</p>
  </section></main>;
}
