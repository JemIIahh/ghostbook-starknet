// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IMockToken {
    function mint(address to, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
    function transferOwnership(address newOwner) external;
}

/**
 * @title GhostFaucet
 * @notice Tops up GHOST / BOOK / SPARK to 100 tokens when balance is below 100.
 * @dev Must be the Ownable owner of each MockToken (transfer ownership after deploy).
 */
contract GhostFaucet is Ownable {
    IMockToken public immutable ghost;
    IMockToken public immutable book;
    IMockToken public immutable spark;

    /// Human threshold: top up to this many whole tokens.
    uint256 public constant THRESHOLD = 100;

    event Dripped(address indexed account, address indexed token, uint256 amount);
    event Skipped(address indexed account, address indexed token, uint256 balance);

    constructor(address ghost_, address book_, address spark_) Ownable(msg.sender) {
        require(ghost_ != address(0) && book_ != address(0) && spark_ != address(0), "bad token");
        ghost = IMockToken(ghost_);
        book = IMockToken(book_);
        spark = IMockToken(spark_);
    }

    /// @notice Drip all three tokens for msg.sender (only if balance < 100).
    function drip() external {
        _dripOne(ghost, msg.sender);
        _dripOne(book, msg.sender);
        _dripOne(spark, msg.sender);
    }

    /// @notice Drip for a recipient (same rules).
    function dripTo(address to) external {
        require(to != address(0), "bad to");
        _dripOne(ghost, to);
        _dripOne(book, to);
        _dripOne(spark, to);
    }

    /// @notice Owner mint for Admin UI after token ownership moves here.
    function mint(address token, address to, uint256 amount) external onlyOwner {
        IMockToken(token).mint(to, amount);
    }

    /// @notice Recover MockToken ownership if needed.
    function transferTokenOwnership(address token, address newOwner) external onlyOwner {
        IMockToken(token).transferOwnership(newOwner);
    }

    function _dripOne(IMockToken token, address to) internal {
        uint8 dec = token.decimals();
        uint256 threshold = THRESHOLD * (10 ** uint256(dec));
        uint256 bal = token.balanceOf(to);
        if (bal >= threshold) {
            emit Skipped(to, address(token), bal);
            return;
        }
        uint256 amount = threshold - bal;
        token.mint(to, amount);
        emit Dripped(to, address(token), amount);
    }
}
