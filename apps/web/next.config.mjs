/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" }
      ]
    }];
  },
  async redirects() {
    return [{
      source: '/:path*',
      has: [{ type: 'host', value: 'www.base.sautilink.com' }],
      destination: 'https://base.sautilink.com/:path*',
      permanent: true
    }];
  }
};
export default nextConfig;
