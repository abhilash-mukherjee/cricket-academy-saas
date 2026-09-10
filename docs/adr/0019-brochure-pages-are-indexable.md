# Academy brochure pages are search-engine indexable

Each Academy brochure at `/a/{academy-slug}` is a public, server-rendered page with proper metadata (title from Academy name, description from tagline) and included in a sitemap. Staff routes under `/app/…` are not indexed. Ranking for a given Academy name is not guaranteed, but the page is eligible to appear when someone searches for that Academy (for example "Blitz Cricket Academy" → `example.com/a/blitz-academy`). Deactivated Academies return not found and are removed from the sitemap.
