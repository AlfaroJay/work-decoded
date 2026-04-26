/** @type {import('next').NextConfig} */
const nextConfig = {
    generateBuildId: () => null,
    async rewrites() {
          return [
            {
                      source: '/feedback',
                      destination: '/feedback-form.html',
            },
                ];
    },
}

module.exports = nextConfig
