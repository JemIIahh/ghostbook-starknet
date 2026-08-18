import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { coston2 } from "@/lib/chains";

export const projectId = "367e7033f1d106ae8bdbbd60e7c478a9";

export const metadata = {
  name: "GhostBook",
  description: "GhostBook — DEX on Flare Coston2",
  url: "http://localhost:3000",
  icons: ["http://localhost:3000/logo.png"],
};

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [coston2 as AppKitNetwork];

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: true,
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
