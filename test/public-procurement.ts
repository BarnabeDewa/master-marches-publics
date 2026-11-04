import { expect } from "chai";
import { network } from "hardhat";

async function deployFixture() {
  const { ethers } = await network.create();
  const [admin, authority, controller, vendor, otherVendor, visitor] = await ethers.getSigners();
  const procurement = await ethers.deployContract("PublicProcurement", [
    admin.address,
    authority.address,
    controller.address,
  ]);
  const companyRole = await procurement.COMPANY_ROLE();
  await procurement.connect(admin).grantRole(companyRole, vendor.address);
  await procurement.connect(admin).grantRole(companyRole, otherVendor.address);

  return { ethers, procurement, admin, authority, controller, vendor, otherVendor, visitor };
}

async function createMarket(procurement: Awaited<ReturnType<typeof deployFixture>>["procurement"], authority: Awaited<ReturnType<typeof deployFixture>>["authority"]) {
  const { ethers } = await network.create();
  const latestBlock = await ethers.provider.getBlock("latest");
  const commitDeadline = BigInt(latestBlock!.timestamp + 100);
  const revealDeadline = commitDeadline + 100n;

  await procurement.connect(authority).createMarket(
    "Fourniture de matériel",
    "Lot de démonstration",
    "",
    ethers.ZeroHash,
    1_000n,
    commitDeadline,
    revealDeadline,
  );

  return { commitDeadline, revealDeadline };
}

async function commitBid(
  ethers: Awaited<ReturnType<typeof deployFixture>>["ethers"],
  procurement: Awaited<ReturnType<typeof deployFixture>>["procurement"],
  bidder: Awaited<ReturnType<typeof deployFixture>>["vendor"],
  amount = 800n,
) {
  const secret = ethers.hexlify(ethers.randomBytes(32));
  const offerText = "offre de démonstration";
  const proposalHash = ethers.keccak256(ethers.toUtf8Bytes(offerText));
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address", "uint256", "bytes32", "bytes32"],
    [1n, bidder.address, amount, proposalHash, secret],
  );
  const commitment = ethers.keccak256(encoded);

  await procurement.connect(bidder).submitCommitment(1n, commitment);
  return { amount, offerText, proposalHash, secret };
}

describe("PublicProcurement", function () {
  it("autorise la création du marché uniquement à l'autorité", async function () {
    const { ethers, procurement, authority, visitor } = await deployFixture();
    await createMarket(procurement, authority);

    expect(await procurement.marketCount()).to.equal(1n);
    await expect(createMarket(procurement, visitor)).to.revert(ethers);
  });

  it("réserve le dépôt d’offre aux entreprises et interdit le chevauchement de rôles", async function () {
    const { ethers, procurement, admin, authority, controller, visitor, vendor } = await deployFixture();
    await createMarket(procurement, authority);
    const commitment = ethers.keccak256(ethers.randomBytes(32));
    const companyRole = await procurement.COMPANY_ROLE();

    await expect(procurement.connect(authority).submitCommitment(1n, commitment)).to.revert(ethers);
    await expect(procurement.connect(controller).submitCommitment(1n, commitment)).to.revert(ethers);
    await expect(procurement.connect(visitor).submitCommitment(1n, commitment)).to.revert(ethers);
    await expect(procurement.connect(admin).grantRole(companyRole, authority.address))
      .to.be.revertedWithCustomError(procurement, "IncompatibleRoles");
    await expect(procurement.connect(admin).grantRole(companyRole, controller.address))
      .to.be.revertedWithCustomError(procurement, "IncompatibleRoles");

    await procurement.connect(vendor).submitCommitment(1n, commitment);
    expect(await procurement.hasRole(companyRole, vendor.address)).to.equal(true);
  });

  it("permet à un portefeuille sans rôle de s’inscrire une fois comme entreprise", async function () {
    const { ethers, procurement, authority, visitor } = await deployFixture();
    await createMarket(procurement, authority);
    const commitment = ethers.keccak256(ethers.randomBytes(32));

    await expect(procurement.connect(visitor).submitCommitment(1n, commitment)).to.revert(ethers);
    await procurement.connect(visitor).registerCompany();
    expect(await procurement.hasRole(await procurement.COMPANY_ROLE(), visitor.address)).to.equal(true);
    await procurement.connect(visitor).submitCommitment(1n, commitment);
    await expect(procurement.connect(visitor).registerCompany()).to.be.revertedWithCustomError(procurement, "IncompatibleRoles");
    await expect(procurement.connect(authority).registerCompany()).to.be.revertedWithCustomError(procurement, "IncompatibleRoles");
  });

  it("rejette les engagements tardifs et les doubles engagements", async function () {
    const { ethers, procurement, authority, vendor, visitor } = await deployFixture();
    const { commitDeadline } = await createMarket(procurement, authority);
    const secret = ethers.hexlify(ethers.randomBytes(32));

    await procurement.connect(vendor).submitCommitment(1n, ethers.keccak256(secret));
    await expect(procurement.connect(vendor).submitCommitment(1n, ethers.keccak256(secret))).to.revert(ethers);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(commitDeadline)]);
    await ethers.provider.send("evm_mine", []);
    await expect(procurement.connect(visitor).submitCommitment(1n, ethers.keccak256(secret))).to.revert(ethers);
  });

  it("révèle uniquement une offre correspondant à l'engagement", async function () {
    const { ethers, procurement, authority, vendor } = await deployFixture();
    const { commitDeadline } = await createMarket(procurement, authority);
    const bid = await commitBid(ethers, procurement, vendor);

    await expect(procurement.connect(vendor).revealBid(1n, bid.amount, bid.offerText, bid.secret)).to.revert(ethers);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(commitDeadline)]);
    await procurement.openRevealPeriod(1n);

    await expect(
      procurement.connect(vendor).revealBid(1n, bid.amount + 1n, bid.offerText, bid.secret),
    ).to.be.revertedWithCustomError(procurement, "InvalidCommitment");
    await expect(
      procurement.connect(vendor).revealBid(1n, bid.amount, `${bid.offerText} modifiée`, bid.secret),
    ).to.be.revertedWithCustomError(procurement, "InvalidCommitment");
    await procurement.connect(vendor).revealBid(1n, bid.amount, bid.offerText, bid.secret);
    await expect(procurement.connect(vendor).revealBid(1n, bid.amount, bid.offerText, bid.secret)).to.revert(ethers);
  });

  it("rejette les montants nuls ou supérieurs au budget", async function () {
    const { ethers, procurement, authority, vendor, otherVendor } = await deployFixture();
    const { commitDeadline } = await createMarket(procurement, authority);
    const zeroAmountBid = await commitBid(ethers, procurement, vendor, 0n);
    const overBudgetBid = await commitBid(ethers, procurement, otherVendor, 1_001n);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(commitDeadline)]);
    await procurement.openRevealPeriod(1n);
    await expect(
      procurement.connect(vendor).revealBid(1n, zeroAmountBid.amount, zeroAmountBid.offerText, zeroAmountBid.secret),
    ).to.be.revertedWithCustomError(procurement, "InvalidInput");
    await expect(
      procurement.connect(otherVendor).revealBid(1n, overBudgetBid.amount, overBudgetBid.offerText, overBudgetBid.secret),
    ).to.be.revertedWithCustomError(procurement, "InvalidInput");
  });

  it("refuse une révélation après sa clôture", async function () {
    const { ethers, procurement, authority, vendor } = await deployFixture();
    const { commitDeadline, revealDeadline } = await createMarket(procurement, authority);
    const bid = await commitBid(ethers, procurement, vendor);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(commitDeadline)]);
    await procurement.openRevealPeriod(1n);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(revealDeadline)]);
    await expect(procurement.connect(vendor).revealBid(1n, bid.amount, bid.offerText, bid.secret)).to.revert(ethers);
  });

  it("permet l'attribution après clôture uniquement à l'autorité", async function () {
    const { ethers, procurement, authority, controller, vendor } = await deployFixture();
    const { commitDeadline, revealDeadline } = await createMarket(procurement, authority);
    const bid = await commitBid(ethers, procurement, vendor);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(commitDeadline)]);
    await procurement.openRevealPeriod(1n);
    await procurement.connect(vendor).revealBid(1n, bid.amount, bid.offerText, bid.secret);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(revealDeadline)]);

    await expect(procurement.connect(controller).awardMarket(1n, vendor.address, "DEC-001")).to.revert(ethers);
    await procurement.connect(authority).awardMarket(1n, vendor.address, "DEC-001");
    const market = await procurement.markets(1n);
    expect(market.awardedVendor).to.equal(vendor.address);
    expect(market.awardedAmount).to.equal(bid.amount);
  });

  it("exige deux approbateurs distincts avant le paiement simulé", async function () {
    const { ethers, procurement, authority, controller, vendor } = await deployFixture();
    const { commitDeadline, revealDeadline } = await createMarket(procurement, authority);
    const bid = await commitBid(ethers, procurement, vendor);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(commitDeadline)]);
    await procurement.openRevealPeriod(1n);
    await procurement.connect(vendor).revealBid(1n, bid.amount, bid.offerText, bid.secret);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(revealDeadline)]);
    await procurement.connect(authority).awardMarket(1n, vendor.address, "DEC-001");
    await procurement.connect(authority).createMilestone(1n, "Livraison du premier lot", 500n);
    await procurement.connect(vendor).requestMilestone(1n, 0n);

    await procurement.connect(authority).approveMilestone(1n, 0n);
    expect(await procurement.totalPaid(1n)).to.equal(0n);
    await expect(procurement.connect(authority).approveMilestone(1n, 0n)).to.revert(ethers);

    await procurement.connect(controller).approveMilestone(1n, 0n);
    expect(await procurement.totalPaid(1n)).to.equal(500n);
    const milestones = await procurement.getMilestones(1n);
    expect(milestones[0].paid).to.equal(true);
    await expect(procurement.connect(vendor).requestMilestone(1n, 0n)).to.revert(ethers);
  });

  it("empêche de dépasser le montant attribué en jalons", async function () {
    const { ethers, procurement, authority, vendor } = await deployFixture();
    const { commitDeadline, revealDeadline } = await createMarket(procurement, authority);
    const bid = await commitBid(ethers, procurement, vendor, 600n);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(commitDeadline)]);
    await procurement.openRevealPeriod(1n);
    await procurement.connect(vendor).revealBid(1n, bid.amount, bid.offerText, bid.secret);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(revealDeadline)]);
    await procurement.connect(authority).awardMarket(1n, vendor.address, "DEC-001");

    await procurement.connect(authority).createMilestone(1n, "Jalon A", 400n);
    await expect(procurement.connect(authority).createMilestone(1n, "Jalon B", 201n)).to.revert(ethers);
  });
});