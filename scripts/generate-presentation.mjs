import { mkdir } from "node:fs/promises";
import path from "node:path";
import pptxgen from "pptxgenjs";

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Groupe 19 · Université de Kinshasa";
pptx.subject = "Transparence des marchés publics par blockchain";
pptx.title = "Mukanda · Offres scellées et paiements par jalons";
pptx.company = "Université de Kinshasa";
pptx.lang = "fr-CD";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "fr-CD",
};
pptx.defineSlideMaster({
  title: "CONTENT",
  background: { color: "F3F5F0" },
  objects: [
    { rect: { x: 0, y: 0, w: 0.16, h: 7.5, line: { color: "17684F", transparency: 100 }, fill: { color: "17684F" } } },
    { text: { text: "MUKANDA  /  GROUPE 19", options: { x: 0.58, y: 0.28, w: 4.5, h: 0.22, fontFace: "Aptos", fontSize: 8, bold: true, color: "567064", margin: 0 } } },
    { text: { text: "UNIVERSITÉ DE KINSHASA · M1 MATHS, STATISTIQUES ET INFORMATIQUE", options: { x: 5.35, y: 7.12, w: 7.35, h: 0.18, fontFace: "Aptos", fontSize: 7, color: "748178", align: "right", margin: 0 } } },
  ],
  slideNumber: { x: 12.62, y: 7.1, color: "17684F", fontFace: "Aptos", fontSize: 8 },
});

const slides = [
  {
    section: "PROJET BLOCKCHAIN · 2026",
    title: "Transparence des\nmarchés publics",
    subtitle: "Offres scellées · décisions traçables · paiements par jalons",
    callout: "MUKANDA",
    bullets: ["Groupe 19", "Kazadi Kabuya Augustin", "Luabeya Mukendi Barnabe", "Mbuyi Mutungilayi Benjamin"],
    cover: true,
  },
  {
    section: "01 · CONTEXTE",
    title: "Le défi de confiance",
    bullets: [
      "Un appel d’offres implique plusieurs acteurs, documents et échéances.",
      "Les offres doivent rester confidentielles jusqu’à la clôture.",
      "Les décisions et l’exécution doivent laisser des preuves vérifiables.",
      "La blockchain trace les opérations, sans remplacer le contrôle humain.",
    ],
    callout: "TRACER\nSANS\nPRÉTENDRE\nARBITRER",
  },
  {
    section: "02 · OBJECTIF",
    title: "Un registre partagé, des règles vérifiables",
    bullets: [
      "Publier un marché et son calendrier sur Polygon Amoy.",
      "Engager une offre avant l’échéance sans publier son contenu.",
      "Vérifier la révélation et enregistrer la décision d’attribution.",
      "Tracer les jalons et exiger deux validations avant leur paiement simulé.",
    ],
    callout: "5 rôles\n3 contrôles\n0 paiement réel",
  },
  {
    section: "03 · ARCHITECTURE",
    title: "Une DApp à trois frontières",
    bullets: [
      "Next.js, React, TypeScript et Tailwind pour l’interface française.",
      "MetaMask et ethers.js signent les transactions depuis le navigateur.",
      "Solidity + OpenZeppelin AccessControl appliquent les autorisations.",
      "Pinata conserve les dossiers IPFS ; le serveur garde le JWT secret.",
      "Hardhat compile, teste et prépare le déploiement sur Amoy.",
    ],
    callout: "UI\n↓\nCONTRAT\n↓\nÉVÉNEMENTS",
  },
  {
    section: "04 · DONNÉES",
    title: "Ce qui va sur chaîne et hors chaîne",
    bullets: [
      "Sur chaîne : titre, calendrier, budget indicatif, CID et empreinte SHA-256.",
      "Avant révélation : uniquement l’engagement cryptographique et l’adresse du portefeuille.",
      "Après révélation : montant et empreinte de l’offre deviennent publics.",
      "Hors chaîne : dossiers IPFS et sauvegarde locale chiffrée du soumissionnaire.",
      "Ne jamais téléverser de document personnel ou confidentiel non chiffré.",
    ],
    callout: "CID ≠\nCONFIDENTIALITÉ",
  },
  {
    section: "05 · RÔLES",
    title: "Les permissions vivent dans le contrat",
    bullets: [
      "Administrateur : attribue les rôles OpenZeppelin.",
      "Autorité contractante : publie les marchés, attribue et définit les jalons.",
      "Entreprise : engage et révèle son offre, puis demande un jalon.",
      "Contrôleur : apporte la seconde approbation d’exécution.",
      "Visiteur : consulte les informations publiques sans signer.",
    ],
    callout: "ACCÈS\nVÉRIFIÉ\nON-CHAIN",
  },
  {
    section: "06 · COMMIT-REVEAL",
    title: "Deux phases pour sceller l’offre",
    bullets: [
      "1. Engagement avant la date limite : l’entreprise signe un hash opaque.",
      "2. Révélation pendant la fenêtre prévue : montant, empreinte et secret.",
      "Le contrat recalcule l’engagement et rejette toute différence.",
      "Un engagement ne peut être soumis ou révélé deux fois.",
    ],
    callout: "ENGAGER\n→\nATTENDRE\n→\nRÉVÉLER",
  },
  {
    section: "07 · CRYPTOGRAPHIE",
    title: "L’engagement lie l’offre à son auteur",
    bullets: [
      "Préimage : identifiant du marché, adresse, montant, hash de l’offre et secret aléatoire.",
      "Encodage Solidity : abi.encode, sans ambiguïté de concaténation.",
      "Le secret est généré par un CSPRNG et conservé dans une sauvegarde AES-GCM.",
      "PBKDF2-SHA-256 dérive la clé à partir du mot de passe de sauvegarde.",
    ],
    callout: "keccak256\n(abi.encode(…))",
  },
  {
    section: "08 · ATTRIBUTION",
    title: "La décision reste administrative",
    bullets: [
      "Le contrat interdit l’attribution avant la clôture de la révélation.",
      "Le titulaire doit avoir révélé une offre valide dans le budget indicatif.",
      "L’autorité inscrit le titulaire et la référence de sa décision.",
      "Les événements permettent de retrouver les transactions sur l’explorateur.",
      "La blockchain prouve l’enregistrement, pas la justice du choix.",
    ],
    callout: "RÈGLES\n≠\nJUGEMENT\nHUMAIN",
  },
  {
    section: "09 · EXÉCUTION",
    title: "Jalons à double contrôle",
    bullets: [
      "L’autorité crée des jalons dont le total est plafonné au montant attribué.",
      "Le titulaire demande la validation de chaque étape.",
      "L’autorité et un contrôleur distinct doivent approuver.",
      "Une étape validée ne peut être libérée deux fois.",
      "La démonstration met à jour un registre fictif : aucun jeton n’est transféré.",
    ],
    callout: "AUTORITÉ\n+\nCONTRÔLEUR\n=\nVALIDATION",
  },
  {
    section: "10 · INTERFACE",
    title: "Un tableau de bord en français",
    bullets: [
      "Consultation des marchés et des échéances depuis le contrat.",
      "MetaMask est basculé vers Polygon Amoy et les rôles sont relus sur chaîne.",
      "Les formulaires de publication, d’offre, d’attribution et de jalons sont reliés aux transactions.",
      "Les états de chargement, erreurs et liens explorateur sont visibles.",
      "Sans adresse de contrat, l’application indique explicitement l’état non configuré.",
    ],
    callout: "RESPONSIVE\nET\nCONNECTÉE",
  },
  {
    section: "11 · SÉCURITÉ",
    title: "Réduire les risques, expliciter les limites",
    bullets: [
      "Contrôles de rôles et de phases dans Solidity, pas seulement dans l’interface.",
      "Aucun transfert financier ni donnée personnelle en clair sur la chaîne.",
      "La sauvegarde chiffrée est indispensable : un secret perdu bloque la révélation.",
      "Un fichier public sur IPFS ne devient pas confidentiel par son CID.",
      "Un audit automatisé ne constitue pas une preuve d’absence de vulnérabilité.",
    ],
    callout: "SÉCURITÉ\nPAR\nCONCEPTION",
  },
  {
    section: "12 · TESTS",
    title: "Des règles vérifiées localement",
    bullets: [
      "10 tests Hardhat passent : rôles séparés, inscription entreprise, échéances et montants limites.",
      "Les tests couvrent aussi l’attribution, le double contrôle et le plafond des jalons.",
      "Le contrat compile avec Solidity 0.8.28 et OpenZeppelin 5.6.1.",
      "Le build de production Next.js et le lint sont vérifiés.",
      "Les tests locaux ne remplacent ni testnet ni audit indépendant.",
    ],
    callout: "10 / 10\nTESTS\nPASSÉS",
  },
  {
    section: "13 · DÉPLOIEMENT",
    title: "Contrat déployé sur Polygon Amoy",
    bullets: [
      "Adresse : 0x15Ba0b…6808b982 · chain ID 80002.",
      "Bloc 51909186 · transaction 0x369ba9…363fd6b2.",
      "3,411,584 gas consommés · environ 0.10234752 POL de test.",
      "registerCompany() inscrit une fois les portefeuilles admissibles.",
      "La clé Pinata reste côté serveur ; les variables NEXT_PUBLIC sont publiques.",
      "Code non vérifié sur Polygonscan ; GitHub/Vercel pas encore publiés.",
    ],
    callout: "DÉPLOYÉ\nSUR\nAMOY",
  },
  {
    section: "14 · CONCLUSION",
    title: "Une preuve vérifiable, pas une promesse absolue",
    bullets: [
      "Le prototype rend visibles les règles programmées et les actions enregistrées.",
      "Commit-reveal protège le montant jusqu’à l’ouverture, sous réserve de garder le secret.",
      "L’attribution et l’exécution conservent leurs contrôles administratifs et humains.",
      "Étapes suivantes : audit Slither, vérification Polygonscan et publication Vercel.",
    ],
    callout: "MERCI",
  },
];

function addText(slide, text, options) {
  slide.addText(text, { margin: 0, breakLine: false, ...options });
}

slides.forEach((content, index) => {
  const slide = pptx.addSlide(content.cover ? undefined : "CONTENT");
  if (content.cover) {
    slide.background = { color: "F3F5F0" };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, line: { color: "17684F", transparency: 100 }, fill: { color: "17684F" } });
    slide.addShape(pptx.ShapeType.rect, { x: 8.95, y: 0.65, w: 3.75, h: 6.1, line: { color: "DCE3DC", transparency: 100 }, fill: { color: "E6F0E9" } });
    addText(slide, content.section, { x: 0.8, y: 0.75, w: 6.8, h: 0.25, fontSize: 10, bold: true, color: "17684F", charSpacing: 0 });
    addText(slide, content.title, { x: 0.8, y: 1.55, w: 7.7, h: 1.85, fontSize: 34, bold: true, color: "1A2E28", breakLine: false, valign: "mid", lineSpacingMultiple: 1.05 });
    addText(slide, content.subtitle, { x: 0.82, y: 3.65, w: 7.3, h: 0.65, fontSize: 16, color: "52645A", breakLine: false, valign: "mid" });
    addText(slide, content.bullets.join("\n"), { x: 0.82, y: 5.18, w: 7.4, h: 1.3, fontSize: 10.5, color: "40564A", breakLine: false, valign: "top", lineSpacingMultiple: 1.15 });
    addText(slide, content.callout, { x: 9.35, y: 1.65, w: 2.95, h: 0.7, fontSize: 13, bold: true, color: "17684F", charSpacing: 0 });
    addText(slide, "ENGAGER\nRÉVÉLER\nSUIVRE", { x: 9.35, y: 2.7, w: 2.9, h: 2.3, fontSize: 24, bold: true, color: "1A2E28", breakLine: false, valign: "mid", lineSpacingMultiple: 1.2 });
    addText(slide, "Projet académique · Université de Kinshasa", { x: 9.35, y: 5.65, w: 2.9, h: 0.45, fontSize: 10, color: "52645A" });
  } else {
    addText(slide, content.section, { x: 0.68, y: 0.85, w: 3.2, h: 0.24, fontSize: 9, bold: true, color: "17684F", charSpacing: 0 });
    addText(slide, content.title, { x: 0.68, y: 1.35, w: 11.6, h: 0.72, fontSize: 25, bold: true, color: "1A2E28", breakLine: false, valign: "mid" });
    slide.addShape(pptx.ShapeType.line, { x: 0.68, y: 2.2, w: 11.95, h: 0, line: { color: "DCE3DC", width: 1 } });
    slide.addShape(pptx.ShapeType.rect, { x: 0.68, y: 2.62, w: 7.75, h: 3.85, line: { color: "DCE3DC", width: 1 }, fill: { color: "FFFFFF" }, radius: 0.08 });
    const bulletRuns = content.bullets.map((text) => ({ text, options: { bullet: { indent: 15 }, hanging: 4, breakLine: true, paraSpaceAfterPt: 12 } }));
    slide.addText(bulletRuns, { x: 1.02, y: 2.98, w: 7.1, h: 3.1, fontFace: "Aptos", fontSize: 15, color: "31463B", margin: 0.04, breakLine: false, valign: "mid", paraSpaceAfterPt: 12, fit: "shrink" });
    slide.addShape(pptx.ShapeType.rect, { x: 8.8, y: 2.62, w: 3.82, h: 3.85, line: { color: "DCE3DC", width: 1 }, fill: { color: index % 3 === 0 ? "E6F0E9" : index % 3 === 1 ? "F7EFDC" : "F8E9E3" }, radius: 0.08 });
    addText(slide, String(index + 1).padStart(2, "0"), { x: 9.2, y: 2.98, w: 0.8, h: 0.45, fontSize: 12, bold: true, color: "6B7E72" });
    addText(slide, content.callout, { x: 9.2, y: 3.65, w: 3.05, h: 2.2, fontSize: 22, bold: true, color: "1A2E28", breakLine: false, valign: "mid", lineSpacingMultiple: 1.12 });
  }
});

const docsDirectory = path.resolve("docs");
await mkdir(docsDirectory, { recursive: true });
await pptx.writeFile({ fileName: path.join(docsDirectory, "presentation.pptx") });
console.log(`Généré : ${slides.length} diapositives dans docs/presentation.pptx`);