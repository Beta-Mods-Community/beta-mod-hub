#!/usr/bin/env bash
set -euo pipefail

# --- 4 GiB swapfile ---------------------------------------------------------
# Oracle Cloud Ampere A1 (1 OCPU / 4 GB RAM) — swap is cheap insurance
# while `docker compose build` is running. Idempotent: rerunning this script
# leaves an existing swapfile, fstab entry, and sysctl tuning untouched.
SWAP_FILE=/swapfile
SWAP_SIZE_MB=4096

if [ -f "$SWAP_FILE" ]; then
  echo "Swapfile $SWAP_FILE already exists — leaving it as-is."
else
  echo "Creating ${SWAP_SIZE_MB}MiB swapfile at $SWAP_FILE..."
  # fallocate is instant but unsupported on some filesystems; fall back to dd.
  if ! sudo fallocate -l ${SWAP_SIZE_MB}M "$SWAP_FILE"; then
    sudo dd if=/dev/zero of="$SWAP_FILE" bs=1M count=${SWAP_SIZE_MB} conv=fsync
  fi
  sudo chmod 600 "$SWAP_FILE"
  sudo mkswap "$SWAP_FILE"
fi

# Activate now. Guarded so a rerun (or a reboot that raced the fstab add)
# enables it without recreating anything.
sudo swapon --show | grep -q "^$SWAP_FILE " || sudo swapon "$SWAP_FILE"

# Persist across reboots — appended once, never duplicated.
if sudo grep -q "^$SWAP_FILE " /etc/fstab; then
  echo "Swap entry already present in /etc/fstab — skipping."
else
  echo "$SWAP_FILE none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
  echo "Added swap entry to /etc/fstab."
  # Regenerate systemd units so the swap unit is known without a reboot.
  sudo systemctl daemon-reload
fi

# Persistent swappiness tuning (default 60 is aggressive for low-RAM VMs).
if [ -f /etc/sysctl.d/99-swappiness.conf ]; then
  echo "Swappiness tuning already present — skipping."
else
  echo "vm.swappiness=10" | sudo tee /etc/sysctl.d/99-swappiness.conf >/dev/null
  sudo sysctl --system
fi

# --- Docker (Oracle Linux 9 / dnf) -----------------------------------------

sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker

echo "Swap + Docker are ready. Use sudo docker compose on this host."
swapon --show
