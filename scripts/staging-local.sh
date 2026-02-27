#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.staging.yml"
SOURCE_RUNTIME_FILE="${REPO_ROOT}/config/runtime-env.json"
STAGING_ROOT="${REPO_ROOT}/out/staging"
WORKTREE_ROOT="${REPO_ROOT}/.tmp/staging-worktrees"

V1_REF="${STAGING_V1_REF:-master}"
V2_REF="${STAGING_V2_REF:-v2}"

V1_IMAGE="usenetstreamer:staging-v1"
V2_IMAGE="usenetstreamer:staging-v2"

V1_RUNTIME_FILE="${STAGING_ROOT}/v1/config/runtime-env.json"
V2_LEGACY_RUNTIME_FILE="${STAGING_ROOT}/v2-legacy/config/runtime-env.json"
V2_RUNTIME_FILE="${STAGING_ROOT}/v2/config/runtime-env.json"

log() {
  printf '[staging-local] %s\n' "$*"
}

fail() {
  printf '[staging-local] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

ensure_ref_exists() {
  local ref="$1"
  git -C "${REPO_ROOT}" rev-parse --verify "${ref}^{commit}" >/dev/null 2>&1 \
    || fail "Git ref not found: ${ref}"
}

ensure_source_runtime_file() {
  if [[ ! -f "${SOURCE_RUNTIME_FILE}" ]]; then
    fail "config/runtime-env.json not found. Copy your production runtime-env.json there first."
  fi
}

seed_runtime_file() {
  local target_file="$1"
  local base_url="$2"
  local stream_v2_enabled="$3"

  mkdir -p "$(dirname "${target_file}")"

  node - "${SOURCE_RUNTIME_FILE}" "${target_file}" "${base_url}" "${stream_v2_enabled}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const [sourcePath, targetPath, baseUrl, streamV2Enabled] = process.argv.slice(2);

let payload = {};
try {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  payload = JSON.parse(raw);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('runtime-env.json must be a JSON object');
  }
} catch (error) {
  console.error(`[staging-local] Failed to parse ${sourcePath}: ${error.message}`);
  process.exit(1);
}

payload.PORT = '7000';
payload.ADDON_BASE_URL = baseUrl;
payload.STREAM_V2_ENABLED = streamV2Enabled;

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
NODE
}

seed_runtime_configs() {
  ensure_source_runtime_file
  log "Seeding runtime configs from config/runtime-env.json"
  seed_runtime_file "${V1_RUNTIME_FILE}" "http://127.0.0.1:17001" "false"
  seed_runtime_file "${V2_LEGACY_RUNTIME_FILE}" "http://127.0.0.1:17002" "false"
  seed_runtime_file "${V2_RUNTIME_FILE}" "http://127.0.0.1:17003" "true"
}

remove_worktree_dir() {
  local worktree_dir="$1"
  if [[ -d "${worktree_dir}" ]]; then
    git -C "${REPO_ROOT}" worktree remove --force "${worktree_dir}" >/dev/null 2>&1 || rm -rf "${worktree_dir}"
  fi
}

build_ref_image() {
  local ref="$1"
  local image_tag="$2"
  local label="$3"

  local safe_ref
  safe_ref="$(printf '%s' "${ref}" | tr '/:@' '___')"
  local worktree_dir="${WORKTREE_ROOT}/${label}-${safe_ref}"

  remove_worktree_dir "${worktree_dir}"
  mkdir -p "${WORKTREE_ROOT}"

  log "Preparing worktree for ${label} from ${ref}"
  git -C "${REPO_ROOT}" worktree add --detach "${worktree_dir}" "${ref}" >/dev/null

  local build_ok=0
  if docker build --pull -t "${image_tag}" "${worktree_dir}"; then
    build_ok=1
  fi

  remove_worktree_dir "${worktree_dir}"

  if [[ "${build_ok}" -ne 1 ]]; then
    fail "Docker build failed for ${label} (${ref})"
  fi
}

build_images() {
  require_cmd git
  require_cmd docker
  ensure_ref_exists "${V1_REF}"
  ensure_ref_exists "${V2_REF}"

  log "Building ${V1_IMAGE} from ${V1_REF}"
  build_ref_image "${V1_REF}" "${V1_IMAGE}" "v1"

  log "Building ${V2_IMAGE} from ${V2_REF}"
  build_ref_image "${V2_REF}" "${V2_IMAGE}" "v2"
}

show_urls() {
  cat <<'TEXT'
[staging-local] Services:
  v1 control            http://127.0.0.1:17001
  v2 legacy mode        http://127.0.0.1:17002
  v2 enabled mode       http://127.0.0.1:17003

If ADDON_SHARED_SECRET is set, use tokenized paths:
  /<token>/manifest.json
  /<token>/stream/:type/:id.json
TEXT
}

cmd_up() {
  require_cmd docker
  require_cmd node

  local skip_build=0
  local skip_seed=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-build) skip_build=1 ;;
      --skip-seed) skip_seed=1 ;;
      *) fail "Unknown option for up: $1" ;;
    esac
    shift
  done

  if [[ "${skip_build}" -ne 1 ]]; then
    build_images
  else
    log "Skipping image build"
  fi

  if [[ "${skip_seed}" -ne 1 ]]; then
    seed_runtime_configs
  else
    log "Skipping runtime config seeding"
  fi

  mkdir -p "${STAGING_ROOT}/v1" "${STAGING_ROOT}/v2-legacy" "${STAGING_ROOT}/v2"
  compose up -d --remove-orphans
  compose ps
  show_urls
}

cmd_down() {
  require_cmd docker
  compose down --remove-orphans
}

cmd_restart() {
  cmd_down
  cmd_up "$@"
}

cmd_status() {
  require_cmd docker
  compose ps
}

cmd_logs() {
  require_cmd docker
  if [[ $# -gt 0 ]]; then
    compose logs -f "$1"
  else
    compose logs -f
  fi
}

cmd_seed() {
  require_cmd node
  seed_runtime_configs
}

cmd_build() {
  build_images
}

usage() {
  cat <<'TEXT'
Usage: scripts/staging-local.sh <command> [options]

Commands:
  up [--skip-build] [--skip-seed]  Build images, seed runtime config, and start containers
  down                              Stop and remove staging containers
  restart [--skip-build] [--skip-seed]
                                    Restart staging stack
  build                             Build staging images only
  seed                              Seed per-service runtime configs only
  status                            Show container status
  logs [service]                    Tail logs for all or one service
  urls                              Print local staging URLs
  help                              Show this help

Defaults:
  STAGING_V1_REF=master
  STAGING_V2_REF=v2

Required input:
  config/runtime-env.json
    Copy your production runtime env JSON to this path before running 'up'.
TEXT
}

main() {
  local command="${1:-help}"
  shift || true

  case "${command}" in
    up) cmd_up "$@" ;;
    down) cmd_down ;;
    restart) cmd_restart "$@" ;;
    build) cmd_build ;;
    seed) cmd_seed ;;
    status) cmd_status ;;
    logs) cmd_logs "$@" ;;
    urls) show_urls ;;
    help|-h|--help) usage ;;
    *) fail "Unknown command: ${command}. Run 'scripts/staging-local.sh help'." ;;
  esac
}

main "$@"
