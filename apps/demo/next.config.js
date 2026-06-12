const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['invariance'],
  // Self-contained server bundle for Docker deploys (single-instance hosts —
  // the file-backed /api stores need a persistent filesystem, not lambdas).
  // Tracing root = the monorepo root so workspace deps resolve into standalone.
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['js-yaml'],
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
}

module.exports = nextConfig
