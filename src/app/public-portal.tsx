"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Blocks,
  BriefcaseBusiness,
  CircleAlert,
  CircleDot,
  ClipboardList,
  Eye,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  X,
} from "lucide-react";
import { Contract } from "ethers";
import { useEffect, useState } from "react";
import ProcurementDashboard from "@/app/procurement-dashboard";
import { createAmoyProvider, marketStatuses, procurementAbi } from "@/lib/procurement";
import type { WorkspaceRequest } from "@/lib/procurement";

type TenderSummary = {
  id: bigint;
  title: string;
  status: string;
  deadline: string;
  budget: string;
};

type RoleOption = {
  id: WorkspaceRequest;
  title: string;
  detail: string;
  icon: typeof Eye;
  access: string;
};

const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

const roleOptions: RoleOption[] = [
  { id: "visitor", title: "Visiteur public", detail: "Consulter les marchés et les décisions", icon: Eye, access: "Sans portefeuille" },
  { id: "company", title: "Entreprise", detail: "Participer à un appel d’offres", icon: BriefcaseBusiness, access: "Inscription ou rôle Entreprise" },
  { id: "authority", title: "Autorité contractante", detail: "Publier et attribuer un marché", icon: Landmark, access: "Rôle attribué par l’administration" },
  { id: "controller", title: "Contrôleur", detail: "Valider les jalons d’exécution", icon: ShieldCheck, access: "Rôle attribué par l’administration" },
  { id: "administrator", title: "Administrateur", detail: "Gérer les rôles métier", icon: BadgeCheck, access: "Portefeuille administrateur" },
];

function displayStatus(status: number, commitDeadline: bigint) {
  if (status === 0 && BigInt(Math.floor(Date.now() / 1000)) >= commitDeadline) return "À ouvrir";
  return marketStatuses[status] ?? "Statut inconnu";
}

function formatPublicDate(timestamp: bigint) {
  return new Intl.DateTimeFormat("fr-CD", { dateStyle: "medium", timeZone: "Africa/Kinshasa" })
    .format(new Date(Number(timestamp) * 1000));
}

function formatPublicAmount(amount: bigint) {
  return new Intl.NumberFormat("fr-CD").format(amount);
}

export default function PublicPortal() {
  const [selectedProfile, setSelectedProfile] = useState<WorkspaceRequest | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  function chooseProfile(profile: WorkspaceRequest) {
    setIsLoginOpen(false);
    setSelectedProfile(profile);
  }

  if (selectedProfile) {
    return (
      <ProcurementDashboard
        key={selectedProfile}
        entryProfile={selectedProfile}
        onReturnToLanding={() => setSelectedProfile(null)}
      />
    );
  }

  return (
    <PublicHome
      isLoginOpen={isLoginOpen}
      onOpenLogin={() => setIsLoginOpen(true)}
      onCloseLogin={() => setIsLoginOpen(false)}
      onSelectProfile={chooseProfile}
    />
  );
}

function PublicHome({
  isLoginOpen,
  onOpenLogin,
  onCloseLogin,
  onSelectProfile,
}: {
  isLoginOpen: boolean;
  onOpenLogin: () => void;
  onCloseLogin: () => void;
  onSelectProfile: (profile: WorkspaceRequest) => void;
}) {
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [marketCount, setMarketCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
          if (active) {
            setMarketCount(null);
            setIsLoading(false);
          }
          return;
        }

        try {
          const contract = new Contract(contractAddress, procurementAbi, createAmoyProvider());
          const count = Number(await contract.marketCount());
          if (count > 300) throw new Error("Le volume dépasse la limite de lecture publique.");
          const rows: TenderSummary[] = [];
          for (let marketNumber = count; marketNumber > Math.max(0, count - 5); marketNumber -= 1) {
            const marketId = BigInt(marketNumber);
            const market = await contract.markets(marketId);
            const status = Number(market.status);
            const deadline = status <= 1 ? market.commitDeadline as bigint : market.awardedAt as bigint;
            rows.push({
              id: marketId,
              title: market.title as string,
              status: displayStatus(status, market.commitDeadline as bigint),
              deadline: formatPublicDate(deadline),
              budget: formatPublicAmount(market.indicativeBudget as bigint),
            });
          }
          if (active) {
            setMarketCount(count);
            setTenders(rows);
            setLoadError("");
          }
        } catch (error) {
          if (active) setLoadError(error instanceof Error ? error.message : "Les données publiques sont temporairement indisponibles.");
        } finally {
          if (active) setIsLoading(false);
        }
      })();
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="public-portal">
      <header className="public-header">
        <a href="#accueil" className="public-brand" aria-label="Mukanda, accueil public">
          <span className="brand-mark"><Blocks size={20} strokeWidth={2.2} /></span>
          <span>
            <strong>mukanda</strong>
            <small>marchés publics</small>
          </span>
        </a>
        <nav className="public-nav" aria-label="Navigation publique">
          <a href="#marches">Marchés</a>
          <a href="#transparence">Transparence</a>
          <span className="public-network"><CircleDot size={13} /> Polygon Amoy</span>
        </nav>
        <button type="button" className="public-login-button" onClick={onOpenLogin}>
          Se connecter <ArrowUpRight size={15} />
        </button>
      </header>

      <section id="accueil" className="public-hero">
        <div className="public-hero-image" role="img" aria-label="Architecture institutionnelle contemporaine" />
        <div className="public-hero-copy">
          <p className="public-eyebrow"><span /> UNIVERSITÉ DE KINSHASA · GROUPE 19</p>
          <h1>Les marchés publics, visibles à chaque étape.</h1>
          <p className="public-hero-description">Appels d’offres, décisions et jalons consignés sur un registre public, pour une consultation accessible à tous.</p>
          <div className="public-hero-actions">
            <button type="button" className="public-primary-button" onClick={onOpenLogin}>Accéder à la plateforme <ArrowUpRight size={16} /></button>
            <a className="public-secondary-link" href="#marches">Voir les marchés <ArrowDown size={15} /></a>
          </div>
          <div className="public-hero-footnote"><LockKeyhole size={13} /> Offres engagées avant révélation · Polygon Amoy</div>
        </div>
        <div className="public-hero-index"><span>01</span> PORTAIL DE TRANSPARENCE</div>
      </section>

      <section className="public-stat-band" aria-label="État du registre public">
        <div className="public-stat">
          <span className="public-stat-label">Marchés inscrits</span>
          <strong>{marketCount === null ? "—" : marketCount}</strong>
          <small>{isLoading ? "Lecture du registre…" : "Lecture sur Polygon Amoy"}</small>
        </div>
        <div className="public-stat">
          <span className="public-stat-label">Réseau</span>
          <strong>Amoy</strong>
          <small>Polygon · chaîne 80002</small>
        </div>
        <div className="public-stat">
          <span className="public-stat-label">Règlement</span>
          <strong>Simulé</strong>
          <small>Aucun transfert de fonds réels</small>
        </div>
      </section>

      <section id="marches" className="public-market-section">
        <div className="public-section-heading">
          <div>
            <p className="public-eyebrow public-eyebrow-dark"><span /> REGISTRE PUBLIC</p>
            <h2>Appels d’offres publiés</h2>
          </div>
          <span className="public-record-count">{marketCount === null ? "Connexion en lecture" : `${marketCount} marché${marketCount === 1 ? "" : "s"}`}</span>
        </div>

        {loadError && <p className="public-load-error" role="status">{loadError}</p>}
        {isLoading ? (
          <div className="public-empty-state"><span className="public-loading-mark" /><p>Lecture du registre Polygon Amoy</p></div>
        ) : tenders.length > 0 ? (
          <div className="public-tender-list">
            <div className="public-tender-head"><span>Référence / objet</span><span>Statut</span><span>Échéance / décision</span><span>Budget indicatif</span></div>
            {tenders.map((tender) => (
              <article className="public-tender-row" key={String(tender.id)}>
                <div><small>MP-{String(tender.id).padStart(4, "0")}</small><strong>{tender.title}</strong></div>
                <span className="public-status"><i />{tender.status}</span>
                <span className="public-tender-date">{tender.deadline}</span>
                <span className="public-tender-budget">{tender.budget} <small>unités*</small></span>
              </article>
            ))}
            <p className="public-data-note">Les détails et les événements sont vérifiables sur PolygonScan. *Valeurs de démonstration, pas une devise.</p>
          </div>
        ) : (
          <div className="public-empty-state">
            <span className="public-empty-icon"><ClipboardList size={20} /></span>
            <p>{loadError ? "Le registre est momentanément inaccessible." : marketCount === null ? "Le registre public sera disponible après la configuration du contrat." : "Aucun appel d’offres n’a encore été publié."}</p>
          </div>
        )}
      </section>

      <section id="transparence" className="public-principles">
        <div>
          <p className="public-eyebrow public-eyebrow-dark"><span /> PRINCIPES</p>
          <h2>La trace est publique.<br />La décision reste humaine.</h2>
        </div>
        <div className="public-principle-list">
          <article><span>01</span><div><strong>Engagement scellé</strong><p>Le montant est engagé avant la clôture ; la révélation est vérifiée ensuite par le contrat.</p></div></article>
          <article><span>02</span><div><strong>Rôles contrôlés</strong><p>Entreprise, autorité et contrôleur disposent de droits séparés, vérifiés sur la blockchain.</p></div></article>
          <article><span>03</span><div><strong>Jalons traçables</strong><p>Les validations sont publiques ; les paiements de cette démonstration sont fictifs.</p></div></article>
        </div>
      </section>

      <footer className="public-footer">
        <a href="#accueil" className="public-brand"><span className="brand-mark"><Blocks size={18} /></span><span><strong>mukanda</strong><small>Groupe 19 · Kinshasa</small></span></a>
        <span>Prototype académique · Polygon Amoy · aucun fonds réels</span>
        <a href="https://amoy.polygonscan.com" target="_blank" rel="noreferrer">Explorateur <ArrowUpRight size={13} /></a>
      </footer>

      {isLoginOpen && <ProfileDialog onClose={onCloseLogin} onSelect={onSelectProfile} />}
    </main>
  );
}

function ProfileDialog({ onClose, onSelect }: { onClose: () => void; onSelect: (profile: WorkspaceRequest) => void }) {
  return (
    <div className="profile-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div className="profile-dialog-header">
          <div><p className="public-eyebrow public-eyebrow-dark"><span /> ACCÈS À LA PLATEFORME</p><h2 id="profile-title">Choisir un espace</h2></div>
          <button type="button" className="profile-close" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <p className="profile-dialog-copy">La connexion se fait avec MetaMask. Le contrat vérifiera que ce portefeuille possède le rôle choisi.</p>
        <div className="profile-option-list">
          {roleOptions.map(({ id, title, detail, icon: Icon, access }) => (
            <button type="button" className="profile-option" key={id} onClick={() => onSelect(id)}>
              <span className="profile-option-icon"><Icon size={17} /></span>
              <span className="profile-option-text"><strong>{title}</strong><small>{detail}</small><em>{access}</em></span>
              <ArrowRight size={16} className="profile-option-arrow" />
            </button>
          ))}
        </div>
        <p className="profile-dialog-note"><CircleAlert size={14} /> Un portefeuille ne peut pas cumuler Entreprise, Autorité et Contrôleur. L’administrateur attribue les rôles privilégiés.</p>
      </section>
    </div>
  );
}