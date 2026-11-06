// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract PublicProcurement is AccessControl {
    bytes32 public constant AUTHORITY_ROLE = keccak256("AUTHORITY_ROLE");
    bytes32 public constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");
    bytes32 public constant COMPANY_ROLE = keccak256("COMPANY_ROLE");

    enum MarketStatus {
        Commit,
        Reveal,
        Awarded,
        Completed,
        Cancelled
    }

    struct Market {
        string title;
        string description;
        string documentsCid;
        bytes32 documentsHash;
        uint256 indicativeBudget;
        MarketStatus status;
        address awardedVendor;
        uint64 awardedAt;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint256 awardedAmount;
        string decisionReference;
    }

    struct Bid {
        bytes32 commitment;
        uint256 amount;
        bytes32 proposalHash;
        bool revealed;
    }

    struct Milestone {
        string description;
        uint256 amount;
        bool requested;
        bool authorityApproved;
        bool controllerApproved;
        bool paid;
        address authorityValidator;
        address controllerValidator;
    }

    struct MarketCompletion {
        bool requested;
        bool authorityApproved;
        bool controllerApproved;
        address authorityValidator;
        address controllerValidator;
    }

    uint256 public marketCount;
    mapping(uint256 marketId => Market market) public markets;
    mapping(uint256 marketId => mapping(address bidder => Bid bid)) public bids;
    mapping(uint256 marketId => Milestone[] milestones) private _milestones;
    mapping(uint256 marketId => MarketCompletion completion) private _marketCompletions;
    mapping(uint256 marketId => uint256 total) public totalPaid;
    mapping(uint256 marketId => uint256 total) public totalMilestoneValue;

    event MarketCreated(uint256 indexed marketId, address indexed authority, uint64 commitDeadline, uint64 revealDeadline);
    event CommitmentSubmitted(uint256 indexed marketId, address indexed bidder, bytes32 commitment);
    event RevealPeriodOpened(uint256 indexed marketId);
    event BidRevealed(uint256 indexed marketId, address indexed bidder, uint256 amount, bytes32 proposalHash);
    event MarketAwarded(uint256 indexed marketId, address indexed vendor, uint256 amount, string decisionReference);
    event MilestoneCreated(uint256 indexed marketId, uint256 indexed milestoneId, uint256 amount);
    event MilestoneRequested(uint256 indexed marketId, uint256 indexed milestoneId, address indexed vendor);
    event MilestoneApproved(uint256 indexed marketId, uint256 indexed milestoneId, address indexed validator, bool isAuthority);
    event SimulatedPaymentReleased(uint256 indexed marketId, uint256 indexed milestoneId, uint256 amount);
    event MarketCompletionRequested(uint256 indexed marketId, address indexed vendor);
    event MarketCompletionApproved(uint256 indexed marketId, address indexed validator, bool isAuthority);
    event MarketCompleted(uint256 indexed marketId, address indexed vendor);

    error InvalidInput();
    error InvalidPhase();
    error AlreadyCommitted();
    error InvalidCommitment();
    error InvalidBid();
    error InvalidMilestone();
    error DuplicateApproval();
    error ApproversMustDiffer();
    error BudgetExceeded();
    error IncompatibleRoles();
    error MarketNotReadyToComplete();

    constructor(address admin, address authority, address controller) {
        if (
            admin == address(0) || authority == address(0) || controller == address(0)
                || admin == authority || admin == controller || authority == controller
        ) revert InvalidInput();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AUTHORITY_ROLE, authority);
        _grantRole(CONTROLLER_ROLE, controller);
    }

    function grantRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        if (account == address(0) || role == DEFAULT_ADMIN_ROLE) revert InvalidInput();
        if (
            role == COMPANY_ROLE
                && (hasRole(DEFAULT_ADMIN_ROLE, account) || hasRole(AUTHORITY_ROLE, account) || hasRole(CONTROLLER_ROLE, account))
        ) revert IncompatibleRoles();
        if (
            role == AUTHORITY_ROLE
                && (hasRole(DEFAULT_ADMIN_ROLE, account) || hasRole(CONTROLLER_ROLE, account) || hasRole(COMPANY_ROLE, account))
        ) revert IncompatibleRoles();
        if (
            role == CONTROLLER_ROLE
                && (hasRole(DEFAULT_ADMIN_ROLE, account) || hasRole(AUTHORITY_ROLE, account) || hasRole(COMPANY_ROLE, account))
        ) revert IncompatibleRoles();

        _grantRole(role, account);
    }

    function registerCompany() external {
        if (
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(AUTHORITY_ROLE, msg.sender)
                || hasRole(CONTROLLER_ROLE, msg.sender) || hasRole(COMPANY_ROLE, msg.sender)
        ) revert IncompatibleRoles();

        _grantRole(COMPANY_ROLE, msg.sender);
    }

    function createMarket(
        string calldata title,
        string calldata description,
        string calldata documentsCid,
        bytes32 documentsHash,
        uint256 indicativeBudget,
        uint64 commitDeadline,
        uint64 revealDeadline
    ) external onlyRole(AUTHORITY_ROLE) returns (uint256 marketId) {
        if (
            bytes(title).length == 0 || indicativeBudget == 0 || commitDeadline <= block.timestamp
                || revealDeadline <= commitDeadline
        ) revert InvalidInput();

        marketId = ++marketCount;
        markets[marketId] = Market({
            title: title,
            description: description,
            documentsCid: documentsCid,
            documentsHash: documentsHash,
            indicativeBudget: indicativeBudget,
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline,
            status: MarketStatus.Commit,
            awardedVendor: address(0),
            awardedAmount: 0,
            decisionReference: "",
            awardedAt: 0
        });

        emit MarketCreated(marketId, msg.sender, commitDeadline, revealDeadline);
    }

    function submitCommitment(uint256 marketId, bytes32 commitment) external onlyRole(COMPANY_ROLE) {
        Market storage market = _getMarket(marketId);
        if (market.status != MarketStatus.Commit || block.timestamp >= market.commitDeadline) revert InvalidPhase();
        if (commitment == bytes32(0)) revert InvalidInput();
        if (bids[marketId][msg.sender].commitment != bytes32(0)) revert AlreadyCommitted();

        bids[marketId][msg.sender].commitment = commitment;
        emit CommitmentSubmitted(marketId, msg.sender, commitment);
    }

    function openRevealPeriod(uint256 marketId) external {
        Market storage market = _getMarket(marketId);
        if (market.status != MarketStatus.Commit || block.timestamp < market.commitDeadline) revert InvalidPhase();

        market.status = MarketStatus.Reveal;
        emit RevealPeriodOpened(marketId);
    }

    function revealBid(uint256 marketId, uint256 amount, string calldata offerText, bytes32 secret) external {
        Market storage market = _getMarket(marketId);
        if (
            market.status != MarketStatus.Reveal || block.timestamp < market.commitDeadline
                || block.timestamp >= market.revealDeadline
        ) revert InvalidPhase();
        if (amount == 0 || amount > market.indicativeBudget || bytes(offerText).length == 0 || secret == bytes32(0)) {
            revert InvalidInput();
        }

        bytes32 proposalHash = keccak256(bytes(offerText));
        Bid storage bid = bids[marketId][msg.sender];
        if (bid.commitment == bytes32(0) || bid.revealed) revert InvalidBid();
        if (bid.commitment != keccak256(abi.encode(marketId, msg.sender, amount, proposalHash, secret))) {
            revert InvalidCommitment();
        }

        bid.amount = amount;
        bid.proposalHash = proposalHash;
        bid.revealed = true;
        emit BidRevealed(marketId, msg.sender, amount, proposalHash);
    }

    function awardMarket(uint256 marketId, address vendor, string calldata decisionReference)
        external
        onlyRole(AUTHORITY_ROLE)
    {
        Market storage market = _getMarket(marketId);
        if (
            market.status != MarketStatus.Reveal || block.timestamp < market.revealDeadline
                || bytes(decisionReference).length == 0
        ) revert InvalidPhase();

        Bid storage bid = bids[marketId][vendor];
        if (!bid.revealed || bid.amount == 0 || bid.amount > market.indicativeBudget) revert InvalidBid();

        market.status = MarketStatus.Awarded;
        market.awardedVendor = vendor;
        market.awardedAmount = bid.amount;
        market.decisionReference = decisionReference;
        market.awardedAt = uint64(block.timestamp);
        emit MarketAwarded(marketId, vendor, bid.amount, decisionReference);
    }

    function createMilestone(uint256 marketId, string calldata description, uint256 amount)
        external
        onlyRole(AUTHORITY_ROLE)
        returns (uint256 milestoneId)
    {
        Market storage market = _getMarket(marketId);
        if (
            market.status != MarketStatus.Awarded || _marketCompletions[marketId].requested
                || bytes(description).length == 0 || amount == 0
        ) {
            revert InvalidMilestone();
        }
        if (totalMilestoneValue[marketId] + amount > market.awardedAmount) revert BudgetExceeded();

        milestoneId = _milestones[marketId].length;
        _milestones[marketId].push(
            Milestone({
                description: description,
                amount: amount,
                requested: false,
                authorityApproved: false,
                controllerApproved: false,
                paid: false,
                authorityValidator: address(0),
                controllerValidator: address(0)
            })
        );
        totalMilestoneValue[marketId] += amount;
        emit MilestoneCreated(marketId, milestoneId, amount);
    }

    function requestMilestone(uint256 marketId, uint256 milestoneId) external {
        Market storage market = _getMarket(marketId);
        if (
            market.status != MarketStatus.Awarded || _marketCompletions[marketId].requested
                || msg.sender != market.awardedVendor
        ) revert InvalidMilestone();
        Milestone storage milestone = _getMilestone(marketId, milestoneId);
        if (milestone.requested || milestone.paid) revert InvalidMilestone();

        milestone.requested = true;
        emit MilestoneRequested(marketId, milestoneId, msg.sender);
    }

    function approveMilestone(uint256 marketId, uint256 milestoneId) external {
        Market storage market = _getMarket(marketId);
        if (market.status != MarketStatus.Awarded) revert InvalidMilestone();
        Milestone storage milestone = _getMilestone(marketId, milestoneId);
        if (!milestone.requested || milestone.paid) revert InvalidMilestone();

        if (hasRole(AUTHORITY_ROLE, msg.sender) && !milestone.authorityApproved) {
            milestone.authorityApproved = true;
            milestone.authorityValidator = msg.sender;
            emit MilestoneApproved(marketId, milestoneId, msg.sender, true);
        } else if (hasRole(CONTROLLER_ROLE, msg.sender) && !milestone.controllerApproved) {
            milestone.controllerApproved = true;
            milestone.controllerValidator = msg.sender;
            emit MilestoneApproved(marketId, milestoneId, msg.sender, false);
        } else {
            revert DuplicateApproval();
        }

        if (milestone.authorityApproved && milestone.controllerApproved) {
            if (milestone.authorityValidator == milestone.controllerValidator) revert ApproversMustDiffer();
            uint256 newTotalPaid = totalPaid[marketId] + milestone.amount;
            if (newTotalPaid > markets[marketId].awardedAmount) revert BudgetExceeded();

            milestone.paid = true;
            totalPaid[marketId] = newTotalPaid;
            emit SimulatedPaymentReleased(marketId, milestoneId, milestone.amount);
        }
    }

    function requestMarketCompletion(uint256 marketId) external {
        Market storage market = _getMarket(marketId);
        if (market.status != MarketStatus.Awarded || msg.sender != market.awardedVendor) revert InvalidMilestone();
        if (_milestones[marketId].length == 0 || totalPaid[marketId] != totalMilestoneValue[marketId]) {
            revert MarketNotReadyToComplete();
        }

        MarketCompletion storage completion = _marketCompletions[marketId];
        if (completion.requested) revert MarketNotReadyToComplete();
        completion.requested = true;
        emit MarketCompletionRequested(marketId, msg.sender);
    }

    function approveMarketCompletion(uint256 marketId) external {
        Market storage market = _getMarket(marketId);
        MarketCompletion storage completion = _marketCompletions[marketId];
        if (market.status != MarketStatus.Awarded || !completion.requested) revert MarketNotReadyToComplete();

        if (hasRole(AUTHORITY_ROLE, msg.sender) && !completion.authorityApproved) {
            completion.authorityApproved = true;
            completion.authorityValidator = msg.sender;
            emit MarketCompletionApproved(marketId, msg.sender, true);
        } else if (hasRole(CONTROLLER_ROLE, msg.sender) && !completion.controllerApproved) {
            completion.controllerApproved = true;
            completion.controllerValidator = msg.sender;
            emit MarketCompletionApproved(marketId, msg.sender, false);
        } else {
            revert DuplicateApproval();
        }

        if (completion.authorityApproved && completion.controllerApproved) {
            if (completion.authorityValidator == completion.controllerValidator) revert ApproversMustDiffer();
            market.status = MarketStatus.Completed;
            emit MarketCompleted(marketId, market.awardedVendor);
        }
    }

    function getMarketCompletionStatus(uint256 marketId) external view returns (MarketCompletion memory) {
        _getMarket(marketId);
        return _marketCompletions[marketId];
    }

    function getMilestones(uint256 marketId) external view returns (Milestone[] memory) {
        _getMarket(marketId);
        return _milestones[marketId];
    }

    function _getMarket(uint256 marketId) private view returns (Market storage market) {
        market = markets[marketId];
        if (marketId == 0 || marketId > marketCount) revert InvalidInput();
    }

    function _getMilestone(uint256 marketId, uint256 milestoneId) private view returns (Milestone storage milestone) {
        _getMarket(marketId);
        if (milestoneId >= _milestones[marketId].length) revert InvalidMilestone();
        milestone = _milestones[marketId][milestoneId];
    }
}