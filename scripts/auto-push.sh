#!/bin/bash
# ==============================================================================
# DATA-SENTINEL — TRUE AUTOMATIC GITHUB SYNC
# ==============================================================================
# Continuously monitors the repository for changes to tracked / trackable files.
# Features:
#   - 20-second debounce window after last detected change
#   - Automatically runs: git add . -> git commit -> git push origin main
#   - Respects .gitignore (never commits .env, node_modules, dist, __pycache__, etc.)
#   - Safety guarantee: NEVER uses --force, never resets local work on push error
#   - Graceful termination on Ctrl+C
# ==============================================================================

set -euo pipefail

# Ensure we operate in the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

DEBOUNCE_SECONDS=20
POLL_INTERVAL_SECONDS=2
BRANCH="main"
REMOTE="origin"
DEFAULT_COMMIT_MSG="auto: sync latest changes"

echo "============================================================"
echo " DATA SENTINEL — TRUE AUTOMATIC GITHUB SYNC"
echo "============================================================"
echo " Project root: ${PROJECT_ROOT}"
echo " Target:      ${REMOTE}/${BRANCH}"
echo " Debounce:    ${DEBOUNCE_SECONDS}s"
echo " Status:      Active (Press Ctrl+C to stop)"
echo "============================================================"

# Trap SIGINT / SIGTERM for clean shutdown
cleanup() {
    echo ""
    echo "Auto-sync stopped by user. Local work is completely intact."
    exit 0
}
trap cleanup SIGINT SIGTERM

# Function to get git status digest of uncommitted changes (excluding ignored)
get_git_changes() {
    # Returns short status lines of unstaged/untracked files respecting .gitignore
    git status --porcelain
}

# Ensure git repository is on expected branch
CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || echo "")"
if [ "${CURRENT_BRANCH}" != "${BRANCH}" ]; then
    echo "Warning: Current branch is '${CURRENT_BRANCH}', expected '${BRANCH}'."
fi

# Main watcher loop
LAST_CHANGE_TIME=0
CHANGES_PENDING=false

PREV_CHANGES=""

while true; do
    CHANGES="$(get_git_changes)"
    NOW="$(date +%s)"

    if [ -n "${CHANGES}" ]; then
        if [ "${CHANGES_PENDING}" = false ]; then
            CHANGES_PENDING=true
            LAST_CHANGE_TIME="${NOW}"
            PREV_CHANGES="${CHANGES}"
            echo ""
            echo "[$(date +'%Y-%m-%d %H:%M:%S')] Changes detected in repository:"
            echo "${CHANGES}" | sed 's/^/  /'
            echo "Waiting ${DEBOUNCE_SECONDS}s debounce period for activity to settle..."
        elif [ "${CHANGES}" != "${PREV_CHANGES}" ]; then
            # Content of changes changed; reset debounce clock
            LAST_CHANGE_TIME="${NOW}"
            PREV_CHANGES="${CHANGES}"
            echo "[$(date +'%Y-%m-%d %H:%M:%S')] Additional modifications detected. Resetting ${DEBOUNCE_SECONDS}s debounce window..."
        fi
    fi

    if [ "${CHANGES_PENDING}" = true ]; then
        ELAPSED=$((NOW - LAST_CHANGE_TIME))
        if [ "${ELAPSED}" -ge "${DEBOUNCE_SECONDS}" ]; then
            # Debounce window satisfied; re-verify if changes still exist
            CURRENT_CHANGES="$(get_git_changes)"
            if [ -n "${CURRENT_CHANGES}" ]; then
                echo ""
                echo "[$(date +'%Y-%m-%d %H:%M:%S')] Debounce window elapsed (${DEBOUNCE_SECONDS}s). Initiating sync..."
                
                # Check that .env is NOT staged
                git add .
                
                # Verify .env is not accidentally staged
                if git diff --cached --name-only | grep -E "(^|/)\.env($|\.)" | grep -v "\.env\.example"; then
                    echo "CRITICAL SAFETY ALERT: Attempted to stage .env file! Unstaging immediately."
                    git reset HEAD -- .env .env.* 2>/dev/null || true
                fi

                # Double check there are staged changes
                if ! git diff --cached --quiet; then
                    echo "Creating commit: '${DEFAULT_COMMIT_MSG}'"
                    git commit -m "${DEFAULT_COMMIT_MSG}"
                    
                    echo "Pushing to ${REMOTE} ${BRANCH}..."
                    if git push "${REMOTE}" "${BRANCH}"; then
                        echo "[$(date +'%Y-%m-%d %H:%M:%S')] GitHub synchronized successfully."
                    else
                        echo "[ERROR] 'git push ${REMOTE} ${BRANCH}' failed."
                        echo "Keeping local work intact. Will retry upon subsequent changes or resolution."
                    fi
                else
                    echo "No staged changes to commit."
                fi
            fi
            CHANGES_PENDING=false
            echo "Watching for changes..."
        fi
    fi

    sleep "${POLL_INTERVAL_SECONDS}"
done
