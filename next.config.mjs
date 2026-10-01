/** @type {import('next').NextConfig} */
const nextConfig = {
  // Solo el sandbox aislado de WhatsApp (scripts/whatsapp-sandbox) define NEXT_DIST_DIR, para no pisar el .next del desarrollo normal.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
