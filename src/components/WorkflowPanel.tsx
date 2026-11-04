"use client";

import {
  ArrowUpRight,
  Check,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Upload,
  WalletCards,
} from "lucide-react";
import { Contract, ZeroHash, getAddress, isAddress, isHexString } from "ethers";
import type { EventLog, Signer } from "ethers";
import { useEffect, useState } from "react";
import type { ContractRoles, MarketRow, SectionId } from "@/lib/procurement";
import { createAmoyProvider, polygonAmoy, procurementAbi } from "@/lib/procurement";
import { createSealedBid, decryptBidBackup, downloadBidBackup, encryptBidBackup } from "@/lib/sealed-bid";

type Props = {
  activeSection: SectionId;
  markets: MarketRow[];
  account: string;
  signer: Signer | null;
  roles: ContractRoles;
  isConfigured: boolean;
  onRefresh: () => Promise<void>;
  onRoleRefresh: () => Promise<void>;
};

type TransactionLike = {
  hash: string;
  wait: () => Promise<unknown>;
};

type MilestoneRow = {
  description: string;
  amount: bigint;
  requested: boolean;
  authorityApproved: boolean;
  controllerApproved: boolean;
  paid: boolean;
  authorityValidator: string;
  controllerValidator: string;
};

type HistoryRow = {
  name: string;
  detail: string;
  blockNumber: number;
  transactionHash: string;
};

const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const fieldClass = "mt-1 h-10 w-full rounded-md border border-[#dce3dc] bg-white px-3 text-[12px] text-[#243a30] outline-none transition focus:border-[#17684f] focus:ring-2 focus:ring-[#17684f]/10";
const textAreaClass = "mt-1 min-h-24 w-full resize-y rounded-md border border-[#dce3dc] bg-white px-3 py-2.5 text-[12px] leading-5 text-[#243a30] outline-none transition focus:border-[#17684f] focus:ring-2 focus:ring-[#17684f]/10";

function displayError(error: unknown) {
  const reason = error as { shortMessage?: string; reason?: string; code?: string };
  if (reason.code === "ACTION_REJECTED") return "Transaction refusée dans le portefeuille.";
  return reason.shortMessage || reason.reason || (error instanceof Error ? error.message : "L’opération a échoué.");
}

function unixTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("Choisis une date valide.");
  return BigInt(Math.floor(timestamp / 1000));
}

function shortDate(timestamp: bigint) {
  return new Intl.DateTimeFormat("fr-CD", { dateStyle: "medium", timeZone: "Africa/Kinshasa" })
    .format(new Date(Number(timestamp) * 1000));
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatAmount(amount: bigint) {
  return new Intl.NumberFormat("fr-CD").format(amount);
}

function ActionPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5 sm:p-6">
      <div className="mb-5 border-b border-[#e8ece7] pb-4">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <p className="mt-1 max-w-[660px] text-[11px] leading-5 text-[#718078]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function MarketSelect({
  markets,
  value,
  onChange,
  label = "Appel d’offres",
}: {
  markets: MarketRow[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <label className="block text-[11px] font-medium text-[#53635b]">
      {label}
      <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Sélectionner un marché</option>
        {markets.map((market) => <option key={String(market.id)} value={String(market.id)}>MP-{String(market.id).padStart(4, "0")} · {market.title}</option>)}
      </select>
    </label>
  );
}

function SubmitButton({ children, disabled, busy }: { children: React.ReactNode; disabled: boolean; busy: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#17684f] px-4 text-[12px] font-semibold text-white transition hover:bg-[#104c3a] disabled:cursor-not-allowed disabled:bg-[#9eafa5]"
    >
      {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
      {busy ? "Transaction en cours…" : children}
    </button>
  );
}

export default function WorkflowPanel({ activeSection, markets, account, signer, roles, isConfigured, onRefresh, onRoleRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [transactionHash, setTransactionHash] = useState("");
  const [now, setNow] = useState(0n);
  const [commitMarketId, setCommitMarketId] = useState("");
  const [awardMarketId, setAwardMarketId] = useState("");
  const [milestoneMarketId, setMilestoneMarketId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [commitDate, setCommitDate] = useState("");
  const [revealDate, setRevealDate] = useState("");
  const [documentsCid, setDocumentsCid] = useState("");
  const [documentsHash, setDocumentsHash] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [offerText, setOfferText] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [revealFile, setRevealFile] = useState<File | null>(null);
  const [revealPassword, setRevealPassword] = useState("");
  const [awardVendor, setAwardVendor] = useState("");
  const [decisionReference, setDecisionReference] = useState("");
  const [milestoneDescription, setMilestoneDescription] = useState("");
  const [milestoneAmount, setMilestoneAmount] = useState("");
  const [roleTarget, setRoleTarget] = useState("");
  const [roleToManage, setRoleToManage] = useState<"authority" | "controller" | "company">("company");
  const [milestonesByMarket, setMilestonesByMarket] = useState<Record<string, MilestoneRow[]>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const configuredAddress = isConfigured && contractAddress ? contractAddress : "";
  const awardedMarkets = markets.filter((market) => market.status === 2 || market.status === 3);
  const commitMarkets = markets.filter((market) => market.status === 0 && market.commitDeadline > now);
  const revealMarkets = markets.filter((market) => market.status === 1);
  const awardableMarkets = revealMarkets.filter((market) => market.revealDeadline <= now);
  const activeCommitMarketId = commitMarkets.some((market) => String(market.id) === commitMarketId)
    ? commitMarketId
    : String(commitMarkets[0]?.id ?? "");
  const activeAwardMarketId = awardableMarkets.some((market) => String(market.id) === awardMarketId)
    ? awardMarketId
    : String(awardableMarkets[0]?.id ?? "");
  const activeMilestoneMarketId = awardedMarkets.some((market) => String(market.id) === milestoneMarketId)
    ? milestoneMarketId
    : String(awardedMarkets[0]?.id ?? "");

  useEffect(() => {
    const updateClock = () => setNow(BigInt(Math.floor(Date.now() / 1000)));
    const initialClock = window.setTimeout(updateClock, 0);
    const timer = window.setInterval(updateClock, 30_000);
    return () => {
      window.clearTimeout(initialClock);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const currentAwards = markets.filter((market) => market.status === 2 || market.status === 3);
    if (activeSection !== "milestones" || !configuredAddress || currentAwards.length === 0) return;
    let active = true;
    const reader = new Contract(configuredAddress, procurementAbi, createAmoyProvider());
    void Promise.all(currentAwards.map(async (market) => {
      const rows = await reader.getMilestones(market.id) as MilestoneRow[];
      return [String(market.id), rows] as const;
    })).then((entries) => {
      if (active) setMilestonesByMarket(Object.fromEntries(entries));
    }).catch((loadError: unknown) => {
      if (active) setError(displayError(loadError));
    });
    return () => { active = false; };
  }, [activeSection, markets, configuredAddress]);

  useEffect(() => {
    if (activeSection !== "public" || !configuredAddress) return;
    let active = true;
    const provider = createAmoyProvider();
    const contract = new Contract(configuredAddress, procurementAbi, provider);
    void (async () => {
      const latestBlock = await provider.getBlockNumber();
      const configuredBlock = process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK;
      const deploymentBlock = configuredBlock ? Number(configuredBlock) : Number.NaN;
      const fromBlock = Number.isSafeInteger(deploymentBlock) && deploymentBlock >= 0
        ? deploymentBlock
        : Math.max(0, latestBlock - 50_000);
      const groups = await Promise.all([
        contract.queryFilter(contract.filters.MarketCreated(), fromBlock, latestBlock),
        contract.queryFilter(contract.filters.CommitmentSubmitted(), fromBlock, latestBlock),
        contract.queryFilter(contract.filters.RevealPeriodOpened(), fromBlock, latestBlock),
        contract.queryFilter(contract.filters.BidRevealed(), fromBlock, latestBlock),
        contract.queryFilter(contract.filters.MarketAwarded(), fromBlock, latestBlock),
        contract.queryFilter(contract.filters.MilestoneCreated(), fromBlock, latestBlock),
        contract.queryFilter(contract.filters.MilestoneRequested(), fromBlock, latestBlock),
        contract.queryFilter(contract.filters.MilestoneApproved(), fromBlock, latestBlock),
        contract.queryFilter(contract.filters.SimulatedPaymentReleased(), fromBlock, latestBlock),
      ]);
      const rows = (groups.flat() as EventLog[]).map((event) => ({
        name: event.fragment.name,
        detail: describeEvent(event),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      })).sort((first, second) => second.blockNumber - first.blockNumber);
      if (active) setHistory(rows.slice(0, 40));
    })().catch((historyError: unknown) => {
      if (active) setError(displayError(historyError));
    });
    return () => { active = false; };
  }, [activeSection, configuredAddress]);

  async function execute(label: string, operation: (contract: Contract) => Promise<TransactionLike>) {
    setError("");
    setFeedback("");
    setTransactionHash("");
    if (!signer || !configuredAddress) {
      setError("Connecte MetaMask et configure l’adresse du contrat avant de continuer.");
      return false;
    }

    setBusy(true);
    try {
      const contract = new Contract(configuredAddress, procurementAbi, signer);
      const transaction = await operation(contract);
      setTransactionHash(transaction.hash);
      await transaction.wait();
      setFeedback(`${label} · transaction confirmée`);
      await onRefresh();
      return true;
    } catch (transactionError) {
      setError(displayError(transactionError));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument() {
    if (!documentFile) return;
    setError("");
    setFeedback("");
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", documentFile);
      const response = await fetch("/api/pinata", { method: "POST", body: formData });
      const result = await response.json() as { cid?: string; sha256?: string; error?: string };
      if (!response.ok || !result.cid || !result.sha256) throw new Error(result.error || "Le téléversement a échoué.");
      setDocumentsCid(result.cid);
      setDocumentsHash(result.sha256);
      setFeedback("Document épinglé sur IPFS. Son CID et son SHA-256 seront inscrits avec le marché.");
    } catch (uploadError) {
      setError(displayError(uploadError));
    } finally {
      setIsUploading(false);
    }
  }

  async function submitMarket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const commitDeadline = unixTimestamp(commitDate);
      const revealDeadline = unixTimestamp(revealDate);
      if (commitDeadline <= now || revealDeadline <= commitDeadline) throw new Error("La révélation doit se terminer après la clôture des engagements.");
      if (documentsCid && !isHexString(documentsHash, 32)) throw new Error("Le document IPFS doit avoir une empreinte SHA-256 valide.");
      const hash = documentsHash || ZeroHash;
      const created = await execute("Appel d’offres publié", (contract) => contract.getFunction("createMarket")(
        title.trim(), description.trim(), documentsCid.trim(), hash, BigInt(budget), commitDeadline, revealDeadline,
      ));
      if (created) {
        setTitle("");
        setDescription("");
        setBudget("");
        setDocumentsCid("");
        setDocumentsHash("");
        setDocumentFile(null);
      }
    } catch (submitError) {
      setError(displayError(submitError));
    }
  }

  async function submitCommit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!account || !activeCommitMarketId) throw new Error("Connecte le portefeuille et sélectionne un marché.");
      const bid = createSealedBid(BigInt(activeCommitMarketId), account, BigInt(bidAmount), offerText);
      const encryptedBackup = await encryptBidBackup(bid, backupPassword);
      downloadBidBackup(encryptedBackup, bid.marketId);
      const committed = await execute("Offre engagée", (contract) => contract.getFunction("submitCommitment")(BigInt(bid.marketId), bid.commitment));
      if (committed) {
        setFeedback("Offre engagée. La sauvegarde chiffrée a été téléchargée ; conserve-la pour la révélation.");
        setBidAmount("");
        setOfferText("");
      }
    } catch (submitError) {
      setError(displayError(submitError));
    }
  }

  async function submitReveal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!revealFile || !account) throw new Error("Choisis le fichier de sauvegarde et connecte le portefeuille du soumissionnaire.");
      const backup = await decryptBidBackup(await revealFile.text(), revealPassword);
      if (getAddress(backup.bidder) !== getAddress(account)) throw new Error("Cette sauvegarde appartient à une autre adresse.");
      await execute("Offre révélée", (contract) => contract.getFunction("revealBid")(
        BigInt(backup.marketId), BigInt(backup.amount), backup.offerText, backup.secret,
      ));
    } catch (submitError) {
      setError(displayError(submitError));
    }
  }

  async function submitAward(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAddress(awardVendor)) {
      setError("Saisis une adresse Ethereum valide pour l’entreprise retenue.");
      return;
    }
    await execute("Attribution enregistrée", (contract) => contract.getFunction("awardMarket")(
      BigInt(activeAwardMarketId), getAddress(awardVendor), decisionReference.trim(),
    ));
  }

  async function submitMilestone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeMilestoneMarketId) {
      setError("Sélectionne un marché attribué.");
      return;
    }
    const created = await execute("Jalon créé", (contract) => contract.getFunction("createMilestone")(
      BigInt(activeMilestoneMarketId), milestoneDescription.trim(), BigInt(milestoneAmount),
    ));
    if (created) {
      setMilestoneDescription("");
      setMilestoneAmount("");
    }
  }

  async function approveMilestone(marketId: bigint, milestoneId: number) {
    await execute("Validation enregistrée", (contract) => contract.getFunction("approveMilestone")(marketId, milestoneId));
  }

  async function requestMilestone(marketId: bigint, milestoneId: number) {
    await execute("Demande de jalon envoyée", (contract) => contract.getFunction("requestMilestone")(marketId, milestoneId));
  }

  async function openRevealPeriod(marketId: bigint) {
    await execute("Période de révélation ouverte", (contract) => contract.getFunction("openRevealPeriod")(marketId));
  }

  async function registerCompany() {
    const registered = await execute("Portefeuille inscrit comme entreprise", (contract) => contract.getFunction("registerCompany")());
    if (registered) await onRoleRefresh();
  }

  async function manageRole(action: "grantRole" | "revokeRole") {
    setError("");
    if (!roles.administrator) {
      setError("Seul le portefeuille administrateur peut gérer les rôles.");
      return;
    }
    if (!isAddress(roleTarget)) {
      setError("Saisis une adresse de portefeuille valide.");
      return;
    }

    const target = getAddress(roleTarget);
    const roleLabel = roleToManage === "authority" ? "Autorité contractante" : roleToManage === "controller" ? "Contrôleur" : "Entreprise";
    const updated = await execute(
      action === "grantRole" ? `Rôle ${roleLabel} attribué` : `Rôle ${roleLabel} révoqué`,
      async (contract) => {
        const roleName = roleToManage === "authority" ? "AUTHORITY_ROLE" : roleToManage === "controller" ? "CONTROLLER_ROLE" : "COMPANY_ROLE";
        const roleHash = await contract.getFunction(roleName)();
        return contract.getFunction(action)(roleHash, target);
      },
    );
    if (updated) setRoleTarget("");
  }

  if (activeSection === "overview") return null;

  return (
    <section className="fade-in mt-7 space-y-4">
      {!isConfigured && (
        <div className="flex items-start gap-3 rounded-md border border-[#ead9ad] bg-[#fbf6e9] px-4 py-3 text-[11px] leading-5 text-[#765614]">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />
          Les formulaires seront activés après le déploiement du contrat et la configuration de son adresse.
        </div>
      )}
      {isConfigured && !signer && activeSection !== "public" && (
        <div className="flex items-start gap-3 rounded-md border border-[#dce3dc] bg-white px-4 py-3 text-[11px] leading-5 text-[#64736c]">
          <WalletCards size={16} className="mt-0.5 shrink-0 text-[#17684f]" /> Connecte MetaMask pour soumettre une transaction. La consultation publique reste disponible sans portefeuille.
        </div>
      )}

      {activeSection === "tenders" && (
        <ActionPanel title="Publier un appel d’offres" description="Réservé au rôle Autorité contractante. Le dossier est épinglé sur IPFS ; seul son CID et son empreinte sont inscrits sur la chaîne.">
          {roles.authority ? (
            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submitMarket}>
              <label className="block text-[11px] font-medium text-[#53635b] md:col-span-2">Titre du marché
                <input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required />
              </label>
              <label className="block text-[11px] font-medium text-[#53635b] md:col-span-2">Description et critères
                <textarea className={textAreaClass} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={3000} required />
              </label>
              <label className="block text-[11px] font-medium text-[#53635b]">Budget indicatif · unités de démonstration
                <input className={fieldClass} type="number" min="1" step="1" value={budget} onChange={(event) => setBudget(event.target.value)} required />
              </label>
              <label className="block text-[11px] font-medium text-[#53635b]">Dossier PDF, DOCX, JPG ou PNG
                <input className={`${fieldClass} pt-2`} type="file" accept="application/pdf,.docx,image/jpeg,image/png" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} />
              </label>
              <div className="flex items-end gap-2 md:col-span-2">
                <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-[#dce3dc] bg-white px-3 text-[11px] font-semibold text-[#3d594b] hover:bg-[#f7f9f6] disabled:opacity-50" onClick={() => void uploadDocument()} disabled={!documentFile || isUploading || !isConfigured}>
                  {isUploading ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
                  {isUploading ? "Téléversement…" : "Épingler sur IPFS"}
                </button>
                {documentsCid && <span className="mono truncate text-[10px] text-[#52645a]">CID · {documentsCid}</span>}
              </div>
              <label className="block text-[11px] font-medium text-[#53635b]">Fin des engagements
                <input className={fieldClass} type="datetime-local" value={commitDate} onChange={(event) => setCommitDate(event.target.value)} required />
              </label>
              <label className="block text-[11px] font-medium text-[#53635b]">Fin de la révélation
                <input className={fieldClass} type="datetime-local" value={revealDate} onChange={(event) => setRevealDate(event.target.value)} required />
              </label>
              <div className="md:col-span-2"><SubmitButton disabled={!signer || !isConfigured || !roles.authority} busy={busy}>Publier sur Polygon Amoy</SubmitButton></div>
            </form>
          ) : (
            <RoleNotice text="L’adresse connectée n’a pas le rôle Autorité contractante sur ce contrat." />
          )}
        </ActionPanel>
      )}

      {activeSection === "sealed" && (
        <>
          <ActionPanel title="Engager une offre" description="Le montant, le texte de l’offre et le secret restent dans une sauvegarde locale chiffrée. Seul l’engagement cryptographique est publié avant l’échéance.">
            {roles.company ? <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submitCommit}>
              <div className="md:col-span-2"><MarketSelect markets={commitMarkets} value={activeCommitMarketId} onChange={setCommitMarketId} /></div>
              <label className="block text-[11px] font-medium text-[#53635b]">Montant proposé · unités de démonstration
                <input className={fieldClass} type="number" min="1" step="1" value={bidAmount} onChange={(event) => setBidAmount(event.target.value)} required />
              </label>
              <label className="block text-[11px] font-medium text-[#53635b]">Mot de passe de sauvegarde
                <input className={fieldClass} type="password" minLength={12} autoComplete="new-password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} required />
              </label>
              <label className="block text-[11px] font-medium text-[#53635b] md:col-span-2">Contenu de l’offre
                <textarea className={textAreaClass} value={offerText} onChange={(event) => setOfferText(event.target.value)} maxLength={5000} required />
              </label>
              <div className="flex items-start gap-2 text-[10px] leading-5 text-[#718078] md:col-span-2">
                <LockKeyhole size={14} className="mt-0.5 shrink-0 text-[#17684f]" /> Ne perds pas le fichier téléchargé : sans lui et son mot de passe, l’offre ne pourra pas être révélée.
              </div>
              <div><SubmitButton disabled={!signer || !isConfigured || commitMarkets.length === 0} busy={busy}>Engager et télécharger la sauvegarde</SubmitButton></div>
            </form> : account && !roles.authority && !roles.controller && !roles.administrator ? (
              <div className="space-y-3">
                <RoleNotice text="Ce portefeuille n’est pas encore inscrit comme entreprise. L’inscription est publique et définitive pour cette adresse." />
                <button type="button" disabled={!signer || !isConfigured || busy} onClick={() => void registerCompany()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#17684f] px-4 text-[12px] font-semibold text-white transition hover:bg-[#104c3a] disabled:cursor-not-allowed disabled:bg-[#9eafa5]">
                  {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} S’inscrire comme entreprise
                </button>
                <p className="text-[10px] text-[#718078]">MetaMask demandera de confirmer une transaction et les frais en POL de test.</p>
              </div>
            ) : <RoleNotice text="Ce portefeuille possède un rôle administratif incompatible avec le rôle Entreprise." />}
          </ActionPanel>

          <ActionPanel title="Ouvrir les révélations" description="Toute personne peut déclencher l’ouverture après la clôture. Les entreprises doivent ensuite révéler avant la deuxième échéance.">
            {markets.filter((market) => market.status === 0).length === 0 ? (
              <p className="text-[11px] text-[#718078]">Aucun marché en attente d’ouverture.</p>
            ) : (
              <div className="divide-y divide-[#e8ece7]">
                {markets.filter((market) => market.status === 0).map((market) => {
                  const eligible = now >= market.commitDeadline;
                  return <div key={String(market.id)} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div><div className="text-[11px] font-semibold">MP-{String(market.id).padStart(4, "0")} · {market.title}</div><div className="mt-1 text-[10px] text-[#78847c]">Clôture des engagements · {shortDate(market.commitDeadline)}</div></div>
                    <button type="button" disabled={!eligible || busy || !signer} onClick={() => void openRevealPeriod(market.id)} className="h-9 rounded-md border border-[#dce3dc] bg-white px-3 text-[11px] font-semibold text-[#365a49] hover:bg-[#f7f9f6] disabled:cursor-not-allowed disabled:opacity-50">{eligible ? "Ouvrir la révélation" : "En attente de l’échéance"}</button>
                  </div>;
                })}
              </div>
            )}
          </ActionPanel>

          <ActionPanel title="Révéler une offre" description="Importe la sauvegarde chiffrée, saisis son mot de passe et reconnecte le même portefeuille que lors de l’engagement.">
            {roles.company ? <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submitReveal}>
              <label className="block text-[11px] font-medium text-[#53635b]">Sauvegarde chiffrée JSON
                <input className={`${fieldClass} pt-2`} type="file" accept="application/json,.json" onChange={(event) => setRevealFile(event.target.files?.[0] ?? null)} required />
              </label>
              <label className="block text-[11px] font-medium text-[#53635b]">Mot de passe
                <input className={fieldClass} type="password" autoComplete="current-password" value={revealPassword} onChange={(event) => setRevealPassword(event.target.value)} required />
              </label>
              <div><SubmitButton disabled={!signer || !isConfigured || revealMarkets.length === 0} busy={busy}>Déchiffrer et révéler</SubmitButton></div>
            </form> : <RoleNotice text="La révélation est réservée à l’adresse de l’entreprise qui a engagé l’offre." />}
          </ActionPanel>
        </>
      )}

      {activeSection === "awards" && (
        <ActionPanel title="Enregistrer une décision d’attribution" description="Réservé à l’autorité contractante, après la clôture de la révélation. Le contrat vérifie que le titulaire a révélé une offre valide dans le budget.">
          {roles.authority ? (
            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submitAward}>
              <div className="md:col-span-2"><MarketSelect markets={awardableMarkets} value={activeAwardMarketId} onChange={setAwardMarketId} /></div>
              <label className="block text-[11px] font-medium text-[#53635b]">Adresse de l’entreprise retenue
                <input className={fieldClass} value={awardVendor} onChange={(event) => setAwardVendor(event.target.value)} placeholder="0x…" required />
              </label>
              <label className="block text-[11px] font-medium text-[#53635b]">Référence de la décision
                <input className={fieldClass} value={decisionReference} onChange={(event) => setDecisionReference(event.target.value)} maxLength={128} required />
              </label>
              <div className="flex items-start gap-2 text-[10px] leading-5 text-[#718078] md:col-span-2">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#17684f]" /> L’autorité décide du titulaire. La chaîne vérifie l’offre mais ne juge pas l’équité de la décision.
              </div>
              <div><SubmitButton disabled={!signer || !isConfigured || awardableMarkets.length === 0} busy={busy}>Enregistrer l’attribution</SubmitButton></div>
            </form>
          ) : <RoleNotice text="L’adresse connectée n’a pas le rôle Autorité contractante sur ce contrat." />}
        </ActionPanel>
      )}

      {activeSection === "milestones" && (
        <>
          {roles.authority && (
            <ActionPanel title="Définir un jalon" description="Le total des jalons ne peut pas dépasser le montant attribué au marché.">
              <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submitMilestone}>
                <div className="md:col-span-2"><MarketSelect markets={awardedMarkets} value={activeMilestoneMarketId} onChange={setMilestoneMarketId} /></div>
                <label className="block text-[11px] font-medium text-[#53635b]">Description
                  <input className={fieldClass} value={milestoneDescription} onChange={(event) => setMilestoneDescription(event.target.value)} maxLength={160} required />
                </label>
                <label className="block text-[11px] font-medium text-[#53635b]">Montant · unités de démonstration
                  <input className={fieldClass} type="number" min="1" step="1" value={milestoneAmount} onChange={(event) => setMilestoneAmount(event.target.value)} required />
                </label>
                <div><SubmitButton disabled={!signer || !isConfigured || awardedMarkets.length === 0} busy={busy}>Ajouter le jalon</SubmitButton></div>
              </form>
            </ActionPanel>
          )}

          <ActionPanel title="Suivi et validation des jalons" description="Le titulaire demande la validation. L’autorité et un contrôleur distinct doivent approuver ; la libération est un événement comptable simulé, sans transfert de fonds.">
            {awardedMarkets.length === 0 ? (
              <p className="text-[11px] text-[#718078]">Aucun marché attribué ne possède encore de jalons.</p>
            ) : (
              <div className="divide-y divide-[#e8ece7]">
                {awardedMarkets.map((market) => {
                  const rows = milestonesByMarket[String(market.id)] ?? [];
                  return <div key={String(market.id)} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold">MP-{String(market.id).padStart(4, "0")} · {market.title}</div>
                      <div className="mono text-[10px] text-[#68766e]">{market.totalPaid.toString()} / {market.awardedAmount.toString()} unités</div>
                    </div>
                    {rows.length === 0 ? <p className="mt-3 text-[10px] text-[#87928a]">Aucun jalon enregistré.</p> : (
                      <div className="mt-3 space-y-2">
                        {rows.map((milestone, index) => {
                          const isWinner = account && market.vendor && getAddress(account) === getAddress(market.vendor);
                          const isAuthorityValidator = milestone.authorityValidator !== ZeroHash && account && getAddress(milestone.authorityValidator) === getAddress(account);
                          const isControllerValidator = milestone.controllerValidator !== ZeroHash && account && getAddress(milestone.controllerValidator) === getAddress(account);
                          const sameApprover = isAuthorityValidator || isControllerValidator;
                          const canApprove = (roles.authority && !milestone.authorityApproved) || (roles.controller && !milestone.controllerApproved);
                          return <div key={index} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#e8ece7] bg-[#fbfcfa] px-3 py-3">
                            <div className="min-w-[180px] flex-1">
                              <div className="text-[11px] font-semibold">{milestone.description}</div>
                              <div className="mt-1 flex flex-wrap gap-2 text-[9px] text-[#78847c]">
                                <span className="mono">{milestone.amount.toString()} unités</span>
                                <span>{milestone.requested ? "Demande envoyée" : "En attente de demande"}</span>
                                <span>{milestone.authorityApproved ? "Autorité validée" : "Autorité en attente"}</span>
                                <span>{milestone.controllerApproved ? "Contrôle validé" : "Contrôle en attente"}</span>
                                {milestone.paid && <span className="font-semibold text-[#17684f]">Libération simulée</span>}
                              </div>
                            </div>
                            {!milestone.requested && !milestone.paid && isWinner && <button type="button" disabled={busy} onClick={() => void requestMilestone(market.id, index)} className="h-8 rounded border border-[#dce3dc] bg-white px-2.5 text-[10px] font-semibold text-[#365a49] disabled:opacity-50">Demander validation</button>}
                            {milestone.requested && !milestone.paid && canApprove && !sameApprover && <button type="button" disabled={busy} onClick={() => void approveMilestone(market.id, index)} className="h-8 rounded border border-[#c6d9cd] bg-[#edf5ef] px-2.5 text-[10px] font-semibold text-[#17684f] disabled:opacity-50">{roles.authority && !milestone.authorityApproved ? "Valider comme autorité" : "Valider comme contrôleur"}</button>}
                          </div>;
                        })}
                      </div>
                    )}
                  </div>;
                })}
              </div>
            )}
          </ActionPanel>
          {!roles.authority && !roles.controller && <RoleNotice text="Le portefeuille connecté ne peut ni définir ni valider des jalons. La demande reste réservée au titulaire du marché." />}
        </>
      )}

      {activeSection === "public" && (
        <ActionPanel title="Historique public du contrat" description="Événements lus depuis Polygon Amoy. Les engagements restent des hashes ; les montants apparaissent dans le journal uniquement après révélation.">
          {history.length === 0 ? (
            <p className="text-[11px] text-[#718078]">Aucun événement trouvé dans la plage consultée, ou contrat/RPC non configuré.</p>
          ) : (
            <div className="divide-y divide-[#e8ece7]">
              {history.map((event) => (
                <div key={`${event.transactionHash}-${event.name}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-[220px] flex-1">
                    <div className="text-[11px] font-semibold">{event.detail}</div>
                    <div className="mono mt-1 text-[9px] text-[#87928a]">{event.name} · bloc {event.blockNumber}</div>
                  </div>
                  <a className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-[#17684f] no-underline hover:text-[#104c3a]" href={`${polygonAmoy.explorer}/tx/${event.transactionHash}`} target="_blank" rel="noreferrer">
                    Voir la transaction <ArrowUpRight size={12} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </ActionPanel>
      )}

      {activeSection === "admin" && (
        <ActionPanel title="Gestion des rôles métier" description="Réservé au portefeuille administrateur. Les changements sont inscrits sur Polygon Amoy et exigent une confirmation MetaMask.">
          {roles.administrator ? (
            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void manageRole("grantRole"); }}>
              <label className="block text-[11px] font-medium text-[#53635b]">Rôle métier
                <select className={fieldClass} value={roleToManage} onChange={(event) => setRoleToManage(event.target.value as "authority" | "controller" | "company")}>
                  <option value="company">Entreprise</option>
                  <option value="authority">Autorité contractante</option>
                  <option value="controller">Contrôleur</option>
                </select>
              </label>
              <label className="block text-[11px] font-medium text-[#53635b]">Adresse du portefeuille
                <input className={fieldClass} value={roleTarget} onChange={(event) => setRoleTarget(event.target.value)} placeholder="0x…" required />
              </label>
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <SubmitButton disabled={!signer || !isConfigured || !roles.administrator} busy={busy}>Attribuer ce rôle</SubmitButton>
                <button type="button" disabled={!signer || !isConfigured || !roles.administrator || busy || !isAddress(roleTarget)} onClick={() => void manageRole("revokeRole")} className="inline-flex h-10 items-center justify-center rounded-md border border-[#e7c9bd] bg-white px-4 text-[12px] font-semibold text-[#97452b] transition hover:bg-[#fff8f5] disabled:cursor-not-allowed disabled:opacity-50">Révoquer ce rôle</button>
              </div>
              <p className="text-[10px] leading-5 text-[#718078] md:col-span-2">Cette interface ne permet volontairement pas de créer ou révoquer un administrateur. Garde le rôle administrateur sur un portefeuille de test protégé.</p>
            </form>
          ) : (
            <RoleNotice text="Connecte le portefeuille qui a déployé le contrat : lui seul possède le rôle administrateur." />
          )}
        </ActionPanel>
      )}

      {(error || feedback) && (
        <div role={error ? "alert" : "status"} className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-[11px] ${error ? "border-[#e7c9bd] bg-[#fff8f5] text-[#8f432c]" : "border-[#c9ddcf] bg-[#eef6f0] text-[#285c42]"}`}>
          <span className="flex items-start gap-2">{error ? <CircleAlert size={15} className="mt-0.5 shrink-0" /> : <Check size={15} className="mt-0.5 shrink-0" />}{error || feedback}</span>
          {transactionHash && <a className="flex shrink-0 items-center gap-1 font-semibold no-underline" href={`${polygonAmoy.explorer}/tx/${transactionHash}`} target="_blank" rel="noreferrer">Voir la transaction <ArrowUpRight size={12} /></a>}
        </div>
      )}
    </section>
  );
}

function RoleNotice({ text }: { text: string }) {
  return <div className="flex items-start gap-2 text-[11px] leading-5 text-[#718078]"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#a76b13]" />{text}</div>;
}

function describeEvent(event: EventLog) {
  const args = event.args;
  const marketId = String(args.marketId ?? args[0]);
  switch (event.fragment.name) {
    case "MarketCreated":
      return `Marché MP-${marketId.padStart(4, "0")} publié`;
    case "CommitmentSubmitted":
      return `Engagement reçu · ${shortenAddress(String(args.bidder))}`;
    case "RevealPeriodOpened":
      return `Révélation ouverte · MP-${marketId.padStart(4, "0")}`;
    case "BidRevealed":
      return `Offre révélée · ${formatAmount(BigInt(args.amount))} unités`;
    case "MarketAwarded":
      return `Marché attribué à ${shortenAddress(String(args.vendor))} · ${String(args.decisionReference)}`;
    case "MilestoneCreated":
      return `Jalon ${String(args.milestoneId)} créé · MP-${marketId.padStart(4, "0")}`;
    case "MilestoneRequested":
      return `Validation du jalon ${String(args.milestoneId)} demandée`;
    case "MilestoneApproved":
      return `Jalon ${String(args.milestoneId)} validé par ${args.isAuthority ? "l’autorité" : "le contrôleur"}`;
    case "SimulatedPaymentReleased":
      return `Paiement simulé · ${formatAmount(BigInt(args.amount))} unités`;
    default:
      return `Événement du marché MP-${marketId.padStart(4, "0")}`;
  }
}