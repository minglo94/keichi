/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    domains: ["lh3.googleusercontent.com"],
  },
  webpack(config) {
    config.module.rules.push({ test: /\.md$/, type: "asset/source" })
    return config
  },
}

export default nextConfig
