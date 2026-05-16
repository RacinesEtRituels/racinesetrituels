/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.html',
    './components/**/*.html',
    './public/js/**/*.js',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#e64c19',
        accent: '#e2725b',
        'background-light': '#f8f6f6',
        'background-dark': '#211511',
        secondary: '#A3B18A',
        backgroundLight: '#F5F5DC',
        backgroundDark: '#3D2B1F',
        textLight: '#582F0E',
        textDark: '#F5F5DC',
        terracotta: '#E2725B',
        beige: '#F5F5DC',
        greensoft: '#A9B6A9',
        advisor: '#D8A399',
        user: '#E0E6E2',
        'text-primary': '#1b110e',
        'text-dark': '#F4F1DE',
      },
      fontFamily: {
        display: ['Epilogue', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
