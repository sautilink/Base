/** @type {import('next').NextConfig} */
const nextConfig = {
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
