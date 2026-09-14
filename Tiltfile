# Start ../backend separately with tilt up for CNGEI and Keycloak.
docker_compose('compose.yaml')
local_resource('bravely-migrate', cmd='npm run db:migrate', deps=['migrations', 'scripts/migrate.ts'], resource_deps=['bravely-db'])
local_resource('bravely', serve_cmd='npm run dev', deps=['app', 'lib', 'package.json'], resource_deps=['bravely-migrate'], links=['http://localhost:3000'])
