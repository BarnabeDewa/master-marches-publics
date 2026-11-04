import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

const uploadWindowMs = 10 * 60 * 1000;
const uploadLimit = 6;
const maxFileSize = 4 * 1024 * 1024;
const uploadsByAddress = new Map<string, number[]>();
const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine de requête non autorisée." }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const recentUploads = (uploadsByAddress.get(ip) ?? []).filter((timestamp) => now - timestamp < uploadWindowMs);
  if (recentUploads.length >= uploadLimit) {
    return NextResponse.json({ error: "Limite de téléversement atteinte. Réessaie dans quelques minutes." }, { status: 429 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxFileSize + 64_000) {
    return NextResponse.json({ error: "Le document dépasse la limite de 4 Mo." }, { status: 413 });
  }

  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json({ error: "Le service IPFS n’est pas configuré sur le serveur." }, { status: 503 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "Formulaire de téléversement invalide." }, { status: 400 });
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Sélectionne un document valide." }, { status: 400 });
  }
  if (file.size > maxFileSize) {
    return NextResponse.json({ error: "Le document dépasse la limite de 4 Mo." }, { status: 413 });
  }
  if (!allowedTypes.has(file.type)) {
    return NextResponse.json({ error: "Formats acceptés : PDF, DOCX, JPG ou PNG." }, { status: 415 });
  }

  uploadsByAddress.set(ip, [...recentUploads, now]);
  const pinataForm = new FormData();
  pinataForm.append("file", file, file.name);

  let response: Response;
  try {
    response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: pinataForm,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Pinata est momentanément injoignable." }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "Pinata a refusé le document. Vérifie la clé et le quota du compte." }, { status: 502 });
  }

  let cid: string;
  try {
    const result = (await response.json()) as { IpfsHash?: unknown };
    if (typeof result.IpfsHash !== "string" || result.IpfsHash.length > 100) throw new Error();
    cid = result.IpfsHash;
  } catch {
    return NextResponse.json({ error: "Réponse Pinata invalide." }, { status: 502 });
  }

  const sha256 = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  return NextResponse.json({ cid, sha256: `0x${sha256}` }, { headers: { "Cache-Control": "no-store" } });
}