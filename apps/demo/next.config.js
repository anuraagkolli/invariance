/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['invariance'],
  experimental: {
    serverComponentsExternalPackages: ['js-yaml'],
  },
}

module.exports = nextConfig
