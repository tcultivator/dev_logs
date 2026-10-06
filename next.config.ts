import type { NextConfig } from "next";
import os from "os";

/** Collect LAN IPv4 addresses so phones on the same Wi‑Fi can hit the dev server. */
function lanDevOrigins() {
  const hosts = new Set<string>(["127.0.0.1", "localhost"]);

  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      const family = String(net.family);
      if ((family === "IPv4" || family === "4") && !net.internal) {
        hosts.add(net.address);
      }
    }
  }

  return [...hosts];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: lanDevOrigins(),
};

export default nextConfig;
