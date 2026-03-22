/**
 * Thin passthrough — scroll and height are handled by PageTransition’s admin branch.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
