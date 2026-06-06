# syntax=docker/dockerfile:1.7
#
# Pre-built hackathon dev environment.
# Bakes in everything attendees need so a Codespace start is a single image pull.
#
# Published to: ghcr.io/zainrizvi/hackathon-template-env:latest
# Built by:     .github/workflows/build-devcontainer-image.yml on push to main.
#
# Layer order: roughly slowest-changing to fastest-changing, so most rebuilds
# hit the cache from the top. Apt utilities -> apt-based third-party CLIs (gh)
# -> language runtimes (node, python) -> npm globals -> curl-installed CLIs
# (uv, opencode).

FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ENV DEBIAN_FRONTEND=noninteractive

# ---- apt packages -----------------------------------------------------------
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      gnupg \
      httpie \
      jq \
      tmux \
      tree \
      ripgrep \
      fd-find \
      unzip \
 && rm -rf /var/lib/apt/lists/* \
 && ln -s /usr/bin/fdfind /usr/local/bin/fd

# ---- GitHub CLI -------------------------------------------------------------
RUN install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
 && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# ---- Node.js 24 (NodeSource) ------------------------------------------------
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# ---- Python 3 + pip + venv -------------------------------------------------
# We accept the distro python (3.12 on noble) instead of building 3.13 from
# source, which would add several minutes to the image build for little
# hackathon benefit. Attendees needing a different Python can use the bundled
# uv (e.g. `uv python install 3.13`).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      python3-venv \
 && rm -rf /var/lib/apt/lists/*

# Docker is intentionally NOT installed here. The docker-in-docker devcontainer
# feature (see .devcontainer/devcontainer.json) installs both the CLI and the
# daemon on top of this image during feature build, so installing Docker here
# would be redundant work that the feature undoes anyway.

# ---- Global npm CLIs for hackathon deploys ----------------------------------
RUN npm install -g --no-fund --no-audit \
      vercel \
      netlify-cli \
      wrangler \
      @railway/cli \
      neonctl \
 && npm cache clean --force

# ---- uv (fast Python package + project manager) -----------------------------
# UV_INSTALL_DIR tells the installer to drop the binaries directly in our
# target location, so no move/cleanup is needed.
RUN curl -fsSL https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# ---- opencode (AI coding agent) ---------------------------------------------
# At the time of writing, the installer hardcodes $HOME/.opencode/bin and
# offers no override env var, so we install as root and relocate the binary
# to /usr/local/bin, which is already on every user's PATH (including the
# vscode user the container runs as). If upstream adds an install-dir
# override, simplify this the way the uv block does.
RUN curl -fsSL https://opencode.ai/install | bash \
 && mv /root/.opencode/bin/opencode /usr/local/bin/opencode \
 && rm -rf /root/.opencode

# ---- Default user files baked into the image --------------------------------
# ~/.vscode-remote/ (Codespaces) and ~/.vscode-server/ (local Dev Containers)
# are populated by VS Code Server at container start, so files baked at this
# path in the image get overwritten or never read. Stage in a non-shadowed
# location instead, then devcontainer.json's postCreateCommand + postStartCommand
# copies them into the Server-managed directories on attach.
COPY image-files/ /usr/local/share/hackathon-template/

# ---- Sanity assertions ------------------------------------------------------
# If any of these are missing, fail the image build loudly so a broken image
# never ships.
RUN fd --version \
 && node --version \
 && python3 --version \
 && gh --version | head -n1 \
 && vercel --version \
 && netlify --version | head -n1 \
 && wrangler --version \
 && railway --version \
 && neonctl --version \
 && uv --version \
 && opencode --version \
 && test -s /usr/local/share/hackathon-template/keybindings.json

