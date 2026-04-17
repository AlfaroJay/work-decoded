import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Work Decoded — Book a Consultation',
  description: 'Schedule your confidential workplace consultation with Work Decoded.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-wd-cream">
        {children}
      </body>
    </html>
  )
}
