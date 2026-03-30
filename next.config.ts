import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  // Required for static export with App Router
  trailingSlash: false,
  // Disable image optimization (not supported in static export)
  images: {
    unoptimized: true,
  },
  // Ensure assets resolve correctly when loaded via file:// in Electron
  assetPrefix: process.env.NODE_ENV === 'production' ? '.' : undefined,
};

export default nextConfig;
