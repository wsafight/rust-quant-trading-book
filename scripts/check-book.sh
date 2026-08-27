#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

command -v cargo >/dev/null || { echo "cargo is required" >&2; exit 1; }
command -v mdbook >/dev/null || { echo "mdbook is required" >&2; exit 1; }
command -v perl >/dev/null || { echo "perl is required" >&2; exit 1; }

manifest="book/code/Cargo.toml"

echo "[1/8] Checking Rust formatting"
cargo fmt --manifest-path "$manifest" --all -- --check

echo "[2/8] Running Clippy"
cargo clippy --locked --manifest-path "$manifest" --all-targets --all-features -- -D warnings

echo "[3/8] Running companion project tests"
cargo test --locked --manifest-path "$manifest"

echo "[4/8] Checking all Cargo targets"
cargo check --locked --manifest-path "$manifest" --all-targets --all-features

echo "[5/8] Compiling the Criterion benchmark"
cargo bench --locked --manifest-path "$manifest" --bench parse_level --no-run

echo "[6/8] Testing compilable Rust snippets"
mdbook test

echo "[7/8] Checking the book structure and local links"
perl scripts/check-book-links.pl book/src

echo "[8/8] Building the HTML book"
mdbook build

echo "All book checks passed."
