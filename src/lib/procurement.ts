import { JsonRpcProvider } from "ethers";

export const polygonAmoy = {
  chainId: 80002,
  chainIdHex: "0x13882",
  name: "Polygon Amoy",
  explorer: "https://amoy.polygonscan.com",
  rpcUrl: process.env.NEXT_PUBLIC_AMOY_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com",
} as const;

export function createAmoyProvider() {
  return new JsonRpcProvider(polygonAmoy.rpcUrl, undefined, { batchMaxCount: 3 });
}

export const procurementAbi = [
  "function marketCount() view returns (uint256)",
  "function markets(uint256) view returns (string title,string description,string documentsCid,bytes32 documentsHash,uint256 indicativeBudget,uint8 status,address awardedVendor,uint64 awardedAt,uint64 commitDeadline,uint64 revealDeadline,uint256 awardedAmount,string decisionReference)",
  "function totalPaid(uint256) view returns (uint256)",
  "function totalMilestoneValue(uint256) view returns (uint256)",
  "function bids(uint256 marketId,address bidder) view returns (bytes32 commitment,uint256 amount,bytes32 proposalHash,bool revealed)",
  "function createMarket(string title,string description,string documentsCid,bytes32 documentsHash,uint256 indicativeBudget,uint64 commitDeadline,uint64 revealDeadline) returns (uint256)",
  "function submitCommitment(uint256 marketId,bytes32 commitment)",
  "function registerCompany()",
  "function openRevealPeriod(uint256 marketId)",
  "function revealBid(uint256 marketId,uint256 amount,string offerText,bytes32 secret)",
  "function awardMarket(uint256 marketId,address vendor,string decisionReference)",
  "function createMilestone(uint256 marketId,string description,uint256 amount) returns (uint256)",
  "function requestMilestone(uint256 marketId,uint256 milestoneId)",
  "function approveMilestone(uint256 marketId,uint256 milestoneId)",
  "function getMilestones(uint256 marketId) view returns (tuple(string description,uint256 amount,bool requested,bool authorityApproved,bool controllerApproved,bool paid,address authorityValidator,address controllerValidator)[])",
  "function hasRole(bytes32 role,address account) view returns (bool)",
  "function grantRole(bytes32 role,address account)",
  "function revokeRole(bytes32 role,address account)",
  "function AUTHORITY_ROLE() view returns (bytes32)",
  "function CONTROLLER_ROLE() view returns (bytes32)",
  "function COMPANY_ROLE() view returns (bytes32)",
  "event MarketCreated(uint256 indexed marketId,address indexed authority,uint64 commitDeadline,uint64 revealDeadline)",
  "event CommitmentSubmitted(uint256 indexed marketId,address indexed bidder,bytes32 commitment)",
  "event RevealPeriodOpened(uint256 indexed marketId)",
  "event BidRevealed(uint256 indexed marketId,address indexed bidder,uint256 amount,bytes32 proposalHash)",
  "event MarketAwarded(uint256 indexed marketId,address indexed vendor,uint256 amount,string decisionReference)",
  "event MilestoneCreated(uint256 indexed marketId,uint256 indexed milestoneId,uint256 amount)",
  "event MilestoneRequested(uint256 indexed marketId,uint256 indexed milestoneId,address indexed vendor)",
  "event MilestoneApproved(uint256 indexed marketId,uint256 indexed milestoneId,address indexed validator,bool isAuthority)",
  "event SimulatedPaymentReleased(uint256 indexed marketId,uint256 indexed milestoneId,uint256 amount)",
] as const;

export const marketStatuses = [
  "Engagements ouverts",
  "Révélation en cours",
  "Marché attribué",
  "Terminé",
  "Annulé",
] as const;

export type SectionId = "overview" | "tenders" | "sealed" | "awards" | "milestones" | "public" | "admin";
export type WorkspaceRequest = "visitor" | "company" | "authority" | "controller" | "administrator";

export type ContractRoles = {
  administrator: boolean;
  authority: boolean;
  controller: boolean;
  company: boolean;
};

export type MarketRow = {
  id: bigint;
  title: string;
  description: string;
  documentsCid: string;
  budget: bigint;
  commitDeadline: bigint;
  revealDeadline: bigint;
  status: number;
  vendor: string;
  awardedAmount: bigint;
  decisionReference: string;
  awardedAt: bigint;
  totalPaid: bigint;
};