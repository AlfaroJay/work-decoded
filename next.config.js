/** @type {import('next').NextConfig} */
const nextConfig = {
    generateBuildId: () => null,
    async rewrites() {
          return [
            {
                      source: '/book',
                      destination: '/intake-form.html',
            },
            {
                      source: '/feedback',
                      destination: '/feedback-form.html',
            },
                ];
    },
}

module.exports = nextConfig
