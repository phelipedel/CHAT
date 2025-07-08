/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { 
    unoptimized: true,
    domains: ['via.placeholder.com', 'images.unsplash.com', 'pexels.com']
  },
};

export default nextConfig;