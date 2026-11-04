import {
  AbiCoder,
  getAddress,
  getBytes,
  hexlify,
  isHexString,
  keccak256,
  randomBytes,
  toUtf8Bytes,
} from "ethers";

const backupVersion = 1;
const derivationIterations = 310_000;
const abiCoder = AbiCoder.defaultAbiCoder();

export type SealedBidBackup = {
  marketId: string;
  bidder: string;
  amount: string;
  offerText: string;
  proposalHash: string;
  secret: string;
  commitment: string;
};

type EncryptedEnvelope = {
  version: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

export function createSealedBid(marketId: bigint, bidder: string, amount: bigint, offerText: string) {
  if (marketId <= 0n || amount <= 0n || offerText.trim().length === 0) {
    throw new Error("Le marché, le montant et le contenu de l’offre sont obligatoires.");
  }

  const secret = hexlify(randomBytes(32));
  const proposalHash = keccak256(toUtf8Bytes(offerText));
  const commitment = hashCommitment(marketId, bidder, amount, proposalHash, secret);

  return {
    marketId: marketId.toString(),
    bidder: getAddress(bidder),
    amount: amount.toString(),
    offerText,
    proposalHash,
    secret,
    commitment,
  } satisfies SealedBidBackup;
}

export function hashCommitment(
  marketId: bigint,
  bidder: string,
  amount: bigint,
  proposalHash: string,
  secret: string,
) {
  const encoded = abiCoder.encode(
    ["uint256", "address", "uint256", "bytes32", "bytes32"],
    [marketId, getAddress(bidder), amount, proposalHash, secret],
  );
  return keccak256(encoded);
}

export async function encryptBidBackup(backup: SealedBidBackup, password: string) {
  if (password.length < 12) throw new Error("Le mot de passe de sauvegarde doit contenir au moins 12 caractères.");

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt, ["encrypt"]);
  const clearText = new TextEncoder().encode(JSON.stringify(backup));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, clearText);

  const envelope: EncryptedEnvelope = {
    version: backupVersion,
    salt: hexlify(salt),
    iv: hexlify(iv),
    ciphertext: hexlify(new Uint8Array(ciphertext)),
  };

  return JSON.stringify(envelope, null, 2);
}

export async function decryptBidBackup(fileContent: string, password: string): Promise<SealedBidBackup> {
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(fileContent) as EncryptedEnvelope;
  } catch {
    throw new Error("Le fichier de sauvegarde n’est pas un JSON valide.");
  }

  if (
    envelope.version !== backupVersion
    || !isHexString(envelope.salt, 16)
    || !isHexString(envelope.iv, 12)
    || !isHexString(envelope.ciphertext)
  ) {
    throw new Error("Le format du fichier de sauvegarde n’est pas reconnu.");
  }

  let clearText: ArrayBuffer;
  try {
    const key = await deriveKey(password, getBytes(envelope.salt), ["decrypt"]);
    clearText = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(getBytes(envelope.iv)) },
      key,
      toArrayBuffer(getBytes(envelope.ciphertext)),
    );
  } catch {
    throw new Error("Déchiffrement impossible : vérifie le mot de passe et le fichier.");
  }

  let backup: SealedBidBackup;
  try {
    backup = JSON.parse(new TextDecoder().decode(clearText)) as SealedBidBackup;
    const marketId = BigInt(backup.marketId);
    const amount = BigInt(backup.amount);
    const bidder = getAddress(backup.bidder);
    const proposalHash = keccak256(toUtf8Bytes(backup.offerText));
    const commitment = hashCommitment(marketId, bidder, amount, proposalHash, backup.secret);
    if (proposalHash !== backup.proposalHash || commitment !== backup.commitment) throw new Error();
  } catch {
    throw new Error("Le contenu de la sauvegarde est invalide ou a été modifié.");
  }

  return backup;
}

export function downloadBidBackup(encryptedBackup: string, marketId: string) {
  const file = new Blob([encryptedBackup], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `mukanda-offre-scelée-${marketId}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function deriveKey(password: string, salt: Uint8Array, keyUsages: KeyUsage[]) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations: derivationIterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    keyUsages,
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}