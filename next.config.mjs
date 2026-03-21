/** @type {import('next').NextConfig} */
const nextConfig = {
  // Default output is `.next` — required for Vercel’s Next.js builder and typical Turborepo caches.
  // Do not set distDir to `dist` unless you override Vercel’s output directory to match.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
