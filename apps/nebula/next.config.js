const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@invariance/design'],
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['js-yaml'],
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
}

module.exports = nextConfig
