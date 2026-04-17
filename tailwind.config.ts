import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        wd: {
          navy: '#1a2744',
          gold: '#c5a55a',
          cream: '#faf8f5',
          charcoal: '#2d2d2d',
          mist: '#e8edf2',
        }
      },
      fontFamily: {
        heading: ['Georgia', 'serif'],
        body: ['system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
export default config
