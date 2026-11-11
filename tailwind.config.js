module.exports = {
  content: ['./index.html', './js/**/*.js', '!./js/*-sample.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        recomp: {
          dark: '#1c2532',
          darker: '#131a24',
          blue: '#0284c7',
          sky: '#38bdf8',
          emerald: '#10b981',
          surface: '#f1f5f9',
        },
      },
    },
  },
};
