# Public Academy pages live under a path, not a subdomain

Brochure and conversion URLs are `/{something}/{academy-slug}/…` on one domain. That is one certificate and no wildcard DNS. Subdomains or custom domains wait until an Academy needs to look like its own site; changing this later means redirects, not a rewrite of tenancy.
