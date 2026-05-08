import type { InfoClient } from "@nktkas/hyperliquid";
import type { Address } from "viem";

export type PositionSummary = {
  coin: string;
  sizeBase: number;
};

export function parsePositionForCoin(
  clearinghouse: Awaited<ReturnType<InfoClient["clearinghouseState"]>>,
  coin: string,
): PositionSummary {
  for (const ap of clearinghouse.assetPositions) {
    const p = ap.position;
    if (p.coin !== coin) continue;
    return { coin, sizeBase: Number(p.szi) };
  }
  return { coin, sizeBase: 0 };
}

export function accountValueUsd(clearinghouse: Awaited<ReturnType<InfoClient["clearinghouseState"]>>): number {
  return Number(clearinghouse.marginSummary.accountValue);
}

export async function fetchClearinghouse(info: InfoClient, user: Address) {
  return info.clearinghouseState({ user });
}
