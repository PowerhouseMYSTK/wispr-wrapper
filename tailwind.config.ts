import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        toolbar: {
          bg: '#1e1e2e',
          border: '#313244',
          button: '#313244',
          'button-hover': '#45475a',
          input: '#181825',
          'input-focus': '#11111b',
          text: '#cdd6f4',
          'text-muted': '#585b70',
          accent: '#89b4fa',
        },
      },
      keyframes: {
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
        'progress-bar': {
          '0%': { width: '0%', opacity: '1' },
          '80%': { width: '85%', opacity: '1' },
          '100%': { width: '100%', opacity: '0' },
        },
      },
      animation: {
        'progress-bar': 'progress-bar 2s ease-out forwards',
      },
    },
  },
  plugins: [],
};

export default config;
