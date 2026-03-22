/**
 * Admin routes need a normal document scroll (stats + TAN News). No overflow clipping here.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="w-full min-h-screen bg-background overflow-visible">{children}</div>;
}
