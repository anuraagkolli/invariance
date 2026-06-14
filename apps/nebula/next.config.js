const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages export TS source -> Next must transpile them.
  transpilePackages: ['@invariance/design', '@invariance/server'],
  output: 'standalone',
  experimental: {
    // js-yaml: pulled by @invariance/design (server). quickjs-emscripten: the
    // WASM sandbox used by @invariance/server's hook executor — must load from
    // node_modules at runtime, not be bundled by webpack, or the WASM fails to
    // instantiate inside route handlers (hooks then silently no-op).
    serverComponentsExternalPackages: [
      'js-yaml',
      // The full quickjs-emscripten chain: the WASM/emscripten glue (the @jitl
      // variant) breaks when webpack bundles it ("a is not a function"). All
      // three transitive packages must load from node_modules at runtime.
      'quickjs-emscripten',
      'quickjs-emscripten-core',
      '@jitl/quickjs-wasmfile-release-sync',
    ],
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  // @invariance/server is transpiled, so webpack also tries to bundle its
  // quickjs-emscripten import — and the emscripten glue breaks when bundled
  // ("a is not a function"). Force the whole quickjs chain to a runtime
  // `require` from node_modules on the server (the same path that works under
  // plain Node), which serverComponentsExternalPackages doesn't achieve once
  // the package is reached through a transpiled workspace dep.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)
      externals.push(({ request }, cb) => {
        if (request && /(^|\/)quickjs-emscripten(-core)?$|@jitl\/quickjs-/.test(request)) {
          return cb(null, 'commonjs ' + request)
        }
        cb()
      })
      config.externals = externals
    }
    return config
  },
}

module.exports = nextConfig
