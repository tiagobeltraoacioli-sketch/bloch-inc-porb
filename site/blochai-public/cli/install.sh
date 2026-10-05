#!/bin/sh
# Qentl CLI installer for macOS and Linux. Installs into a private environment
# under ~/.qentl/cli and links the command at ~/.local/bin/qentl. No sudo.
set -eu
VERSION=0.6.1.post2
WHEEL="qentl-$VERSION-py3-none-any.whl"
SHA256=be20169d9e607d809d5134891cecc2e00406c67690fd357ff1ddc96cbe7f2b41
URL="https://qentl.ai/cli/$WHEEL"
HOME_DIR="$HOME/.qentl/cli"
BIN_DIR="$HOME/.local/bin"

PYTHON=""
for candidate in python3 python3.13 python3.12 python3.11 python3.10 python3.9; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 9))' 2>/dev/null; then
    PYTHON=$candidate; break
  fi
done
if [ -z "$PYTHON" ]; then
  echo "Qentl needs Python 3.9 or newer. On macOS run: xcode-select --install" >&2; exit 1
fi

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
echo "Downloading Qentl CLI ${VERSION}..."
curl -fsSL --proto '=https' --tlsv1.2 "$URL" -o "$TMP/$WHEEL"
ACTUAL=$("$PYTHON" -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$TMP/$WHEEL")
if [ "$ACTUAL" != "$SHA256" ]; then
  echo "Checksum mismatch; nothing was installed." >&2; exit 1
fi

echo "Installing into ${HOME_DIR}..."
rm -rf "$HOME_DIR.new"; mkdir -p "$HOME/.qentl"
"$PYTHON" -m venv "$HOME_DIR.new"
"$HOME_DIR.new/bin/python" -m pip install --quiet --disable-pip-version-check --upgrade pip
# Prebuilt dependencies only: never compile on the user's machine.
"$HOME_DIR.new/bin/python" -m pip install --quiet --disable-pip-version-check --only-binary=:all: "$TMP/$WHEEL"
"$HOME_DIR.new/bin/qentl" --help >/dev/null
rm -rf "$HOME_DIR"; mv "$HOME_DIR.new" "$HOME_DIR"
# A moved environment keeps its old path in script headers; recreate the launcher.
mkdir -p "$BIN_DIR"
printf '#!/bin/sh\nexec "%s/bin/python" -m blockai.terminal.app "$@"\n' "$HOME_DIR" > "$BIN_DIR/qentl"
chmod 755 "$BIN_DIR/qentl"
"$BIN_DIR/qentl" --help >/dev/null

echo "Qentl CLI $VERSION installed: $BIN_DIR/qentl"
case ":$PATH:" in
  *":$BIN_DIR:"*) echo "Run: qentl login --email you@example.com" ;;
  *) echo "Add it to your PATH, then open a new terminal:"
     echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc"
     echo "Or run it directly: $BIN_DIR/qentl login --email you@example.com" ;;
esac
