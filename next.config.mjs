import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development'
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (process.env.VERCEL) return []
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3131/api/:path*'
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://localhost:3131/socket.io/:path*'
      }
    ]
  }
}

export default withSerwist(nextConfig)
