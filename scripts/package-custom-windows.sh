#!/usr/bin/env bash
# Build through the fork's standard GitHub runners; no Windows toolchain needed.
set -euo pipefail

source_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
output=''
rebuild=false
while (($#)); do
  case "$1" in
    --output)
      [[ $# -ge 2 ]] || { echo 'Missing --output directory' >&2; exit 2; }
      output=$2
      shift 2
      ;;
    --rebuild) rebuild=true; shift ;;
    --help|-h)
      echo 'Usage: bash scripts/package-custom-windows.sh [--rebuild] [--output DIRECTORY]'
      echo 'Waits for the current pushed commit to build, then downloads its installer.'
      echo '--rebuild reruns its existing workflow with a new release version.'
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

command -v gh >/dev/null || { echo 'Install GitHub CLI and run gh auth login first.' >&2; exit 1; }
cd "$source_root"
if [[ -n $(git status --porcelain) ]]; then
  echo 'Commit and push your changes before building; GitHub cannot see local edits.' >&2
  exit 1
fi
repository=$(gh repo view "$(git remote get-url origin)" --json nameWithOwner --jq .nameWithOwner)
branch=$(git branch --show-current)
[[ $branch == main ]] || { echo 'Switch to main to download a published build; feature branches do not publish releases.' >&2; exit 1; }
commit=$(git rev-parse HEAD)
remote_commit=$(gh api "repos/$repository/git/ref/heads/$branch" --jq .object.sha)
[[ $commit == "$remote_commit" ]] || { echo 'Push this branch before building.' >&2; exit 1; }
run=$(gh run list --repo "$repository" --workflow custom-windows.yml --commit "$commit" \
  --limit 1 --json databaseId --jq '.[0].databaseId // empty')
[[ -n $run ]] || { echo 'No build found yet. Updating the fork’s main branch starts one.' >&2; exit 1; }
if $rebuild; then gh run rerun "$run" --repo "$repository"; fi
gh run watch "$run" --repo "$repository" --exit-status
attempt=$(gh api "repos/$repository/actions/runs/$run" --jq .run_attempt)
tag=$(gh api --paginate "repos/$repository/releases" \
  --jq ".[] | select(.draft == false and (.body | contains(\"Build run: $run; attempt: $attempt\"))) | .tag_name")
[[ -n $tag && $tag != *$'\n'* ]] || { echo 'Cannot identify the release for this build.' >&2; exit 1; }

if [[ -z $output ]]; then
  if command -v powershell.exe >/dev/null && command -v wslpath >/dev/null; then
    downloads=$(powershell.exe -NoProfile -NonInteractive -Command '(New-Object -ComObject Shell.Application).NameSpace("shell:Downloads").Self.Path' | tr -d '\r')
    output="$(wslpath -u "$downloads")/T3Code-Custom"
  else
    output="$HOME/Downloads/T3Code-Custom"
  fi
fi
output="$output/$tag"
mkdir -p "$output"
gh release download "$tag" --repo "$repository" --dir "$output" \
  --pattern '*.exe' --pattern SHA256SUMS --pattern BUILD-INFO.json --skip-existing
(cd "$output" && sha256sum --check --ignore-missing SHA256SUMS)
if command -v wslpath >/dev/null; then output=$(wslpath -w "$output"); fi
echo "Installer downloaded and verified: $output"
echo 'Installation is a separate, manual step. Future in-app updates come from this fork.'
