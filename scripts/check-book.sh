#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

command -v cargo >/dev/null || { echo "cargo is required" >&2; exit 1; }
command -v mdbook >/dev/null || { echo "mdbook is required" >&2; exit 1; }
command -v perl >/dev/null || { echo "perl is required" >&2; exit 1; }

manifest="book/code/Cargo.toml"

echo "[1/7] Checking Rust formatting"
cargo fmt --manifest-path "$manifest" --all -- --check

echo "[2/7] Running Clippy"
cargo clippy --locked --manifest-path "$manifest" --all-targets --all-features -- -D warnings

echo "[3/7] Running companion project tests"
cargo test --locked --manifest-path "$manifest" --all-features

echo "[4/7] Compiling the Criterion benchmark"
cargo bench --locked --manifest-path "$manifest" --bench parse_level --no-run

echo "[5/7] Testing compilable Rust snippets"
mdbook test

echo "[6/7] Checking the book structure and local links"
perl scripts/check-book-links.pl book/src

echo "[7/7] Building the HTML book"
mdbook build

echo "All book checks passed."
