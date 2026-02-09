# Deployment Guide

## Prerequisites
- VPS with Docker and Docker Compose installed.
- Git.

## Steps

1. **Clone the repository**:
   Since the repository is **private**, you will need to authenticate.
   
   **Option A: SSH Agent Forwarding (Recommended)**
   On your local machine (not VPS):
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519 # or your github key
   ssh -A user@your-vps-ip
   ```
   Then on VPS:
   ```bash
   git clone git@github.com:gimbernat13/slop-detector.git
   cd slop-detector
   ```

   **Option B: Personal Access Token**
   Generate a token at https://github.com/settings/tokens (classic, repo scope).
   ```bash
   git clone https://gimbernat13:<YOUR_TOKEN>@github.com/gimbernat13/slop-detector.git
   cd slop-detector
   ```

   **Option C: Generate Key on VPS (If Agent Forwarding fails)**
   1. Run `ssh-keygen -t ed25519 -C "vps-deploy"` (Press Enter for all).
   2. Run `cat ~/.ssh/id_ed25519.pub`.
   3. Copy the output and add it to [Deploy Keys](https://github.com/gimbernat13/slop-detector/settings/keys).
   4. Run `git clone git@github.com:gimbernat13/slop-detector.git`.

2. **Create/Update `.env` file**:
   Ensure you have a `.env` file in the root directory with the necessary environment variables.
   ```bash
   cp .env.example .env
   nano .env
   ```

3. **Build and Run**:
   ```bash
   docker-compose up -d --build
   ```

4. **Verify**:
   Access the application at `http://<your-vps-ip>:3000`.

## Troubleshooting

- **Logs**:
  ```bash
  docker-compose logs -f web
  ```
- **Rebuild**:
  If you change dependencies, force a rebuild:
  ```bash
  docker-compose build --no-cache
  ```
