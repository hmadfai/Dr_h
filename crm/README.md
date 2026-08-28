# Training in Data — Apprenticeship CRM

Staff CRM for **Training in Data** (Paddington, London) covering student recruitment and the administration of **UK Government-funded apprenticeships**.

The interface uses the trainingindata.com palette: navy `#042f7e`, accent `#2867B2` / `#0844ad`, light grey `#f6f6f6`, and Poppins.

## What it does

- **Student recruitment pipeline** from enquiry to DAS reservation and enrolment
- **Learners / prospects** with a mandatory **workplace line manager**
- **Employer organisations** with a mandatory **Digital Apprenticeship Service (DAS) account holder**
- **Programme progress** (reviews, OTJ hours, gateway / EPA) with automatic OTJ shortfall anomalies
- **Anomaly register** (funding, attendance, safeguarding, data quality, missed reviews)
- **Dropouts and re-engagement** — cases, ILR withdrawal reasons, and a log of every attempt to bring the learner back (calls, emails, employer contact)
- **Email** — templates and an encrypted outbox; connect SMTP in Settings (Office 365 / Google Workspace / any SMTP). Without SMTP, sends are stored as simulated messages so the workflow can still be trained
- **UK GDPR** — consent register, 30-day rights-request clock, erasure / anonymisation, and a **people requiring removal** suppression list so erased individuals cannot be re-imported
- **Encryption at rest** — AES-256-GCM for emails, phones, addresses, NI numbers, ULNs, DAS IDs and mail bodies; HMAC indexes for lookup; bcrypt for passwords; staff audit log

## Quick start

```bash
cd crm
npm install
npm run setup    # writes .env keys, creates SQLite DB, seeds demo data
npm run dev      # http://localhost:3000
```

Demo staff logins (password `Apprentice!2026`):

| Email | Role |
| --- | --- |
| admin@trainingindata.com | Administrator |
| recruitment@trainingindata.com | Student recruitment |
| tutor@trainingindata.com | Tutor / coach |
| compliance@trainingindata.com | GDPR & funding compliance |

## Email connection

Open **Settings** as an administrator and enter SMTP host, port, username and password. Credentials are stored encrypted. From addresses default to `crm@trainingindata.com`.

Templates cover recruitment, line managers, DAS holders, progress reviews, dropout re-engagement, welcome-back, and data-rights acknowledgements. Compose from the Email workspace or from a learner / dropout case.

## GDPR notes (training use)

This CRM is designed around UK GDPR and apprenticeship funding practice:

- Privacy notice version `TiD-PP-2026-08-19` (aligned with trainingindata.com)
- Lawful bases recorded per purpose (contract, legal obligation, consent, explicit consent)
- Erasure of a **funded** apprentice anonymises identifiers but retains statistical / ILR evidence for ESFA audit (current year + 6)
- Erasure of a **prospect** removes personal data and writes a hashed suppression record
- Subject access / portability export: `GET /api/gdpr/export/{learnerId}` (authenticated)
- Production use still needs a legal review, TLS termination, key management (KMS), and a DPIA

Do not commit `.env`. Rotate `ENCRYPTION_KEY`, `HMAC_KEY` and `AUTH_SECRET` for any real deployment.

## Tests

```bash
npm test
npm run lint
npm run build
```
