// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SoundBeatsReleases
/// @notice Publishes rhythm-game releases, sells access, and distributes brand-sponsored passes.
/// @dev Intended for Arc Testnet USDC with six decimals. All amounts are raw token units
/// (1 USDC = 1_000_000 units). The frontend supplies the official token to the constructor.
/// Payments go directly from the payer to recipients; no payment is routed through this
/// contract. Unsolicited ERC-20 transfers cannot be prevented and cannot be withdrawn.
/// Ownership controls only fee configuration and the inherited ownership lifecycle.
contract SoundBeatsReleases is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice A registered song and its immutable publishing metadata.
    /// @param title Song title, between 1 and 100 bytes.
    /// @param artist Registering artist wallet.
    /// @param metadataURI Optional metadata URI, at most 512 bytes.
    /// @param createdAt Registration timestamp in seconds.
    struct Song {
        string title;
        address artist;
        string metadataURI;
        uint64 createdAt;
    }

    /// @notice Whether the beatmap was generated automatically or authored manually.
    enum BeatmapSource { Auto, Manual }

    /// @notice A paid beatmap release associated with a registered song.
    /// @param songId Existing song identifier.
    /// @param artist Artist snapshotted when the release was published.
    /// @param creator Wallet publishing the beatmap and controlling its active status.
    /// @param beatmapId Offchain beatmap identifier, between 1 and 64 bytes.
    /// @param source Beatmap creation method.
    /// @param difficulty Difficulty from 1 through 10.
    /// @param price Access price in raw USDC units.
    /// @param active Whether purchases and new sponsorships are enabled.
    /// @param createdAt Publication timestamp in seconds.
    /// @param accessSold Number of direct access purchases, excluding sponsored passes.
    struct Release {
        uint256 songId;
        address artist;
        address creator;
        string beatmapId;
        BeatmapSource source;
        uint8 difficulty;
        uint256 price;
        bool active;
        uint64 createdAt;
        uint256 accessSold;
    }

    /// @notice A batch of prepaid passes, identified by its per-release array index.
    /// @param brand Wallet paying for the batch.
    /// @param brandName Display name, between 1 and 64 bytes.
    /// @param logoURI Optional logo URI, at most 512 bytes.
    /// @param bought Number of passes purchased in this batch.
    /// @param used Number of passes claimed from this batch.
    /// @param createdAt Sponsorship timestamp in seconds.
    struct Sponsorship {
        address brand;
        string brandName;
        string logoURI;
        uint256 bought;
        uint256 used;
        uint64 createdAt;
    }

    /// @dev Per-payment amounts and fee recipient snapshotted before external calls.
    /// @param artistShare Artist payment in raw token units.
    /// @param creatorShare Creator payment, including net rounding remainder.
    /// @param feeShare Platform fee in raw token units.
    /// @param recipient Fee recipient for this payment.
    struct PaymentSplit {
        uint256 artistShare;
        uint256 creatorShare;
        uint256 feeShare;
        address recipient;
    }

    /// @notice The supplied USDC address is zero.
    error InvalidUSDC();
    /// @notice The supplied artist or creator address is zero.
    error ZeroAddress();
    /// @notice The caller is not the supplied artist.
    error NotArtist();
    /// @notice The caller is not the supplied or recorded release creator.
    error NotCreator();
    /// @notice Title length is outside 1..100 bytes.
    error InvalidTitle();
    /// @notice Metadata URI exceeds 512 bytes.
    error InvalidMetadataURI();
    /// @notice The requested song does not exist.
    error SongNotFound();
    /// @notice The requested release does not exist.
    error ReleaseNotFound();
    /// @notice Beatmap identifier length is outside 1..64 bytes.
    error InvalidBeatmapId();
    /// @notice Difficulty is outside 1..10.
    error InvalidDifficulty();
    /// @notice The access price is zero.
    error InvalidPrice();
    /// @notice The release is inactive for purchases or new sponsorships.
    error ReleaseInactive();
    /// @notice The requested fee exceeds the maximum.
    error InvalidPlatformFee();
    /// @notice A nonzero fee would be sent to zero or to this contract.
    error InvalidFeeRecipient();
    /// @notice The caller already has access to the release.
    error AlreadyHasAccess();
    /// @notice Sponsorship quantity is outside 1..10000.
    error InvalidQuantity();
    /// @notice Brand name length is outside 1..64 bytes.
    error InvalidBrandName();
    /// @notice Logo URI exceeds 512 bytes.
    error InvalidLogoURI();
    /// @notice No prepaid pass remains for the release.
    error NoPassesAvailable();

    /// @notice Emitted when an artist registers a song; strings are the supplied metadata.
    event SongRegistered(uint256 indexed songId, address indexed artist, string title, string metadataURI);
    /// @notice Emitted when a creator publishes a release with its immutable pricing and attribution.
    event ReleasePublished(
        uint256 indexed releaseId, uint256 indexed songId, address artist, address indexed creator,
        string beatmapId, BeatmapSource source, uint8 difficulty, uint256 price
    );
    /// @notice Emitted when the current artist rotates a release's artist payout wallet.
    event ReleaseArtistWalletUpdated(uint256 indexed releaseId, address indexed oldWallet, address indexed newWallet);
    /// @notice Emitted when the current creator rotates a release's creator payout wallet.
    event ReleaseCreatorWalletUpdated(uint256 indexed releaseId, address indexed oldWallet, address indexed newWallet);
    /// @notice Emitted when the release creator changes purchase availability.
    event ReleaseActiveChanged(uint256 indexed releaseId, bool active);
    /// @notice Emitted when the owner updates the fee rate and recipient.
    event PlatformFeeUpdated(uint16 bps, address recipient);
    /// @notice Emitted for a direct access purchase; all payment amounts are raw USDC units.
    event AccessPurchased(
        uint256 indexed releaseId, address indexed player, uint256 amount,
        uint256 artistShare, uint256 creatorShare, uint256 feeShare
    );
    /// @notice Emitted for a prepaid batch; sponsorshipId is a zero-based per-release index.
    event PassesSponsored(
        uint256 indexed releaseId, uint256 indexed sponsorshipId, address indexed brand,
        string brandName, string logoURI, uint256 quantity, uint256 totalPaid,
        uint256 artistShare, uint256 creatorShare, uint256 feeShare
    );
    /// @notice Emitted when a player consumes one pass from the oldest unexhausted batch.
    event PassClaimed(
        uint256 indexed releaseId, address indexed player, uint256 indexed sponsorshipId, address brand
    );

    /// @notice Immutable ERC-20 used for every payment.
    IERC20 public immutable usdc;
    /// @notice Denominator for all basis-point calculations.
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Artist share of the amount remaining after the platform fee.
    uint256 public constant ARTIST_BPS = 7_000;
    /// @notice Creator's nominal net share; actual payment includes rounding remainder.
    uint256 public constant CREATOR_BPS = 3_000;
    /// @notice Maximum platform fee, equal to ten percent.
    uint16 public constant MAX_FEE_BPS = 1_000;
    /// @notice Current platform fee in basis points; initially zero.
    uint16 public platformFeeBps;
    /// @notice Current platform fee recipient; initially the zero address.
    address public feeRecipient;
    /// @notice Total registered songs; valid identifiers start at one.
    uint256 public songCount;
    /// @notice Total published releases; valid identifiers start at one.
    uint256 public releaseCount;
    /// @notice Cumulative artist payments in raw USDC units, including sponsorship payments.
    mapping(address => uint256) public totalEarnedByArtist;
    /// @notice Cumulative creator payments in raw USDC units, including sponsorship payments.
    mapping(address => uint256) public totalEarnedByCreator;
    /// @notice Cumulative platform fees paid directly to fee recipients in raw USDC units.
    uint256 public totalPlatformFees;
    /// @notice Whether a wallet has purchased or claimed access to a release.
    mapping(uint256 => mapping(address => bool)) public hasAccess;
    /// @notice Whether a wallet claimed a sponsored pass for a release.
    mapping(uint256 => mapping(address => bool)) public passClaimed;
    /// @notice Claimed sponsorship index plus one; zero means no sponsored pass was claimed.
    mapping(uint256 => mapping(address => uint256)) public passSponsorship;
    /// @notice Total prepaid passes bought per release.
    mapping(uint256 => uint256) public passesBought;
    /// @notice Total prepaid passes consumed per release.
    mapping(uint256 => uint256) public passesUsed;
    /// @notice First unexhausted sponsorship index, or array length if the pool is empty.
    mapping(uint256 => uint256) public nextSponsorship;

    /// @dev Song registry; existence is determined by identifiers and songCount.
    mapping(uint256 => Song) private _songs;
    /// @dev Release registry; existence is determined by identifiers and releaseCount.
    mapping(uint256 => Release) private _releases;
    /// @dev Append-only FIFO sponsorship batches for each release.
    mapping(uint256 => Sponsorship[]) private _sponsorships;

    /// @notice Initializes the payment token and two-step owner.
    /// @param usdc_ Official Arc Testnet USDC ERC-20 supplied by the frontend.
    /// @param initialOwner Initial owner, which may configure only platform fees.
    /// @dev Rejects zero USDC; Ownable rejects a zero initial owner. Does not set a fee recipient.
    constructor(address usdc_, address initialOwner) Ownable(initialOwner) {
        if (usdc_ == address(0)) revert InvalidUSDC();
        usdc = IERC20(usdc_);
    }

    /// @notice Registers a song attributed to the calling artist.
    /// @param title Nonempty title of at most 100 bytes.
    /// @param artist Artist wallet, which must equal msg.sender and be nonzero.
    /// @param metadataURI Optional metadata URI of at most 512 bytes.
    /// @return songId Newly allocated identifier, starting at one.
    function registerSong(string calldata title, address artist, string calldata metadataURI)
        external returns (uint256 songId)
    {
        if (artist == address(0)) revert ZeroAddress();
        if (msg.sender != artist) revert NotArtist();
        if (bytes(title).length == 0 || bytes(title).length > 100) revert InvalidTitle();
        if (bytes(metadataURI).length > 512) revert InvalidMetadataURI();
        songId = ++songCount;
        _songs[songId] = Song(title, artist, metadataURI, uint64(block.timestamp));
        emit SongRegistered(songId, artist, title, metadataURI);
    }

    /// @notice Publishes an initially active release for an existing song.
    /// @param songId Registered song identifier.
    /// @param beatmapId Nonempty beatmap identifier of at most 64 bytes.
    /// @param source Auto or Manual; invalid enum values are rejected by ABI decoding.
    /// @param difficulty Difficulty from 1 through 10.
    /// @param price Positive price in raw six-decimal USDC units.
    /// @param creator Publishing creator wallet, which must equal msg.sender and be nonzero.
    /// @return releaseId Newly allocated identifier, starting at one.
    function publishRelease(
        uint256 songId, string calldata beatmapId, BeatmapSource source,
        uint8 difficulty, uint256 price, address creator
    ) external returns (uint256 releaseId) {
        Song storage song = _requireSong(songId);
        if (creator == address(0)) revert ZeroAddress();
        if (msg.sender != creator) revert NotCreator();
        if (bytes(beatmapId).length == 0 || bytes(beatmapId).length > 64) revert InvalidBeatmapId();
        if (difficulty == 0 || difficulty > 10) revert InvalidDifficulty();
        if (price == 0) revert InvalidPrice();
        releaseId = ++releaseCount;
        Release storage release = _releases[releaseId];
        release.songId = songId;
        release.artist = song.artist;
        release.creator = creator;
        release.beatmapId = beatmapId;
        release.source = source;
        release.difficulty = difficulty;
        release.price = price;
        release.active = true;
        release.createdAt = uint64(block.timestamp);
        emit ReleasePublished(releaseId, songId, song.artist, creator, beatmapId, source, difficulty, price);
    }

    /// @notice Changes the artist wallet receiving future payments for this release.
    /// @param releaseId Existing release identifier.
    /// @param newWallet Nonzero replacement wallet; only the current release artist may set it.
    /// @dev The song's original artist stays recorded on the song. Only this release's future
    /// artist payments are redirected; historical earnings remain keyed by the wallet paid.
    function updateReleaseArtistWallet(uint256 releaseId, address newWallet) external {
        Release storage release = _requireRelease(releaseId);
        if (msg.sender != release.artist) revert NotArtist();
        if (newWallet == address(0)) revert ZeroAddress();
        address oldWallet = release.artist;
        release.artist = newWallet;
        emit ReleaseArtistWalletUpdated(releaseId, oldWallet, newWallet);
    }

    /// @notice Changes the creator wallet receiving future payments for this release.
    /// @param releaseId Existing release identifier.
    /// @param newWallet Nonzero replacement wallet; only the current release creator may set it.
    /// @dev The song's original artist stays recorded on the song. Only this release's future
    /// creator payments are redirected; historical earnings remain keyed by the wallet paid.
    /// The new creator also controls release availability through setReleaseActive.
    function updateReleaseCreatorWallet(uint256 releaseId, address newWallet) external {
        Release storage release = _requireRelease(releaseId);
        if (msg.sender != release.creator) revert NotCreator();
        if (newWallet == address(0)) revert ZeroAddress();
        address oldWallet = release.creator;
        release.creator = newWallet;
        emit ReleaseCreatorWalletUpdated(releaseId, oldWallet, newWallet);
    }

    /// @notice Enables or disables new paid purchases and sponsorships; existing passes remain claimable.
    /// @param releaseId Existing release identifier.
    /// @param active New availability flag; only this release's creator may set it.
    function setReleaseActive(uint256 releaseId, bool active) external {
        Release storage release = _requireRelease(releaseId);
        if (msg.sender != release.creator) revert NotCreator();
        release.active = active;
        emit ReleaseActiveChanged(releaseId, active);
    }

    /// @notice Sets the fee applied to future purchases and sponsorships; callable only by the owner.
    /// @param bps Fee from zero through MAX_FEE_BPS.
    /// @param recipient Fee recipient; may be zero when bps is zero.
    /// @dev A positive fee cannot target this contract, preserving direct-payment routing.
    function setPlatformFee(uint16 bps, address recipient) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert InvalidPlatformFee();
        if (bps > 0 && (recipient == address(0) || recipient == address(this))) revert InvalidFeeRecipient();
        platformFeeBps = bps;
        feeRecipient = recipient;
        emit PlatformFeeUpdated(bps, recipient);
    }

    /// @notice Buys permanent release access using an allowance granted to this contract.
    /// @param releaseId Existing, active release identifier.
    /// @dev State and earnings are updated before transfers; any failed transfer reverts everything.
    function buyAccess(uint256 releaseId) external nonReentrant {
        Release storage release = _requireRelease(releaseId);
        if (!release.active) revert ReleaseInactive();
        if (hasAccess[releaseId][msg.sender]) revert AlreadyHasAccess();
        uint256 amount = release.price;
        PaymentSplit memory split = _split(amount);
        hasAccess[releaseId][msg.sender] = true;
        ++release.accessSold;
        _accountEarnings(release, split);
        _pay(msg.sender, release, split);
        emit AccessPurchased(releaseId, msg.sender, amount, split.artistShare, split.creatorShare, split.feeShare);
    }

    /// @notice Prepays a FIFO batch of free-to-claim passes for a release.
    /// @param releaseId Existing, active release identifier.
    /// @param quantity Number of passes to buy, from 1 through 10000.
    /// @param brandName Nonempty display name of at most 64 bytes.
    /// @param logoURI Optional logo URI of at most 512 bytes.
    /// @return sponsorshipId Zero-based index within this release's sponsorship array.
    /// @dev Total price uses checked multiplication. Earnings and pool state precede all transfers.
    function sponsorPasses(uint256 releaseId, uint256 quantity, string calldata brandName, string calldata logoURI)
        external nonReentrant returns (uint256 sponsorshipId)
    {
        Release storage release = _requireRelease(releaseId);
        if (!release.active) revert ReleaseInactive();
        if (quantity == 0 || quantity > 10_000) revert InvalidQuantity();
        if (bytes(brandName).length == 0 || bytes(brandName).length > 64) revert InvalidBrandName();
        if (bytes(logoURI).length > 512) revert InvalidLogoURI();
        uint256 total = release.price * quantity;
        PaymentSplit memory split = _split(total);
        sponsorshipId = _sponsorships[releaseId].length;
        _sponsorships[releaseId].push(Sponsorship({
            brand: msg.sender,
            brandName: brandName,
            logoURI: logoURI,
            bought: quantity,
            used: 0,
            createdAt: uint64(block.timestamp)
        }));
        passesBought[releaseId] += quantity;
        _accountEarnings(release, split);
        _pay(msg.sender, release, split);
        _emitSponsorship(releaseId, sponsorshipId, total, split);
    }

    /// @notice Claims one prepaid pass, including when the release is inactive.
    /// @param releaseId Existing release identifier with a remaining pass.
    /// @dev Anyone already holding access is rejected. Each positive-size batch is consumed in
    /// FIFO order, so only one cursor increment can be necessary per claim: no history scan.
    function claimPass(uint256 releaseId) external nonReentrant {
        _requireRelease(releaseId);
        if (hasAccess[releaseId][msg.sender]) revert AlreadyHasAccess();
        if (passesUsed[releaseId] == passesBought[releaseId]) revert NoPassesAvailable();
        uint256 sponsorshipId = nextSponsorship[releaseId];
        Sponsorship storage sponsorship = _sponsorships[releaseId][sponsorshipId];
        ++sponsorship.used;
        ++passesUsed[releaseId];
        hasAccess[releaseId][msg.sender] = true;
        passClaimed[releaseId][msg.sender] = true;
        passSponsorship[releaseId][msg.sender] = sponsorshipId + 1;
        if (sponsorship.used == sponsorship.bought) {
            nextSponsorship[releaseId] = sponsorshipId + 1;
        }
        emit PassClaimed(releaseId, msg.sender, sponsorshipId, sponsorship.brand);
    }

    /// @notice Returns a registered song, reverting if it does not exist.
    /// @param songId Song identifier.
    /// @return song Full song record.
    function getSong(uint256 songId) external view returns (Song memory song) {
        return _requireSong(songId);
    }

    /// @notice Returns a published release, reverting if it does not exist.
    /// @param releaseId Release identifier.
    /// @return release Full release record.
    function getRelease(uint256 releaseId) external view returns (Release memory release) {
        return _requireRelease(releaseId);
    }

    /// @notice Returns every sponsorship batch for an existing release, oldest first.
    /// @param releaseId Existing release identifier.
    /// @return sponsorships Complete array; potentially large for heavily sponsored releases.
    function getSponsorships(uint256 releaseId) external view returns (Sponsorship[] memory sponsorships) {
        _requireRelease(releaseId);
        return _sponsorships[releaseId];
    }

    /// @notice Returns the number of sponsorship batches for an existing release.
    /// @param releaseId Existing release identifier.
    /// @return count Number of zero-based sponsorship indexes.
    function sponsorshipCount(uint256 releaseId) external view returns (uint256 count) {
        _requireRelease(releaseId);
        return _sponsorships[releaseId].length;
    }

    /// @notice Returns aggregate prepaid pass statistics for an existing release in constant time.
    /// @param releaseId Existing release identifier.
    /// @return bought Total passes prepaid.
    /// @return used Total passes claimed.
    /// @return remaining Unclaimed passes.
    function passStats(uint256 releaseId) external view returns (uint256 bought, uint256 used, uint256 remaining) {
        _requireRelease(releaseId);
        bought = passesBought[releaseId];
        used = passesUsed[releaseId];
        remaining = bought - used;
    }

    /// @notice Sums the pass statistics of every batch paid for by a brand on a release.
    /// @param releaseId Existing release identifier.
    /// @param brand Brand wallet to aggregate, not its display name.
    /// @return bought Total passes this brand prepaid.
    /// @return used Total passes consumed from this brand's batches.
    /// @return remaining Unclaimed passes attributed to this brand.
    /// @dev Linear in sponsorship count; intended as an offchain convenience view.
    function brandPassStats(uint256 releaseId, address brand)
        external view returns (uint256 bought, uint256 used, uint256 remaining)
    {
        _requireRelease(releaseId);
        Sponsorship[] storage sponsorships = _sponsorships[releaseId];
        for (uint256 i; i < sponsorships.length; ++i) {
            Sponsorship storage sponsorship = sponsorships[i];
            if (sponsorship.brand == brand) {
                bought += sponsorship.bought;
                used += sponsorship.used;
            }
        }
        remaining = bought - used;
    }

    /// @dev Validates existence and returns the stored song.
    /// @param songId Song identifier to validate.
    /// @return song Reference to the song storage record.
    function _requireSong(uint256 songId) internal view returns (Song storage song) {
        if (songId == 0 || songId > songCount) revert SongNotFound();
        return _songs[songId];
    }

    /// @dev Validates existence and returns the stored release.
    /// @param releaseId Release identifier to validate.
    /// @return release Reference to the release storage record.
    function _requireRelease(uint256 releaseId) internal view returns (Release storage release) {
        if (releaseId == 0 || releaseId > releaseCount) revert ReleaseNotFound();
        return _releases[releaseId];
    }

    /// @dev Computes the platform fee, then the 70/30 net split with remainder to the creator.
    /// @param amount Gross payment in raw USDC units; multiplication is checked.
    /// @return split Payment amounts and the current fee recipient, snapshotted together.
    function _split(uint256 amount) internal view returns (PaymentSplit memory split) {
        split.feeShare = amount * platformFeeBps / BPS_DENOMINATOR;
        uint256 net = amount - split.feeShare;
        split.artistShare = net * ARTIST_BPS / BPS_DENOMINATOR;
        split.creatorShare = net - split.artistShare;
        split.recipient = feeRecipient;
    }

    /// @dev Records earnings before external payment interactions.
    /// @param release Release supplying immutable recipient identities.
    /// @param split Amounts to add to cumulative earnings and fees.
    function _accountEarnings(Release storage release, PaymentSplit memory split) internal {
        totalEarnedByArtist[release.artist] += split.artistShare;
        totalEarnedByCreator[release.creator] += split.creatorShare;
        totalPlatformFees += split.feeShare;
    }

    /// @dev Transfers directly from the payer, skipping every zero-valued transfer.
    /// @param payer Wallet supplying the allowance and funds.
    /// @param release Release supplying artist and creator recipients.
    /// @param split Previously calculated payment amounts and fee recipient.
    function _pay(address payer, Release storage release, PaymentSplit memory split) internal {
        if (split.artistShare > 0) usdc.safeTransferFrom(payer, release.artist, split.artistShare);
        if (split.creatorShare > 0) usdc.safeTransferFrom(payer, release.creator, split.creatorShare);
        if (split.feeShare > 0) usdc.safeTransferFrom(payer, split.recipient, split.feeShare);
    }

    /// @dev Emits batch details from storage to keep the purchase entry point's stack small.
    /// @param releaseId Release receiving the prepaid passes.
    /// @param sponsorshipId Newly appended batch index.
    /// @param total Gross batch payment in raw USDC units.
    /// @param split Applied artist, creator, and fee amounts.
    function _emitSponsorship(
        uint256 releaseId, uint256 sponsorshipId, uint256 total, PaymentSplit memory split
    ) internal {
        Sponsorship storage sponsorship = _sponsorships[releaseId][sponsorshipId];
        emit PassesSponsored(
            releaseId, sponsorshipId, sponsorship.brand, sponsorship.brandName, sponsorship.logoURI,
            sponsorship.bought, total, split.artistShare, split.creatorShare, split.feeShare
        );
    }
}
