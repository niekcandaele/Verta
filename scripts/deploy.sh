#!/usr/bin/env bash

# Verta Helm Deployment Script
# This script deploys the Verta application to Kubernetes using Helm
# It reads sensitive configuration from environment variables

set -euo pipefail

# Default values
RELEASE_NAME="verta"
NAMESPACE="default"
CHART_PATH="./charts/verta"
VALUES_FILE=""
DOMAIN=""
DRY_RUN=false

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Usage function
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy Verta application using Helm

Required Environment Variables:
    ADMIN_API_KEY              Admin API key for internal services
    DATABASE_URL               TiDB connection string (mysql://user:pass@host:4000/db)
    DISCORD_BOT_TOKEN          Discord bot token
    OPENROUTER_API_KEY         OpenRouter API key
    TEST_DISCORD_GUILD_ID      Test Discord guild ID
    TEST_DISCORD_TENANT_NAME   Test Discord tenant name
    TEST_DISCORD_TENANT_SLUG   Test Discord tenant slug

Options:
    -n, --namespace     Kubernetes namespace (default: default)
    -f, --values        Path to additional values file
    -d, --domain        Override the domain (default: from values file)
    -r, --release       Release name (default: verta)
    --dry-run           Perform a dry run without installing
    -h, --help          Show this help message

Examples:
    # Basic deployment
    $0

    # Deploy to staging namespace with custom domain
    $0 --namespace staging --domain staging.verta.com

    # Deploy with production values
    $0 --values ./charts/verta/values-prod.yaml --namespace production

    # Dry run to see what would be deployed
    $0 --dry-run

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -f|--values)
            VALUES_FILE="$2"
            shift 2
            ;;
        -d|--domain)
            DOMAIN="$2"
            shift 2
            ;;
        -r|--release)
            RELEASE_NAME="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            usage
            exit 1
            ;;
    esac
done

# Validate required environment variables
validate_env() {
    local missing=()

    [[ -z "${ADMIN_API_KEY:-}" ]] && missing+=("ADMIN_API_KEY")
    [[ -z "${DATABASE_URL:-}" ]] && missing+=("DATABASE_URL")
    [[ -z "${DISCORD_BOT_TOKEN:-}" ]] && missing+=("DISCORD_BOT_TOKEN")
    [[ -z "${OPENROUTER_API_KEY:-}" ]] && missing+=("OPENROUTER_API_KEY")
    [[ -z "${TEST_DISCORD_GUILD_ID:-}" ]] && missing+=("TEST_DISCORD_GUILD_ID")
    [[ -z "${TEST_DISCORD_TENANT_NAME:-}" ]] && missing+=("TEST_DISCORD_TENANT_NAME")
    [[ -z "${TEST_DISCORD_TENANT_SLUG:-}" ]] && missing+=("TEST_DISCORD_TENANT_SLUG")

    if [[ ${#missing[@]} -ne 0 ]]; then
        echo -e "${RED}Error: Missing required environment variables:${NC}"
        printf '%s\n' "${missing[@]}"
        echo ""
        echo "Please set these environment variables before running this script."
        echo "Example:"
        echo "  export ADMIN_API_KEY='your-admin-key'"
        echo "  export DATABASE_URL='mysql://user:pass@host:4000/database'"
        echo "  export DISCORD_BOT_TOKEN='your-discord-token'"
        echo "  export OPENROUTER_API_KEY='your-openrouter-key'"
        echo "  export TEST_DISCORD_GUILD_ID='your-guild-id'"
        echo "  export TEST_DISCORD_TENANT_NAME='your-tenant-name'"
        echo "  export TEST_DISCORD_TENANT_SLUG='your-tenant-slug'"
        exit 1
    fi
}

# Validate chart exists
validate_chart() {
    if [[ ! -f "$CHART_PATH/Chart.yaml" ]]; then
        echo -e "${RED}Error: Helm chart not found at $CHART_PATH${NC}"
        echo "Please run this script from the root of the Verta repository."
        exit 1
    fi
}

# Validate values file if provided
validate_values_file() {
    if [[ -n "$VALUES_FILE" ]] && [[ ! -f "$VALUES_FILE" ]]; then
        echo -e "${RED}Error: Values file not found: $VALUES_FILE${NC}"
        exit 1
    fi
}

# Main deployment function
deploy() {
    echo -e "${GREEN}Deploying Verta to Kubernetes...${NC}"
    echo "Release: $RELEASE_NAME"
    echo "Namespace: $NAMESPACE"
    echo "Chart: $CHART_PATH"

    # Build helm command
    local helm_cmd=(
        "helm" "upgrade" "--install"
        "$RELEASE_NAME"
        "$CHART_PATH"
        "--namespace" "$NAMESPACE"
        "--create-namespace"
        "--set" "secrets.adminApiKey=$ADMIN_API_KEY"
        "--set" "secrets.databaseUrl=$DATABASE_URL"
        "--set" "secrets.discordBotToken=$DISCORD_BOT_TOKEN"
        "--set" "secrets.openrouterApiKey=$OPENROUTER_API_KEY"
        "--set-string" "secrets.testDiscordGuildId=$TEST_DISCORD_GUILD_ID"
        "--set" "secrets.testDiscordTenantName=$TEST_DISCORD_TENANT_NAME"
        "--set" "secrets.testDiscordTenantSlug=$TEST_DISCORD_TENANT_SLUG"
    )

    # Add optional parameters
    if [[ -n "$VALUES_FILE" ]]; then
        helm_cmd+=("--values" "$VALUES_FILE")
        echo "Values file: $VALUES_FILE"
    fi

    if [[ -n "$DOMAIN" ]]; then
        helm_cmd+=("--set" "global.domain=$DOMAIN")
        echo "Domain: $DOMAIN"
    fi

    if [[ "$DRY_RUN" == true ]]; then
        helm_cmd+=("--dry-run" "--debug")
        echo -e "${YELLOW}Running in dry-run mode...${NC}"
    fi

    echo ""

    # Execute helm command
    # Note: We don't echo the actual command to avoid exposing secrets
    echo -e "${YELLOW}Executing helm upgrade --install...${NC}"

    if "${helm_cmd[@]}"; then
        echo ""
        echo -e "${GREEN}Deployment successful!${NC}"

        if [[ "$DRY_RUN" != true ]]; then
            echo ""
            echo "To check the deployment status:"
            echo "  kubectl get pods -n $NAMESPACE -l app.kubernetes.io/instance=$RELEASE_NAME"
            echo ""
            echo "To view the deployment notes:"
            echo "  helm get notes $RELEASE_NAME -n $NAMESPACE"
        fi
    else
        echo -e "${RED}Deployment failed!${NC}"
        exit 1
    fi
}

# Main execution
main() {
    echo -e "${GREEN}Verta Helm Deployment Script${NC}"
    echo "=============================="
    echo ""

    # Validate environment
    validate_env
    validate_chart
    validate_values_file

    # Deploy
    deploy
}

# Run main function
main