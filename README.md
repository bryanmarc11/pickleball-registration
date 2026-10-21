# Pickleball Tournament Registration

Original green/yellow registration frontend integrated with:

- GitHub source control
- Vercel hosting and registration API
- Supabase database storage

## Frontend preservation

The original HTML/CSS is retained.

Only these HTML changes are required:

1. Set form action to /api/register.
2. Add the hidden submitStatus paragraph.
3. Replace the original inline JavaScript with registration.js.

Do not load the old submission script and registration.js together.

## Field compatibility

The backend matches the original fields:

- team_name
- division
- dupr_bracket
- club
- p1_name, p1_gender, p1_dob, p1_phone, p1_email
- p1_dupr, p1_dupr_id, p1_shirt
- p2_name, p2_gender, p2_dob, p2_phone, p2_email
- p2_dupr, p2_dupr_id, p2_shirt
- emergency_name, emergency_phone, emergency_relationship
- payment_ack
- waiver
- notes

Player 1 email is required.
Player 2 email is optional.

Mobile numbers must contain exactly 11 digits starting with 09.

## Local setup

Install Node.js 22 and Git.

In the project directory:

```bash
npm install
npm run check
```

Copy .env.example to .env.local and enter real Supabase credentials.

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

macOS/Linux:

```bash
cp .env.example .env.local
```

Set REGISTRATION_OPEN=true for testing.

## Database setup

1. Open the Supabase project.
2. Open SQL Editor.
3. Run supabase/schema.sql.
4. Confirm the pickleball_registrations table exists.

Use the server secret or legacy service_role key.
Do not use an anon or publishable key for the backend.

Keep RLS enabled.

The SQL matches the earlier project schema. It does not migrate an
unrelated table that has different columns.

## Run locally

```bash
npm run dev
```

Follow the Vercel CLI prompts.

Use the local URL printed in the terminal.

Do not open the HTML by double-clicking it.
A static file server alone does not run the registration API.

## Upload to GitHub

Create an empty GitHub repository without an initial README.

Run:

```bash
git init
git add .
git commit -m "Preserve original registration UI and add Supabase API"
git branch -M main
git remote add origin [https://github.com/YOUR_USERNAME/pickleball-registration.git](https://github.com/YOUR_USERNAME/pickleball-registration.git)
git push -u origin main
```

Replace YOUR_USERNAME.

Commit package-lock.json after npm install.

Confirm .env.local is ignored:

```bash
git check-ignore .env.local
```

## Deploy to Vercel

1. Add New → Project.
2. Import the GitHub repository.
3. Framework Preset: Other.
4. Root Directory: project root, not public.
5. Output Directory: public.
6. No frontend build command.
7. Add the environment variables.
8. Deploy.

Required production variables:

- SUPABASE_URL
- SUPABASE_SECRET_KEY
- REGISTRATION_OPEN=true

Legacy alternative:

Use SUPABASE_SERVICE_ROLE_KEY instead of SUPABASE_SECRET_KEY.

Both credentials must belong to the same Supabase project.

Redeploy after changing deployment environment variables.

## Verify storage

Submit a complete test registration.

Then open:

Supabase → Table Editor → pickleball_registrations

Confirm:

- A row was created.
- form_data contains both players.
- payment_status is unpaid.
- The page shows the same registration reference as the database ID.

A success message is shown only after the API confirms storage.

## Organizer query

Run in the Supabase SQL Editor:

```sql
select
  id,
  created_at,
  team_name,
  division,
  dupr_bracket,
  form_data ->> 'club' as club,
  form_data ->> 'p1_name' as captain,
  form_data ->> 'p1_email' as captain_email,
  form_data ->> 'p1_phone' as captain_phone,
  form_data ->> 'p1_shirt' as captain_shirt,
  form_data ->> 'p2_name' as partner,
  form_data ->> 'p2_shirt' as partner_shirt,
  fee_due_php,
  payment_status
from public.pickleball_registrations
order by created_at desc;
```

Do not publish registration records or exports.

## Retry behavior

If a request times out or its result is uncertain:

- Stay on the same page.
- Click Register Team again.
- The same submission ID and original payload are resent.

Changes made after an uncertain attempt are not included in that retry.

Refreshing the page loses the in-memory submission ID.

If the page was refreshed after an uncertain result, ask the organizer
to check for the registration before submitting again.

This prevents duplicate rows for the same submission ID.
It does not prevent a team from registering again using a new ID.

## Payment

The application does not process payments.

The fee defaults to PHP 1,000.
Payment status starts as unpaid.

The organizer must verify payment separately.

To change the fee, update the API constant and original HTML wording.

## Troubleshooting

### Registration is closed

Set REGISTRATION_OPEN=true in the correct Vercel environment.
Redeploy.

### Generic save error

Find REGISTRATION_FAILED in Vercel Logs using the displayed reference.

Check:

- Environment-variable names
- Supabase project URL
- Server secret
- Whether schema.sql was run
- Whether the table columns match

Never share complete credentials or registrant information.

### RLS error

Verify the backend uses a secret or service_role key.

Do not attach a user Auth session to this dedicated backend client.

Do not disable RLS or create unrestricted public policies.

### API 404

Confirm api/register.js is at the project root under api/.

Vercel Root Directory must not be public/.

### No player sections

Confirm registration.js is located beside the HTML inside public/.

Confirm the HTML loads ./registration.js.

Check the browser console for errors.

## Before public launch

The original frontend has been preserved, including its wording.

Before launch:

- Replace the placeholder venue and contact number.
- Verify the tournament date and deadline.
- Review the original waiver with the organizer.
- Review its combined participation and photo/video consent.
- Publish an appropriate privacy notice and retention policy.
- Decide whether minors may register and implement guardian consent if needed.
- Add CAPTCHA and persistent rate limiting.
- Verify all workflows with a test database.

The displayed registration deadline is not automatically enforced.
Use REGISTRATION_OPEN=false and redeploy to close registration.

DUPR values and IDs are collected but not externally verified.
No minimum age or guardian workflow is implemented.

## Testing limits

npm run check checks JavaScript syntax only.

Live database storage and deployment must be tested using your own
Supabase project and Vercel account.