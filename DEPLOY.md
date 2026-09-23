# Deploy runbook — betamods.com

Production uses hard free-tier resources: **Oracle Cloud Always Free** for the
web app and scanner, **Neon Free** for Postgres, and **Cloudflare Free** for DNS.
No paid Railway service or usage-billed R2 storage is required.

## Topology

```text
Internet -> betamods.com -> Caddy (:80/:443)
                              -> Next.js app (:3000)
                                   -> scan wrapper (:3311, same container)
                                        -> ClamAV (:3310, private network)
                                   -> Neon Postgres
                                   -> /app/data (persistent Docker volume)
```

Uploads remain **quarantine -> scan -> serve**. Both quarantine and clean files
live on the persistent `app-data` volume; nothing is promoted until ClamAV
returns clean. If the scanner is unavailable, uploads return 503.

## 1. Oracle Always Free VM

- Home region: US Midwest (Chicago)
- Name: `betamods-prod`
- Shape: `VM.Standard.A1.Flex` marked **Always Free-eligible**
- Size: 1 OCPU / 6 GB RAM
- Boot volume: default 50 GB (within the Always Free block-volume allowance)
- Public subnet and public IPv4 address
- Existing `id_ed25519_betamods.pub` public key
- Ingress: TCP 22, 80, and 443 only

Do not click **Upgrade**. A Free Tier tenancy cannot turn traffic growth into a
compute bill; it reaches resource limits instead.

## 2. Install Docker

Copy the repository to the VM, then run:

```bash
bash deploy/oracle/install-docker.sh
```

The script installs Docker Engine and the Compose plugin from Docker's CentOS
repository, which is compatible with Oracle Linux 9 on Ampere ARM.

## 3. Production environment

Create `.env.production` on the VM from `.env.production.example`. It needs only
the Neon pooled `DATABASE_URL` and `SESSION_SECRET`; production storage and scan
addresses are fixed safely in `compose.oracle.yml`.

Do not copy `CLOUDFLARE_API_TOKEN`, R2 credentials, development Nexus keys, or
the local database backup URL to the VM.

## 4. Start and verify

```bash
sudo docker compose -f compose.oracle.yml up -d --build
sudo docker compose -f compose.oracle.yml ps
sudo docker compose -f compose.oracle.yml logs --tail=100 app clamav caddy
```

The first ClamAV start downloads signatures and can take several minutes.
Verify locally on the VM before changing DNS:

```bash
curl --fail http://127.0.0.1:3000/
```

Then run the real upload checks: a benign build must be stored and downloadable,
and an EICAR test file must be rejected.

## 5. DNS and TLS

After the app and ClamAV are healthy:

1. Cloudflare DNS: `A @ -> <Oracle public IPv4>`, DNS-only initially.
2. Add `CNAME www -> @`, DNS-only initially.
3. Allow TCP 80 and 443 in the Oracle VCN security list and host firewall.
4. Caddy obtains Let's Encrypt certificates automatically.
5. Verify `https://betamods.com`, then optionally enable Cloudflare proxying
   with SSL/TLS mode **Full (strict)**.

## 6. Backups and limits

- The Docker volume survives container rebuilds but not accidental VM/volume
  deletion. Add an Always Free block-volume backup after launch.
- Keep total Oracle boot + block volumes within the 200 GB Always Free pool.
- Neon Free and the Oracle VM stop or throttle at their limits rather than
  silently scaling this deployment onto paid resources.
- Leave the Railway project in place until this deployment passes the upload
  tests; delete it afterward to avoid confusion.
