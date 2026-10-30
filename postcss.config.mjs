// Tailwind pour la compilation de production (webpack) ; en dev, Turbopack passe par la règle de next.config.ts.
const config = {
  plugins: process.env.TURBOPACK ? {} : { "@tailwindcss/postcss": {} },
};

export default config;
