import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@naira-desk/chain", "@naira-desk/shared"],
  agentRules: false,
};

export default config;
