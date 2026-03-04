import { ReactNode } from 'react'
import Link from 'next/link'

interface RootLayoutProps {
  readonly children: ReactNode
}

export function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900">
        <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 md:grid-cols-[260px_1fr]">
          <aside className="border-r border-slate-200 bg-white p-6">
            <h1 className="mb-6 text-xl font-semibold">Agent Empire</h1>
            <nav className="flex flex-col gap-3 text-sm">
              <Link href="/" className="rounded px-3 py-2 hover:bg-slate-100">
                Overview
              </Link>
              <Link href="/agents" className="rounded px-3 py-2 hover:bg-slate-100">
                Agents
              </Link>
              <Link href="/businesses" className="rounded px-3 py-2 hover:bg-slate-100">
                Businesses
              </Link>
            </nav>
          </aside>
          <main className="p-6">{children}</main>
        </div>
      </body>
    </html>
  )
}
