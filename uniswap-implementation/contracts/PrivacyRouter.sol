// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IUniswapV3Manager {
    struct SwapSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint256 amountIn;
        uint160 sqrtPriceLimitX96;
    }

    function swapSingle(SwapSingleParams calldata params) external returns (uint256 amountOut);
}

/**
 * @title PrivacyRouter
 * @notice Escrow sealed swap intents; settle only with an attested TEE signature.
 * @dev AmountIn is visible on escrow (ERC-20 reality). tokenOut / minOut / price stay
 *      inside ciphertext until settle. Settlement may route via Uniswap V3 Manager
 *      (amounts become public at fill time — sealed-until-fill privacy).
 */
contract PrivacyRouter is Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IUniswapV3Manager public immutable manager;
    address public teeSigner;

    uint256 public nextIntentId = 1;

    struct Intent {
        address trader;
        address tokenIn;
        uint256 amountIn;
        bytes32 commitment;
        uint64 deadline;
        bool open;
    }

    mapping(uint256 => Intent) public intents;
    /// @dev Optional: store ciphertext on-chain for TEE indexing (gas-heavy; ok for demo).
    mapping(uint256 => bytes) public ciphertexts;

    event IntentSubmitted(
        uint256 indexed id,
        address indexed trader,
        address tokenIn,
        uint256 amountIn,
        bytes32 commitment,
        uint64 deadline
    );
    event IntentCancelled(uint256 indexed id);
    event IntentSettled(
        uint256 indexed id,
        address indexed recipient,
        address tokenOut,
        uint256 amountOut,
        uint24 fee
    );
    event TeeSignerUpdated(address indexed signer);

    error BadDeadline();
    error BadAmount();
    error NotOpen();
    error NotTrader();
    error Expired();
    error BadCommitment();
    error BadSignature();
    error Slippage();
    error ZeroAddress();

    constructor(address manager_, address teeSigner_) Ownable(msg.sender) {
        if (manager_ == address(0) || teeSigner_ == address(0)) revert ZeroAddress();
        manager = IUniswapV3Manager(manager_);
        teeSigner = teeSigner_;
    }

    function setTeeSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        teeSigner = signer;
        emit TeeSignerUpdated(signer);
    }

    /**
     * @notice Escrow tokenIn and post a sealed intent.
     * @param commitment keccak256 of plaintext intent fields (client-computed)
     * @param ciphertext ECIES blob for the TEE (pair out, minOut, salt, …)
     */
    function submitIntent(
        address tokenIn,
        uint256 amountIn,
        bytes32 commitment,
        bytes calldata ciphertext,
        uint64 deadline
    ) external returns (uint256 id) {
        if (amountIn == 0) revert BadAmount();
        if (deadline < block.timestamp) revert BadDeadline();
        if (tokenIn == address(0) || commitment == bytes32(0)) revert BadCommitment();

        id = nextIntentId++;
        intents[id] = Intent({
            trader: msg.sender,
            tokenIn: tokenIn,
            amountIn: amountIn,
            commitment: commitment,
            deadline: deadline,
            open: true
        });
        ciphertexts[id] = ciphertext;

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        emit IntentSubmitted(id, msg.sender, tokenIn, amountIn, commitment, deadline);
    }

    function cancel(uint256 id) external {
        Intent storage it = intents[id];
        if (!it.open) revert NotOpen();
        if (it.trader != msg.sender) revert NotTrader();
        it.open = false;
        IERC20(it.tokenIn).safeTransfer(it.trader, it.amountIn);
        emit IntentCancelled(id);
    }

    /**
     * @notice TEE-attested settlement: route escrowed tokenIn → tokenOut via Manager.
     * @param teeSig ECDSA over eth-signed hash of settlement digest (see settlementDigest)
     */
    function settle(
        uint256 id,
        address tokenOut,
        uint256 amountOutMin,
        uint24 fee,
        address recipient,
        bytes calldata teeSig
    ) external returns (uint256 amountOut) {
        Intent storage it = intents[id];
        if (!it.open) revert NotOpen();
        if (block.timestamp > it.deadline) revert Expired();
        if (recipient == address(0) || tokenOut == address(0)) revert ZeroAddress();

        bytes32 digest = settlementDigest(
            id,
            tokenOut,
            amountOutMin,
            fee,
            recipient,
            it.deadline
        );
        address recovered = digest.toEthSignedMessageHash().recover(teeSig);
        if (recovered != teeSigner) revert BadSignature();

        it.open = false;

        IERC20(it.tokenIn).forceApprove(address(manager), it.amountIn);
        amountOut = manager.swapSingle(
            IUniswapV3Manager.SwapSingleParams({
                tokenIn: it.tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                amountIn: it.amountIn,
                sqrtPriceLimitX96: 0
            })
        );
        if (amountOut < amountOutMin) revert Slippage();

        IERC20(tokenOut).safeTransfer(recipient, amountOut);
        emit IntentSettled(id, recipient, tokenOut, amountOut, fee);
    }

    function settlementDigest(
        uint256 id,
        address tokenOut,
        uint256 amountOutMin,
        uint24 fee,
        address recipient,
        uint64 deadline
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    block.chainid,
                    address(this),
                    id,
                    tokenOut,
                    amountOutMin,
                    fee,
                    recipient,
                    deadline
                )
            );
    }
}
