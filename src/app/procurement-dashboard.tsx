"use client";

import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Blocks,
  BriefcaseBusiness,
  CircleAlert,
  CircleDot,
  ClipboardList,
  Clock3,
  Eye,
  FileCheck2,
  FileLock2,
  Landmark,
  LayoutDashboard,
  Milestone,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { BrowserProvider, Contract, ZeroHash } from "ethers";
import type { JsonRpcProvider, Signer } from "ethers";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ContractRoles, MarketRow, SectionId, WorkspaceRequest } from "@/lib/procurement";
import { createAmoyProvider, getMarketStatusLabel, polygonAmoy, procurementAbi } from "@/lib/procurement";
import WorkflowPanel from "@/components/WorkflowPanel";

const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void) => void;
};

function canAccessSection(section: SectionId, account: string, roles: ContractRoles) {
  if (section === "overview" || section === "public") return true;
  if (section === "tenders" || section === "awards") return roles.authority;
  if (section === "admin") return roles.administrator;
  if (section === "sealed") return roles.company;
  if (section === "milestones") return roles.company || roles.authority || roles.controller || roles.administrator;
  return false;
}

const navigation: { id: SectionId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Vue d’ensemble", icon: LayoutDashboard },
  { id: "tenders", label: "Appels d’offres", icon: ClipboardList },
  { id: "sealed", label: "Offres scellées", icon: FileLock2 },
  { id: "awards", label: "Attributions", icon: BadgeCheck },
  { id: "milestones", label: "Jalons & paiements", icon: Milestone },
  { id: "public", label: "Transparence publique", icon: Eye },
  { id: "admin", label: "Administration", icon: ShieldCheck },
];

const workspaceSections: Record<WorkspaceRequest, SectionId> = {
  visitor: "public",
  company: "sealed",
  authority: "tenders",
  controller: "milestones",
  administrator: "admin",
};

const workspaceLabels: Record<WorkspaceRequest, string> = {
  visitor: "Visiteur public",
  company: "Entreprise",
  authority: "Autorité contractante",
  controller: "Contrôleur",
  administrator: "Administrateur",
};

type ProcurementDashboardProps = {
  entryProfile?: WorkspaceRequest;
  onReturnToLanding?: () => void;
};

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatDate(timestamp: bigint) {
  if (timestamp === 0n) return "—";
  return new Intl.DateTimeFormat("fr-CD", { dateStyle: "medium", timeZone: "Africa/Kinshasa" })
    .format(new Date(Number(timestamp) * 1000));
}

function formatAmount(amount: bigint) {
  return new Intl.NumberFormat("fr-CD").format(amount);
}

function getStatusClass(status: string) {
  if (status.includes("attribué") || status === "Terminé") return "status-green";
  if (status === "Révélations clôturées") return "status-neutral";
  if (status.includes("Révélation") || status === "À ouvrir") return "status-amber";
  if (status === "Annulé") return "status-orange";
  return "status-neutral";
}

export default function ProcurementDashboard({ entryProfile = "visitor", onReturnToLanding = () => {} }: ProcurementDashboardProps) {
  const [activeSection, setActiveSection] = useState<SectionId>(workspaceSections[entryProfile]);
  const [account, setAccount] = useState("");
  const [signer, setSigner] = useState<Signer | null>(null);
  const [roles, setRoles] = useState<ContractRoles>({ administrator: false, authority: false, controller: false, company: false });
  const [walletError, setWalletError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const companyRegistrationInFlight = useRef(new Set<string>());
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [contractError, setContractError] = useState("");
  const [now, setNow] = useState(0n);

  const hasContract = Boolean(contractAddress && /^0x[a-fA-F0-9]{40}$/.test(contractAddress));

  async function loadMarkets(provider?: JsonRpcProvider | BrowserProvider) {
    if (!hasContract || !contractAddress) {
      setMarkets([]);
      return;
    }

    setIsLoading(true);
    setContractError("");
    try {
      const readProvider = provider ?? createAmoyProvider();
      const contract = new Contract(contractAddress, procurementAbi, readProvider);
      const count = Number(await contract.marketCount());
      if (count > 300) throw new Error("Le nombre de marchés dépasse la limite de lecture de démonstration.");
      const rows = await Promise.all(
        Array.from({ length: count }, async (_, index) => {
          const marketId = BigInt(index + 1);
          const [market, paid] = await Promise.all([
            contract.markets(marketId),
            contract.totalPaid(marketId),
          ]);
          return {
            id: marketId,
            title: market.title as string,
            description: market.description as string,
            documentsCid: market.documentsCid as string,
            budget: market.indicativeBudget as bigint,
            commitDeadline: market.commitDeadline as bigint,
            revealDeadline: market.revealDeadline as bigint,
            status: Number(market.status),
            vendor: market.awardedVendor as string,
            awardedAmount: market.awardedAmount as bigint,
            decisionReference: market.decisionReference as string,
            awardedAt: market.awardedAt as bigint,
            totalPaid: paid as bigint,
          } satisfies MarketRow;
        }),
      );
      setMarkets(rows.reverse());
      setLastUpdated(new Intl.DateTimeFormat("fr-CD", { timeStyle: "short", timeZone: "Africa/Kinshasa" }).format(new Date()));
    } catch (error) {
      setContractError(error instanceof Error ? error.message : "Impossible de lire le contrat sur Polygon Amoy.");
    } finally {
      setIsLoading(false);
    }
  }

  async function connectWallet() {
    setWalletError("");
    const ethereum = (window as Window & { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!ethereum) {
      setWalletError("MetaMask n’est pas détecté dans ce navigateur.");
      return;
    }

    try {
      try {
        await ethereum.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
      } catch (permissionError) {
        const code = (permissionError as { code?: number }).code;
        if (code !== -32601 && code !== 4200) throw permissionError;
        await ethereum.request({ method: "eth_requestAccounts" });
      }
      try {
        await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: polygonAmoy.chainIdHex }] });
      } catch (switchError) {
        if ((switchError as { code?: number }).code !== 4902) throw switchError;
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: polygonAmoy.chainIdHex,
            chainName: polygonAmoy.name,
            nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
            rpcUrls: [polygonAmoy.rpcUrl],
            blockExplorerUrls: [polygonAmoy.explorer],
          }],
        });
      }

      await refreshWalletSession();
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "La connexion au portefeuille a échoué.");
    }
  }

  async function refreshWalletSession() {
    const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    if (!ethereum) return;

    try {
      const [rawAccounts, chainId] = await Promise.all([
        ethereum.request({ method: "eth_accounts" }),
        ethereum.request({ method: "eth_chainId" }),
      ]);
      const connectedAccount = Array.isArray(rawAccounts) && typeof rawAccounts[0] === "string" ? rawAccounts[0] : "";
      if (!connectedAccount) {
        setAccount("");
        setSigner(null);
        setRoles({ administrator: false, authority: false, controller: false, company: false });
        setProfileNotice("");
        setActiveSection(workspaceSections[entryProfile]);
        return;
      }

      if (String(chainId).toLowerCase() !== polygonAmoy.chainIdHex) {
        setAccount(connectedAccount);
        setSigner(null);
        setRoles({ administrator: false, authority: false, controller: false, company: false });
        setWalletError("Sélectionne Polygon Amoy dans MetaMask pour utiliser les espaces protégés.");
        setProfileNotice("");
        setActiveSection(workspaceSections[entryProfile]);
        return;
      }

      const provider = new BrowserProvider(ethereum as ConstructorParameters<typeof BrowserProvider>[0]);
      const signer = await provider.getSigner(connectedAccount);
      setAccount(connectedAccount);
      setSigner(signer);
      setWalletError("");

      const nextRoles = { administrator: false, authority: false, controller: false, company: false };
      if (hasContract && contractAddress) {
        const accessContract = new Contract(contractAddress, procurementAbi, createAmoyProvider());
        const authorityRole = await accessContract.AUTHORITY_ROLE();
        const controllerRole = await accessContract.CONTROLLER_ROLE();
        const companyRole = await accessContract.COMPANY_ROLE();
        const administrator = await accessContract.hasRole(ZeroHash, connectedAccount);
        const authority = await accessContract.hasRole(authorityRole, connectedAccount);
        const controller = await accessContract.hasRole(controllerRole, connectedAccount);
        const company = await accessContract.hasRole(companyRole, connectedAccount);
        Object.assign(nextRoles, { administrator, authority, controller, company });
      }
      setRoles(nextRoles);
      let actualProfile: WorkspaceRequest | null = nextRoles.administrator
        ? "administrator"
        : nextRoles.authority
          ? "authority"
          : nextRoles.controller
            ? "controller"
            : nextRoles.company
              ? "company"
              : null;

      if (entryProfile === "company" && !actualProfile && hasContract && contractAddress) {
        const accountKey = connectedAccount.toLowerCase();
        if (companyRegistrationInFlight.current.has(accountKey)) {
          setProfileNotice("Confirme l’inscription Entreprise dans MetaMask pour continuer.");
          return;
        }

        companyRegistrationInFlight.current.add(accountKey);
        setProfileNotice("Première connexion Entreprise : confirme l’inscription dans MetaMask. Seuls les frais de gas Amoy seront demandés.");
        try {
          const companyContract = new Contract(contractAddress, procurementAbi, signer);
          const transaction = await companyContract.getFunction("registerCompany")();
          await transaction.wait();
          nextRoles.company = true;
          setRoles({ ...nextRoles });
          actualProfile = "company";
        } finally {
          companyRegistrationInFlight.current.delete(accountKey);
        }
      }

      const requestedRoleExists = entryProfile === "visitor" || nextRoles[entryProfile];
      if (requestedRoleExists || (entryProfile === "company" && actualProfile === null)) {
        setProfileNotice("");
      } else if (actualProfile) {
        setProfileNotice(`Ce portefeuille est déjà associé au profil ${workspaceLabels[actualProfile]}. Il ne peut pas aussi se connecter comme ${workspaceLabels[entryProfile]}.`);
      } else {
        setProfileNotice(`Ce portefeuille n’a pas le rôle ${workspaceLabels[entryProfile]}. Demande à l’administrateur de l’attribuer.`);
      }
      setActiveSection(workspaceSections[entryProfile]);
      await loadMarkets(provider);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Impossible de synchroniser le compte MetaMask.");
    }
  }

  const syncWalletOnChange = useEffectEvent(() => {
    void refreshWalletSession();
  });

  const connectForEntryProfile = useEffectEvent(() => {
    if (entryProfile !== "visitor") void connectWallet();
  });

  const syncMarkets = useEffectEvent(() => {
    void loadMarkets();
  });

  useEffect(() => {
    const initialClock = window.setTimeout(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 0);
    const initialRefresh = window.setTimeout(syncMarkets, 0);
    const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    const handleWalletChange = () => window.setTimeout(syncWalletOnChange, 0);
    ethereum?.on?.("accountsChanged", handleWalletChange);
    ethereum?.on?.("chainChanged", handleWalletChange);
    const timer = window.setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 30_000);
    return () => {
      window.clearTimeout(initialClock);
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
      ethereum?.removeListener?.("accountsChanged", handleWalletChange);
      ethereum?.removeListener?.("chainChanged", handleWalletChange);
    };
  }, []);

  useEffect(() => {
    if (entryProfile === "visitor") return;
    const request = window.setTimeout(connectForEntryProfile, 0);
    return () => window.clearTimeout(request);
  }, [entryProfile]);

  const awardedMarkets = markets.filter((market) => market.status >= 2 && market.status < 4);
  const totalPaid = markets.reduce((total, market) => total + market.totalPaid, 0n);
  const sectionTitle = navigation.find((item) => item.id === activeSection)?.label ?? "Vue d’ensemble";
  const visibleNavigation = navigation.filter((item) => canAccessSection(item.id, account, roles));
  const workspaces = [
    { section: "public" as SectionId, title: "Visiteur public", detail: "Consulter les marchés et les décisions", status: "Accessible sans portefeuille", icon: Eye },
    ...(account && !roles.authority && !roles.controller && !roles.administrator ? [{
      section: "sealed" as SectionId,
      title: "Entreprise",
      detail: roles.company ? "Déposer et révéler une offre" : "L’administrateur doit activer ce portefeuille",
      status: roles.company ? "Rôle Entreprise actif" : "COMPANY_ROLE requis",
      icon: BriefcaseBusiness,
    }] : []),
    ...(roles.authority ? [{ section: "tenders" as SectionId, title: "Autorité contractante", detail: "Publier des marchés et attribuer", status: "Rôle actif sur cette adresse", icon: Landmark }] : []),
    ...(roles.controller ? [{ section: "milestones" as SectionId, title: "Contrôleur", detail: "Valider les étapes d’exécution", status: "Rôle actif sur cette adresse", icon: ShieldCheck }] : []),
    ...(roles.administrator ? [{ section: "admin" as SectionId, title: "Administrateur", detail: "Attribuer ou révoquer les rôles métier", status: "Rôle administrateur actif", icon: Settings2 }] : []),
  ];

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <button type="button" className="mb-9 flex items-center gap-3 px-1 text-left" onClick={onReturnToLanding} aria-label="Retour au portail Mukanda">
          <span className="brand-mark"><Blocks size={20} strokeWidth={2.2} /></span>
          <span className="brand-copy min-w-0">
            <span className="block text-[17px] font-bold leading-tight">mukanda</span>
            <span className="mt-1 block text-[10px] font-medium uppercase text-[#748178]">marchés publics</span>
          </span>
          <ArrowLeft size={14} className="ml-auto text-[#748178]" />
        </button>

        <div className="mb-3 px-3 text-[10px] font-semibold uppercase text-[#8a958e]">Espace de travail</div>
        <nav className="flex flex-col gap-1" aria-label="Navigation principale">
          {visibleNavigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="nav-link"
              aria-current={activeSection === id ? "page" : undefined}
              title={label}
              onClick={() => setActiveSection(id)}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span className="nav-copy text-[13px]">{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-note mt-auto border-t border-[#dce3dc] pt-4">
          <div className="flex items-center gap-2 px-2 text-[11px] font-semibold text-[#52645a]">
            <ShieldCheck size={15} className="text-[#17684f]" /> Réseau de démonstration
          </div>
          <div className="mt-2 px-2 text-[11px] leading-5 text-[#78847c]">Polygon Amoy · aucun fonds réels</div>
        </div>
      </aside>

      <main className="content-area">
        <header className="topbar">
          <div className="flex min-w-0 items-center gap-2 text-[12px] text-[#78847c]">
            <span className="hidden sm:inline">Groupe 19</span>
            <span className="hidden text-[#b5bdb7] sm:inline">/</span>
            <span className="truncate">Université de Kinshasa</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-[#dce3dc] bg-white px-3 py-2 text-[11px] font-semibold text-[#365a49] md:inline-flex">
              <CircleDot size={13} className="text-[#25835f]" /> Polygon Amoy
            </span>
            {account ? (
              <button type="button" onClick={connectWallet} title="Changer le compte MetaMask autorisé pour cette application" aria-label={`Compte connecté ${shortenAddress(account)}. Cliquer pour choisir un autre compte MetaMask.`} className="flex h-9 items-center gap-2 rounded-md border border-[#dce3dc] bg-white px-3 text-[12px] font-medium hover:bg-[#f7f9f6]">
                <WalletCards size={15} className="text-[#17684f]" />
                <span className="mono">{shortenAddress(account)}</span>
                <RefreshCw size={12} className="text-[#718078]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={connectWallet}
                className="flex h-9 items-center gap-2 rounded-md bg-[#17684f] px-3 text-[12px] font-semibold text-white transition hover:bg-[#104c3a]"
              >
                <WalletCards size={15} />
                <span className="hidden sm:inline">Connecter / choisir un compte</span>
                <span className="sm:hidden">Connecter</span>
              </button>
            )}
            <span className="grid size-9 place-items-center rounded-md border border-[#dce3dc] bg-white text-[#52645a]" aria-label="Aucune notification" title="Aucune notification">
              <Bell size={16} />
            </span>
          </div>
        </header>

        <div className="mx-auto max-w-[1320px]">
          <section className="fade-in flex flex-wrap items-end justify-between gap-5 pb-6 pt-8">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase text-[#688075]">
                <span className="size-1.5 rounded-full bg-[#25835f]" /> Plateforme de suivi public
              </div>
              <h1 className="max-w-[740px] text-[26px] font-semibold leading-[1.15] text-[#1a2e28] sm:text-[30px]">
                Transparence des marchés publics
              </h1>
              <p className="mt-2 max-w-[660px] text-[14px] leading-6 text-[#64736c]">
                Des appels d’offres aux jalons d’exécution, chaque décision vérifiable au même endroit.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#728078]">
              <Clock3 size={14} />
              {lastUpdated ? `Actualisé à ${lastUpdated}` : "Données en attente de configuration"}
              {hasContract && (
                <button type="button" className="ml-1 grid size-8 place-items-center rounded-md border border-[#dce3dc] bg-white text-[#52645a] hover:bg-[#f7f9f6]" title="Actualiser les données" aria-label="Actualiser les données" onClick={() => void loadMarkets()}>
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          </section>

          {(walletError || contractError || profileNotice) && (
            <div role="alert" className="mb-5 flex items-start gap-3 rounded-md border border-[#e7c9bd] bg-[#fff8f5] px-4 py-3 text-[12px] text-[#8f432c]">
              <CircleAlert size={16} className="mt-0.5 shrink-0" />
              <span>{walletError || contractError || profileNotice}</span>
            </div>
          )}

          {activeSection === "overview" && (
            <>
              <section className="fade-in-delay grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs publics">
                <Metric icon={ClipboardList} label="Appels d’offres" value={hasContract ? String(markets.length) : "—"} detail="Inscrits sur le contrat" />
                <Metric icon={BriefcaseBusiness} label="Marchés attribués" value={hasContract ? String(awardedMarkets.length) : "—"} detail="Décision enregistrée" accent="green" />
                <Metric icon={WalletCards} label="Paiements simulés" value={hasContract ? formatAmount(totalPaid) : "—"} detail="Unités comptables fictives" accent="amber" />
                <Metric icon={FileCheck2} label="Réseau cible" value="Amoy" detail="Polygon · chaîne 80002" accent="orange" />
              </section>

              <section className="mt-6" aria-label="Espaces par profil">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-[14px] font-semibold">Choisir un espace</h2>
                    <p className="mt-1 text-[11px] text-[#758178]">Les actions disponibles dépendent du portefeuille connecté.</p>
                  </div>
                  <span className="text-[10px] text-[#7b877f]">Aucun compte entreprise à créer</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {workspaces.map((workspace) => (
                    <WorkspaceCard key={workspace.section} {...workspace} onSelect={() => setActiveSection(workspace.section)} />
                  ))}
                </div>
              </section>

              {!hasContract && (
                <section className="surface mt-5 flex flex-col gap-4 border-dashed bg-[#fbfcfa] p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#e6f0e9] text-[#17684f]"><Landmark size={17} /></span>
                    <div>
                      <h2 className="text-[13px] font-semibold">Contrat non configuré</h2>
                      <p className="mt-1 max-w-[620px] text-[12px] leading-5 text-[#64736c]">
                        L’interface est prête pour Polygon Amoy. Les chiffres et appels d’offres apparaîtront après déploiement et configuration de l’adresse du contrat.
                      </p>
                    </div>
                  </div>
                  <span className="mono inline-flex w-fit shrink-0 items-center gap-2 rounded bg-[#eef2ed] px-2.5 py-1.5 text-[10px] text-[#64736c]">
                    <CircleDot size={11} /> NEXT_PUBLIC_CONTRACT_ADDRESS
                  </span>
                </section>
              )}

              <section className="mt-7 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
                <div className="surface min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ece7] px-5 py-4">
                    <div>
                      <h2 className="text-[14px] font-semibold">Appels d’offres récents</h2>
                      <p className="mt-1 text-[11px] text-[#758178]">Lecture directe depuis le contrat public</p>
                    </div>
                    <button type="button" onClick={() => setActiveSection("tenders")} className="flex items-center gap-1 text-[11px] font-semibold text-[#17684f] hover:text-[#104c3a]">
                      Voir tous <ArrowUpRight size={13} />
                    </button>
                  </div>
                  {isLoading ? (
                    <div className="px-5 py-12 text-center text-[12px] text-[#758178]">Chargement des données Polygon Amoy…</div>
                  ) : markets.length ? (
                    <MarketTable markets={markets.slice(0, 5)} now={now} />
                  ) : (
                    <div className="flex min-h-[190px] flex-col items-center justify-center px-6 text-center">
                      <span className="grid size-10 place-items-center rounded-full bg-[#f0f3ef] text-[#748178]"><Search size={17} /></span>
                      <p className="mt-3 text-[12px] font-semibold">Aucun appel d’offres à afficher</p>
                      <p className="mt-1 max-w-[310px] text-[11px] leading-5 text-[#7b877f]">
                        {hasContract ? "Aucun marché n’a encore été publié sur ce contrat." : "Les données apparaîtront ici après le déploiement du contrat."}
                      </p>
                    </div>
                  )}
                </div>

                <div className="surface">
                  <div className="border-b border-[#e8ece7] px-5 py-4">
                    <h2 className="text-[14px] font-semibold">Traçabilité du projet</h2>
                    <p className="mt-1 text-[11px] text-[#758178]">Règles et sources de confiance</p>
                  </div>
                  <div className="divide-y divide-[#e8ece7] px-5">
                    <TraceRow icon={FileLock2} title="Offres scellées" detail="Engagement avant révélation" />
                    <TraceRow icon={ShieldCheck} title="Rôles vérifiés" detail="Autorisations appliquées on-chain" />
                    <TraceRow icon={Milestone} title="Jalons à double contrôle" detail="Autorité + contrôleur" />
                  </div>
                  <div className="mx-5 mb-5 mt-4 rounded-md bg-[#f3f6f2] p-3 text-[10px] leading-[1.7] text-[#65736b]">
                    La blockchain trace les opérations, mais ne garantit pas à elle seule l’équité d’une décision administrative.
                  </div>
                </div>
              </section>
            </>
          )}

          {activeSection !== "overview" && (
            <SectionView
              id={activeSection}
              title={sectionTitle}
              markets={markets}
              now={now}
              isConfigured={hasContract}
              isLoading={isLoading}
              account={account}
              signer={signer}
              roles={roles}
              onRefresh={() => loadMarkets()}
              onRoleRefresh={() => refreshWalletSession()}
            />
          )}

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#dce3dc] pt-4 text-[10px] text-[#78847c]">
            <span>Projet académique · Groupe 19 · Kinshasa</span>
            <a className="flex items-center gap-1 text-[#52645a] no-underline hover:text-[#17684f]" href={polygonAmoy.explorer} target="_blank" rel="noreferrer">
              Explorateur Polygon Amoy <ArrowUpRight size={12} />
            </a>
          </footer>
        </div>
      </main>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  accent = "neutral",
}: {
  icon: typeof LayoutDashboard;
  label: string;
  value: string;
  detail: string;
  accent?: "neutral" | "green" | "amber" | "orange";
}) {
  const accentClasses = {
    neutral: "bg-[#f0f3ef] text-[#58675f]",
    green: "bg-[#e6f0e9] text-[#17684f]",
    amber: "bg-[#f7efdc] text-[#9a650f]",
    orange: "bg-[#f8e9e3] text-[#ae4e31]",
  };

  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#68766e]">{label}</span>
        <span className={`grid size-8 place-items-center rounded-md ${accentClasses[accent]}`}><Icon size={16} /></span>
      </div>
      <div className="metric-value mt-4 text-[26px] font-medium leading-none text-[#1a2e28]">{value}</div>
      <div className="mt-2 text-[10px] text-[#818c84]">{detail}</div>
    </div>
  );
}

function MarketTable({ markets, now }: { markets: MarketRow[]; now: bigint }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Marché</th>
            <th>Statut</th>
            <th>Échéance</th>
            <th>Budget indicatif</th>
            <th>Titulaire / décision</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((market) => {
            const status = getMarketStatusLabel(market.status, market.commitDeadline, market.revealDeadline, now);
            const deadline = market.status <= 1 ? market.commitDeadline : market.awardedAt;
            return (
              <tr key={String(market.id)}>
                <td>
                  <span className="mono block text-[10px] text-[#87928a]">MP-{String(market.id).padStart(4, "0")}</span>
                  <span className="mt-1 block max-w-[300px] truncate text-[12px] font-semibold text-[#253b31]">{market.title}</span>
                </td>
                <td><span className={`status-pill ${getStatusClass(status)}`}><span className="size-1.5 rounded-full bg-current" />{status}</span></td>
                <td className="text-[11px] text-[#5f6e65]">{formatDate(deadline)}</td>
                <td className="mono text-[11px] text-[#33483d]">{formatAmount(market.budget)} <span className="text-[#8b958e]">unités*</span></td>
                <td>
                  {market.status === 2 || market.status === 3 ? (
                    <>
                      <span className="mono block text-[10px] text-[#33483d]">{shortenAddress(market.vendor)}</span>
                      <span className="mt-1 block max-w-[190px] truncate text-[9px] text-[#78847c]">{market.decisionReference} · {formatAmount(market.awardedAmount)} unités</span>
                    </>
                  ) : <span className="text-[10px] text-[#9aa39d]">Non attribué</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-4 pb-3 pt-1 text-[9px] text-[#89938c]">* Unités de démonstration, aucun paiement réel.</p>
    </div>
  );
}

function TraceRow({ icon: Icon, title, detail }: { icon: typeof LayoutDashboard; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#f0f3ef] text-[#466658]"><Icon size={15} /></span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold">{title}</div>
        <div className="mt-0.5 truncate text-[10px] text-[#78847c]">{detail}</div>
      </div>
      <ArrowDownRight size={14} className="ml-auto shrink-0 text-[#9ba69e]" />
    </div>
  );
}

function SectionView({
  id,
  title,
  markets,
  now,
  isConfigured,
  isLoading,
  account,
  signer,
  roles,
  onRefresh,
  onRoleRefresh,
}: {
  id: SectionId;
  title: string;
  markets: MarketRow[];
  now: bigint;
  isConfigured: boolean;
  isLoading: boolean;
  account: string;
  signer: Signer | null;
  roles: ContractRoles;
  onRefresh: () => Promise<void>;
  onRoleRefresh: () => Promise<void>;
}) {
  const listedMarkets = id === "awards" ? markets.filter((market) => market.status === 2 || market.status === 3) : markets;
  const icon = id === "admin" ? ShieldCheck : id === "public" ? Eye : id === "milestones" ? Milestone : id === "sealed" ? FileLock2 : id === "awards" ? BadgeCheck : ClipboardList;
  const Icon = icon;

  return (
    <section className="fade-in mt-7">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase text-[#78847c]">
            <Icon size={13} /> {id === "admin" ? "Espace d’administration" : "Espace de consultation"}
          </div>
          <h2 className="text-[20px] font-semibold">{title}</h2>
        </div>
        <span className="rounded border border-[#dce3dc] bg-white px-2.5 py-1.5 text-[10px] text-[#64736c]">
          {id === "admin" && roles.administrator ? "Administrateur connecté" : isConfigured ? `${listedMarkets.length} résultat${listedMarkets.length === 1 ? "" : "s"}` : "Contrat non configuré"}
        </span>
      </div>

      <WorkflowPanel
        activeSection={id}
        markets={markets}
        account={account}
        signer={signer}
        roles={roles}
        isConfigured={isConfigured}
        onRefresh={onRefresh}
        onRoleRefresh={onRoleRefresh}
      />

      {id === "sealed" && (
        <div className="mb-4 flex items-start gap-3 rounded-md border border-[#ead9ad] bg-[#fbf6e9] px-4 py-3 text-[11px] leading-5 text-[#765614]">
          <FileLock2 size={16} className="mt-0.5 shrink-0" />
          Avant la révélation, la chaîne ne contient que l’engagement. Les entreprises doivent conserver leur secret et leur sauvegarde chiffrée ; une entreprise qui ne révèle pas son offre ne peut pas être évaluée.
        </div>
      )}

      {id === "milestones" && (
        <div className="mb-4 flex items-start gap-3 rounded-md border border-[#dce3dc] bg-white px-4 py-3 text-[11px] leading-5 text-[#64736c]">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#17684f]" />
          Les paiements de cette démonstration sont un registre comptable simulé. Le contrat ne transfère ni jetons ni monnaie.
        </div>
      )}

      <div className="surface overflow-hidden">
        {isLoading ? (
          <div className="px-5 py-14 text-center text-[12px] text-[#758178]">Lecture du contrat…</div>
        ) : listedMarkets.length ? (
          <MarketTable markets={listedMarkets} now={now} />
        ) : (
          <div className="flex min-h-[250px] flex-col items-center justify-center px-5 text-center">
            <span className="grid size-11 place-items-center rounded-md bg-[#f0f3ef] text-[#66766d]"><Search size={18} /></span>
            <p className="mt-3 text-[13px] font-semibold">{isConfigured ? "Aucun résultat pour le moment" : "Lecture en attente du contrat"}</p>
            <p className="mt-1 max-w-[420px] text-[11px] leading-5 text-[#78847c]">
              {isConfigured ? "Les appels d’offres et leurs transitions apparaîtront ici après leur inscription sur Polygon Amoy." : "Cette vue se remplira automatiquement dès que l’adresse réelle du contrat sera configurée."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function WorkspaceCard({
  section,
  title,
  detail,
  status,
  icon: Icon,
  onSelect,
}: {
  section: SectionId;
  title: string;
  detail: string;
  status: string;
  icon: typeof LayoutDashboard;
  onSelect: () => void;
}) {
  const active = status.includes("actif") || status.includes("connecté") || status.includes("Accessible");
  return (
    <button type="button" data-section={section} className="surface flex min-h-[92px] items-start gap-3 p-3 text-left transition hover:border-[#a9c5b2] hover:bg-[#fbfcfa]" onClick={onSelect} aria-label={`${title} : ${status}`}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-md ${active ? "bg-[#e6f0e9] text-[#17684f]" : "bg-[#f1f2ef] text-[#7b877f]"}`}>
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold text-[#253b31]">{title}</span>
        <span className="mt-1 block text-[10px] leading-4 text-[#718078]">{detail}</span>
        <span className={`mt-2 block text-[9px] font-semibold ${active ? "text-[#17684f]" : "text-[#9a650f]"}`}>{status}</span>
      </span>
    </button>
  );
}