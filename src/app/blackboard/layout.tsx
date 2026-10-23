import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "班級電子黑板 · Keichi",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
