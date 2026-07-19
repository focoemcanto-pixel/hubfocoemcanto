/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  productionBrowserSourceMaps: false,
  experimental: {
    optimizePackageImports: ['lucide-react']
  },
  async redirects() {
    return [
      {
        source: '/aluno/:path*',
        destination: '/login',
        permanent: false,
        missing: [{ type: 'cookie', key: 'hub_access_email' }]
      },
      {
        source: '/admin/:path*',
        destination: '/login',
        permanent: false,
        missing: [{ type: 'cookie', key: 'hub_access_email' }]
      }
    ];
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'drive.google.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }
    ]
  }
};

export default nextConfig;
