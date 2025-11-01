#!/bin/bash
# Migration Script: Move Private Keys from .env to Secure File
# This script automates the migration of private keys from environment variables to a secure file

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================================="
echo "Private Key Migration Script"
echo "=================================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi

# Extract keys from .env
SERVER_KEY=$(grep "^SERVER_PRIVATE_KEY=" .env | cut -d '=' -f2)
MINTER_KEY=$(grep "^MINTER_PRIVATE_KEY=" .env | cut -d '=' -f2)
LP_DEPLOYER_KEY=$(grep "^LP_DEPLOYER_PRIVATE_KEY=" .env | cut -d '=' -f2)

# Validate keys exist
if [ -z "$SERVER_KEY" ] || [ -z "$MINTER_KEY" ] || [ -z "$LP_DEPLOYER_KEY" ]; then
    echo -e "${RED}❌ Not all required keys found in .env${NC}"
    echo ""
    echo "Required keys:"
    echo "  - SERVER_PRIVATE_KEY"
    echo "  - MINTER_PRIVATE_KEY"
    echo "  - LP_DEPLOYER_PRIVATE_KEY"
    exit 1
fi

echo -e "${GREEN}✓ Found all three private keys in .env${NC}"
echo ""

# Set target file location (macOS uses user config dir by default)
if [[ "$OSTYPE" == "darwin"* ]]; then
    DEFAULT_KEY_FILE="$HOME/.config/token-mint/private.key"
else
    DEFAULT_KEY_FILE="/etc/secret/private.key"
fi
TARGET_FILE=${PRIVATE_KEY_FILE:-$DEFAULT_KEY_FILE}

# Create directory
echo "Creating directory $(dirname $TARGET_FILE)..."
if [[ "$OSTYPE" == "darwin"* ]] && [[ "$TARGET_FILE" == "$HOME"* ]]; then
    # macOS user directory - no sudo needed
    mkdir -p $(dirname $TARGET_FILE)
    chmod 700 $(dirname $TARGET_FILE)
else
    # System directory - needs sudo
    sudo mkdir -p $(dirname $TARGET_FILE)
    sudo chmod 700 $(dirname $TARGET_FILE)
fi
echo -e "${GREEN}✓ Directory created${NC}"
echo ""

# Create JSON file
echo "Creating private key file..."
if [[ "$OSTYPE" == "darwin"* ]] && [[ "$TARGET_FILE" == "$HOME"* ]]; then
    # macOS user directory - no sudo
    tee $TARGET_FILE > /dev/null <<EOF
{
  "serverPrivateKey": "$SERVER_KEY",
  "minterPrivateKey": "$MINTER_KEY",
  "lpDeployerPrivateKey": "$LP_DEPLOYER_KEY"
}
EOF
else
    # System directory - needs sudo
    sudo tee $TARGET_FILE > /dev/null <<EOF
{
  "serverPrivateKey": "$SERVER_KEY",
  "minterPrivateKey": "$MINTER_KEY",
  "lpDeployerPrivateKey": "$LP_DEPLOYER_KEY"
}
EOF
fi

echo -e "${GREEN}✓ Private key file created${NC}"
echo ""

# Set permissions
echo "Setting file permissions..."
if [[ "$OSTYPE" == "darwin"* ]] && [[ "$TARGET_FILE" == "$HOME"* ]]; then
    chmod 600 $TARGET_FILE
else
    sudo chmod 600 $TARGET_FILE
    sudo chown $(whoami) $TARGET_FILE
fi
echo -e "${GREEN}✓ Permissions set to 600${NC}"
echo ""

# Verify file
echo "Verifying file..."
ls -l $TARGET_FILE
echo ""

# Backup .env
echo "Creating backup of .env..."
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo -e "${GREEN}✓ Backup created${NC}"
echo ""

# Remove keys from .env
echo "Removing private keys from .env..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' '/^SERVER_PRIVATE_KEY=/d' .env
    sed -i '' '/^MINTER_PRIVATE_KEY=/d' .env
    sed -i '' '/^LP_DEPLOYER_PRIVATE_KEY=/d' .env
else
    # Linux
    sed -i '/^SERVER_PRIVATE_KEY=/d' .env
    sed -i '/^MINTER_PRIVATE_KEY=/d' .env
    sed -i '/^LP_DEPLOYER_PRIVATE_KEY=/d' .env
fi
echo -e "${GREEN}✓ Keys removed from .env${NC}"
echo ""

# Add comment to .env
echo "" >> .env
echo "# Private keys now stored in: $TARGET_FILE" >> .env
echo "# See server/PRIVATE_KEY_SETUP.md for more information" >> .env

echo "=================================================="
echo -e "${GREEN}✓ Migration completed successfully!${NC}"
echo "=================================================="
echo ""
echo "Summary:"
echo "  - Private keys stored in: $TARGET_FILE"
echo "  - File permissions: 600 (owner read/write only)"
echo "  - Original .env backed up"
echo "  - Keys removed from .env"
echo ""
echo -e "${YELLOW}⚠️  Next steps:${NC}"
echo "  1. Verify the server starts correctly"
echo "  2. Once confirmed, you can delete the .env.backup files"
echo "  3. Update your deployment scripts/documentation"
echo ""
echo "To test:"
echo "  npm run build && npm start"
echo ""

