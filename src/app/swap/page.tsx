import { redirect } from "next/navigation";

/** Public Uniswap swap removed — all swaps are TEE-sealed via /privacy. */
export default function SwapPage() {
  redirect("/privacy");
}
