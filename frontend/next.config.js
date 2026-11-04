/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cartella di build alternativa (es. ".next-anteprima" per `yarn dev:anteprima`), così un dev server
  // isolato non tocca la .next usata dalle altre build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // `standalone` output produces a minimal server bundle for the Docker image.
  output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,
  eslint: {
    // Do not fail production builds on lint errors; keep lint as a separate step.
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

module.exports = nextConfig;
