/** @type {import('next').NextConfig} */

const fs = require('fs');
const path = require('path');

// Next.js inlines NEXT_PUBLIC_* vars at build time. If .env is not loaded
// (e.g. gitignored in deployment), the browser gets undefined and all
// Supabase requests fail with "Failed to fetch". Load .env explicitly here
// so the values are always present during the build.
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    }
  }
}
loadEnvFile();

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
};

module.exports = nextConfig;
