#!/usr/bin/env bash
# Declare + deploy GhostBookAnonymizer, then verify the deployment.
#
# The constructor binds the contract to one privacy pool, and only that pool can drive fills, so the
# script checks the deployed contract reports the pool it was meant to be bound to before printing
# the address to configure.
#
#   ./scripts/deploy-anonymizer.sh [mainnet|sepolia]
#
# Requires: scarb, sncast (starkup), a funded sncast account named by SNCAST_ACCOUNT.

set -euo pipefail

NETWORK="${1:-mainnet}"
ACCOUNT="${SNCAST_ACCOUNT:-ghostbook-deployer}"

case "$NETWORK" in
  mainnet)
    POOL="0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a"
    ENV_VAR="NEXT_PUBLIC_ANONYMIZER_MAINNET"
    ;;
  sepolia)
    POOL="${PRIVACY_POOL_SEPOLIA:-}"
    ENV_VAR="NEXT_PUBLIC_ANONYMIZER_SEPOLIA"
    if [[ -z "$POOL" ]]; then
      echo "Set PRIVACY_POOL_SEPOLIA to the Sepolia privacy pool address." >&2
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 [mainnet|sepolia]" >&2
    exit 1
    ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/starknet"

echo "==> Building (release)"
scarb --profile release build

echo "==> Declaring GhostBookAnonymizer on $NETWORK"
DECLARE_OUT="$(sncast --account "$ACCOUNT" declare \
  --contract-name GhostBookAnonymizer \
  --network "$NETWORK" 2>&1 || true)"
echo "$DECLARE_OUT"

CLASS_HASH="$(printf '%s\n' "$DECLARE_OUT" | grep -oE '0x[0-9a-fA-F]{60,64}' | head -1)"
if [[ -z "$CLASS_HASH" ]]; then
  echo "Could not parse a class hash. If the class is already declared, pass it via CLASS_HASH=..." >&2
  CLASS_HASH="${CLASS_HASH:-}"
  [[ -n "${CLASS_HASH}" ]] || exit 1
fi
echo "==> Class hash: $CLASS_HASH"

echo "==> Deploying with pool $POOL"
DEPLOY_OUT="$(sncast --account "$ACCOUNT" deploy \
  --class-hash "$CLASS_HASH" \
  --constructor-calldata "$POOL" \
  --network "$NETWORK" 2>&1)"
echo "$DEPLOY_OUT"

ADDRESS="$(printf '%s\n' "$DEPLOY_OUT" | grep -iA1 'contract.address' | grep -oE '0x[0-9a-fA-F]{40,64}' | head -1)"
if [[ -z "$ADDRESS" ]]; then
  echo "Deployed, but could not parse the contract address from the output above." >&2
  exit 1
fi

echo "==> Verifying the deployment is bound to the pool"
CALL_OUT="$(sncast --account "$ACCOUNT" call \
  --contract-address "$ADDRESS" \
  --function get_privacy_pool \
  --network "$NETWORK" 2>&1)"
echo "$CALL_OUT"

if ! printf '%s\n' "$CALL_OUT" | tr 'A-Z' 'a-z' | grep -q "$(printf '%s' "${POOL#0x}" | sed 's/^0*//' | tr 'A-Z' 'a-z')"; then
  echo "WARNING: get_privacy_pool did not echo the expected pool. Inspect the output above." >&2
fi

cat <<EOF

==> Deployed GhostBookAnonymizer
    network:    $NETWORK
    address:    $ADDRESS
    class hash: $CLASS_HASH
    pool:       $POOL

Next:
  1. echo "$ENV_VAR=$ADDRESS" >> "$ROOT/.env.local"
  2. add "$ADDRESS" to "contracts" in $ROOT/strk20.json
  3. restart the dev server so the address is picked up
EOF
