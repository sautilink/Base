import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './style.css';
const inter = Inter({ subsets: ['latin'] });
export const metadata = { title: 'SautiLink Base', description: 'Build smarter Telegram bots. For free.' };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body className={inter.className}>{children}</body></html>; }
